-- Fixes: the Guesser could read the answer. The host's client used to draw all 9 target
-- words and write them into rooms.data (`targetWord`, `gameWords`), which every player in
-- the room receives — so anyone watching network traffic saw every answer, and the host
-- (who is also the Guesser for 3 rounds) drew them in the first place.
--
-- Now the server owns the words end to end:
--   * `words`         — the word list, readable by no client (seeded below).
--   * `game_decks`    — each game's 9 drawn words, readable by no client.
--   * `round_secrets` — one row per round; only that round's two Knowers can read it.
-- Starting, advancing and resolving rounds move into SECURITY DEFINER functions, so no
-- client ever has to know a word it shouldn't. A correct/wrong guess can only be recorded
-- by the validate-guess edge function (service role), which judges it server-side.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists words (
  word text primary key,
  category text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard'))
);
alter table words enable row level security; -- no policies: definer functions only

create table if not exists game_decks (
  code text primary key references rooms (code) on delete cascade,
  words jsonb not null -- [{ "word": ..., "category": ... }] x 9, in round order
);
alter table game_decks enable row level security; -- no policies: definer functions only

create table if not exists round_secrets (
  code text not null references rooms (code) on delete cascade,
  round int not null,
  target_word text not null,
  guesser_uid text not null,
  primary key (code, round)
);
alter table round_secrets enable row level security;

-- Room members may read a round's word unless they are that round's Guesser.
create policy "knowers read round secret" on round_secrets
  for select using (
    auth.role() = 'authenticated'
    and auth.uid()::text <> guesser_uid
    and exists (
      select 1 from rooms r
      where r.code = round_secrets.code
        and (r.data -> 'players') ? auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- 3 Easy + 4 Medium + 2 Hard, no repeats, spanning >= 3 categories, shuffled —
-- the same rules generateGame() enforced client-side.
create or replace function _draw_deck()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  picks jsonb;
begin
  for attempt in 1..25 loop
    select jsonb_agg(jsonb_build_object('word', word, 'category', category) order by random())
    into picks
    from (
      (select word, category from words where difficulty = 'easy' order by random() limit 3)
      union all
      (select word, category from words where difficulty = 'medium' order by random() limit 4)
      union all
      (select word, category from words where difficulty = 'hard' order by random() limit 2)
    ) drawn;

    exit when (
      select count(distinct e ->> 'category') from jsonb_array_elements(picks) e
    ) >= 3;
  end loop;
  return picks; -- astronomically unlikely to still be < 3 categories; accept it if so
end;
$$;

-- Writes round p_round's state: roles (Guesser rotates through playerOrder; Knowers
-- alternate who goes first by round parity), the category for everyone, and the
-- target word into round_secrets only.
create or replace function _setup_round(p_code text, p_round int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  deck_entry jsonb;
  play_order jsonb;
  guesser text;
  knowers text[];
  players jsonb;
  player_uid text;
begin
  select data into room_data from rooms where code = p_code for update;
  select words -> (p_round - 1) into deck_entry from game_decks where code = p_code;
  if deck_entry is null then
    raise exception 'no word drawn for room % round %', p_code, p_round;
  end if;

  play_order := room_data -> 'playerOrder';
  guesser := play_order ->> ((p_round - 1) % jsonb_array_length(play_order));
  select array_agg(uid order by ord) into knowers
  from jsonb_array_elements_text(play_order) with ordinality as t(uid, ord)
  where uid <> guesser;

  players := room_data -> 'players';
  for player_uid in select jsonb_object_keys(players) loop
    players := jsonb_set(
      players,
      array[player_uid, 'role'],
      to_jsonb(case when player_uid = guesser then 'guesser' else 'knower' end)
    );
  end loop;

  insert into round_secrets (code, round, target_word, guesser_uid)
  values (p_code, p_round, deck_entry ->> 'word', guesser)
  on conflict (code, round) do update
    set target_word = excluded.target_word, guesser_uid = excluded.guesser_uid;

  update rooms
  set data = (room_data - 'targetWord' - 'gameWords') || jsonb_build_object(
    'status', 'playing',
    'round', p_round,
    'category', deck_entry ->> 'category',
    'secondsRemaining', 30,
    'activeKnowerUid', case when p_round % 2 = 1 then knowers[1] else knowers[2] end,
    'guesserUid', guesser,
    'players', players,
    'chain', null,
    'typing', '{}'::jsonb,
    'linkChecks', '{}'::jsonb,
    'guessPending', null
  )
  where code = p_code;
end;
$$;

-- Records the round in history (revealing the word now that it's over) and shows
-- Resolution. No-op if the round already ended — e.g. the timer and a guess racing.
create or replace function _resolve_round(p_code text, p_round int, p_outcome text, p_guess text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  target text;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null
    or room_data ->> 'status' <> 'playing'
    or (room_data ->> 'round')::int <> p_round then
    return false;
  end if;

  select target_word into target from round_secrets where code = p_code and round = p_round;

  update rooms
  set data = jsonb_set(
    room_data || jsonb_build_object('status', 'resolution', 'guessPending', null),
    array['history', p_round::text],
    jsonb_build_object(
      'round', p_round,
      'category', room_data ->> 'category',
      'targetWord', target,
      'chain', coalesce(room_data -> 'chain', '[]'::jsonb),
      'guesserUid', room_data ->> 'guesserUid',
      'outcome', p_outcome,
      'guess', p_guess,
      'linkChecks', coalesce(room_data -> 'linkChecks', '{}'::jsonb)
    ),
    true
  )
  where code = p_code;
  return true;
end;
$$;

revoke all on function _draw_deck() from public, anon, authenticated;
revoke all on function _setup_round(text, int) from public, anon, authenticated;
revoke all on function _resolve_round(text, int, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client-callable game flow
-- ---------------------------------------------------------------------------

create or replace function _require_host(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null then
    raise exception 'room % not found', p_code;
  end if;
  if room_data ->> 'hostUid' <> auth.uid()::text then
    raise exception 'only the host can do that';
  end if;
  return room_data;
end;
$$;
revoke all on function _require_host(text) from public, anon, authenticated;

-- Host, once, leaving the lobby: shuffles play order, draws the deck, sets up round 1.
create or replace function start_game(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  play_order jsonb;
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'lobby' then
    return; -- already started (e.g. a retried call) — nothing to do
  end if;

  select jsonb_agg(uid order by random()) into play_order
  from jsonb_object_keys(room_data -> 'players') uid;
  if jsonb_array_length(play_order) <> 3 then
    raise exception 'Yappa needs exactly 3 players';
  end if;

  insert into game_decks (code, words) values (p_code, _draw_deck())
  on conflict (code) do update set words = excluded.words;
  delete from round_secrets where code = p_code;

  update rooms
  set data = room_data || jsonb_build_object(
    'playerOrder', play_order,
    'maxRounds', 9,
    'history', '{}'::jsonb
  )
  where code = p_code;

  perform _setup_round(p_code, 1);
end;
$$;

-- Host, from Round Resolution: next round, or Game End after the last one.
-- p_from_round makes a double-tap / auto-advance race a no-op instead of skipping a round.
create or replace function advance_round(p_code text, p_from_round int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'resolution' or (room_data ->> 'round')::int <> p_from_round then
    return;
  end if;

  if p_from_round >= (room_data ->> 'maxRounds')::int then
    update rooms set data = data || '{"status": "gameover"}'::jsonb where code = p_code;
  else
    perform _setup_round(p_code, p_from_round + 1);
  end if;
end;
$$;

-- Host's timer hit zero.
create or replace function resolve_round_timeout(p_code text, p_round int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_host(p_code);
  perform _resolve_round(p_code, p_round, 'lost-timeout', null);
end;
$$;

-- Only the validate-guess edge function (service role) may record a guess outcome, so a
-- client can't simply declare its own guess correct.
create or replace function resolve_round_guess(p_code text, p_round int, p_guess text, p_correct boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return _resolve_round(p_code, p_round, case when p_correct then 'won' else 'lost-guess' end, p_guess);
end;
$$;

revoke all on function start_game(text) from public, anon;
revoke all on function advance_round(text, int) from public, anon;
revoke all on function resolve_round_timeout(text, int) from public, anon;
revoke all on function resolve_round_guess(text, int, text, boolean) from public, anon, authenticated;
grant execute on function start_game(text) to authenticated;
grant execute on function advance_round(text, int) to authenticated;
grant execute on function resolve_round_timeout(text, int) to authenticated;
grant execute on function resolve_round_guess(text, int, text, boolean) to service_role;

-- Rooms created before this migration carry the old client-drawn answers — drop them.
update rooms set data = data - 'targetWord' - 'gameWords'
where data ? 'targetWord' or data ? 'gameWords';

-- ---------------------------------------------------------------------------
-- Word list (generated from the former src/lib/wordList.ts — 251 words)
-- ---------------------------------------------------------------------------

insert into words (word, category, difficulty) values
  ('Umbrella', 'Objects', 'easy'),
  ('Backpack', 'Objects', 'easy'),
  ('Telephone', 'Objects', 'easy'),
  ('Television', 'Objects', 'easy'),
  ('Bicycle', 'Objects', 'easy'),
  ('Candle', 'Objects', 'easy'),
  ('Blanket', 'Objects', 'easy'),
  ('Pillow', 'Objects', 'easy'),
  ('Mirror', 'Objects', 'easy'),
  ('Hammer', 'Objects', 'easy'),
  ('Ladder', 'Objects', 'easy'),
  ('Scissors', 'Objects', 'easy'),
  ('Camera', 'Objects', 'easy'),
  ('Guitar', 'Objects', 'easy'),
  ('Balloon', 'Objects', 'easy'),
  ('Bucket', 'Objects', 'easy'),
  ('Broom', 'Objects', 'easy'),
  ('Telescope', 'Objects', 'medium'),
  ('Compass', 'Objects', 'medium'),
  ('Lantern', 'Objects', 'medium'),
  ('Hourglass', 'Objects', 'medium'),
  ('Parachute', 'Objects', 'medium'),
  ('Trampoline', 'Objects', 'medium'),
  ('Saxophone', 'Objects', 'medium'),
  ('Typewriter', 'Objects', 'medium'),
  ('Microscope', 'Objects', 'medium'),
  ('Thermometer', 'Objects', 'medium'),
  ('Wheelbarrow', 'Objects', 'medium'),
  ('Chandelier', 'Objects', 'medium'),
  ('Accordion', 'Objects', 'medium'),
  ('Harmonica', 'Objects', 'medium'),
  ('Binoculars', 'Objects', 'medium'),
  ('Wristwatch', 'Objects', 'medium'),
  ('Suitcase', 'Objects', 'medium'),
  ('Anchor', 'Objects', 'medium'),
  ('Magnet', 'Objects', 'medium'),
  ('Flashlight', 'Objects', 'medium'),
  ('Corkscrew', 'Objects', 'medium'),
  ('Pitchfork', 'Objects', 'medium'),
  ('Bagpipes', 'Objects', 'medium'),
  ('Metronome', 'Objects', 'hard'),
  ('Gyroscope', 'Objects', 'hard'),
  ('Barometer', 'Objects', 'hard'),
  ('Sextant', 'Objects', 'hard'),
  ('Astrolabe', 'Objects', 'hard'),
  ('Periscope', 'Objects', 'hard'),
  ('Harpsichord', 'Objects', 'hard'),
  ('Abacus', 'Objects', 'hard'),
  ('Stethoscope', 'Objects', 'hard'),
  ('Kaleidoscope', 'Objects', 'hard'),
  ('Xylophone', 'Objects', 'hard'),
  ('Elephant', 'Animals', 'easy'),
  ('Giraffe', 'Animals', 'easy'),
  ('Penguin', 'Animals', 'easy'),
  ('Dolphin', 'Animals', 'easy'),
  ('Kangaroo', 'Animals', 'easy'),
  ('Zebra', 'Animals', 'easy'),
  ('Rabbit', 'Animals', 'easy'),
  ('Squirrel', 'Animals', 'easy'),
  ('Butterfly', 'Animals', 'easy'),
  ('Octopus', 'Animals', 'easy'),
  ('Crocodile', 'Animals', 'easy'),
  ('Flamingo', 'Animals', 'easy'),
  ('Peacock', 'Animals', 'easy'),
  ('Tortoise', 'Animals', 'easy'),
  ('Hedgehog', 'Animals', 'easy'),
  ('Raccoon', 'Animals', 'easy'),
  ('Otter', 'Animals', 'easy'),
  ('Chameleon', 'Animals', 'medium'),
  ('Porcupine', 'Animals', 'medium'),
  ('Jellyfish', 'Animals', 'medium'),
  ('Rhinoceros', 'Animals', 'medium'),
  ('Hippopotamus', 'Animals', 'medium'),
  ('Orangutan', 'Animals', 'medium'),
  ('Chimpanzee', 'Animals', 'medium'),
  ('Armadillo', 'Animals', 'medium'),
  ('Platypus', 'Animals', 'medium'),
  ('Mongoose', 'Animals', 'medium'),
  ('Meerkat', 'Animals', 'medium'),
  ('Wolverine', 'Animals', 'medium'),
  ('Pelican', 'Animals', 'medium'),
  ('Woodpecker', 'Animals', 'medium'),
  ('Hummingbird', 'Animals', 'medium'),
  ('Scorpion', 'Animals', 'medium'),
  ('Tarantula', 'Animals', 'medium'),
  ('Seahorse', 'Animals', 'medium'),
  ('Starfish', 'Animals', 'medium'),
  ('Stingray', 'Animals', 'medium'),
  ('Anteater', 'Animals', 'medium'),
  ('Albatross', 'Animals', 'medium'),
  ('Toucan', 'Animals', 'medium'),
  ('Salamander', 'Animals', 'hard'),
  ('Pangolin', 'Animals', 'hard'),
  ('Narwhal', 'Animals', 'hard'),
  ('Capybara', 'Animals', 'hard'),
  ('Okapi', 'Animals', 'hard'),
  ('Axolotl', 'Animals', 'hard'),
  ('Wildebeest', 'Animals', 'hard'),
  ('Aardvark', 'Animals', 'hard'),
  ('Echidna', 'Animals', 'hard'),
  ('Basilisk', 'Animals', 'hard'),
  ('Cassowary', 'Animals', 'hard'),
  ('Castle', 'Places', 'easy'),
  ('Library', 'Places', 'easy'),
  ('Museum', 'Places', 'easy'),
  ('Stadium', 'Places', 'easy'),
  ('Aquarium', 'Places', 'easy'),
  ('Lighthouse', 'Places', 'easy'),
  ('Playground', 'Places', 'easy'),
  ('Bakery', 'Places', 'easy'),
  ('Hospital', 'Places', 'easy'),
  ('School', 'Places', 'easy'),
  ('Farmhouse', 'Places', 'easy'),
  ('Treehouse', 'Places', 'easy'),
  ('Windmill', 'Places', 'easy'),
  ('Harbor', 'Places', 'easy'),
  ('Fountain', 'Places', 'easy'),
  ('Bridge', 'Places', 'easy'),
  ('Volcano', 'Places', 'easy'),
  ('Cathedral', 'Places', 'medium'),
  ('Skyscraper', 'Places', 'medium'),
  ('Observatory', 'Places', 'medium'),
  ('Greenhouse', 'Places', 'medium'),
  ('Warehouse', 'Places', 'medium'),
  ('Amphitheater', 'Places', 'medium'),
  ('Monastery', 'Places', 'medium'),
  ('Courtyard', 'Places', 'medium'),
  ('Boardwalk', 'Places', 'medium'),
  ('Marketplace', 'Places', 'medium'),
  ('Planetarium', 'Places', 'medium'),
  ('Racetrack', 'Places', 'medium'),
  ('Vineyard', 'Places', 'medium'),
  ('Orchard', 'Places', 'medium'),
  ('Canyon', 'Places', 'medium'),
  ('Glacier', 'Places', 'medium'),
  ('Waterfall', 'Places', 'medium'),
  ('Rainforest', 'Places', 'medium'),
  ('Peninsula', 'Places', 'medium'),
  ('Archipelago', 'Places', 'medium'),
  ('Arboretum', 'Places', 'medium'),
  ('Citadel', 'Places', 'medium'),
  ('Mausoleum', 'Places', 'hard'),
  ('Sanatorium', 'Places', 'hard'),
  ('Aqueduct', 'Places', 'hard'),
  ('Catacombs', 'Places', 'hard'),
  ('Colosseum', 'Places', 'hard'),
  ('Fjord', 'Places', 'hard'),
  ('Isthmus', 'Places', 'hard'),
  ('Prairie', 'Places', 'hard'),
  ('Tundra', 'Places', 'hard'),
  ('Savanna', 'Places', 'hard'),
  ('Steppe', 'Places', 'hard'),
  ('Pineapple', 'Food & Drink', 'easy'),
  ('Watermelon', 'Food & Drink', 'easy'),
  ('Strawberry', 'Food & Drink', 'easy'),
  ('Chocolate', 'Food & Drink', 'easy'),
  ('Pancake', 'Food & Drink', 'easy'),
  ('Popcorn', 'Food & Drink', 'easy'),
  ('Sandwich', 'Food & Drink', 'easy'),
  ('Hamburger', 'Food & Drink', 'easy'),
  ('Spaghetti', 'Food & Drink', 'easy'),
  ('Cupcake', 'Food & Drink', 'easy'),
  ('Doughnut', 'Food & Drink', 'easy'),
  ('Lemonade', 'Food & Drink', 'easy'),
  ('Avocado', 'Food & Drink', 'easy'),
  ('Broccoli', 'Food & Drink', 'easy'),
  ('Pretzel', 'Food & Drink', 'easy'),
  ('Waffle', 'Food & Drink', 'easy'),
  ('Coconut', 'Food & Drink', 'easy'),
  ('Blueberry', 'Food & Drink', 'medium'),
  ('Cinnamon', 'Food & Drink', 'medium'),
  ('Milkshake', 'Food & Drink', 'medium'),
  ('Meatball', 'Food & Drink', 'medium'),
  ('Pepperoni', 'Food & Drink', 'medium'),
  ('Cheesecake', 'Food & Drink', 'medium'),
  ('Marshmallow', 'Food & Drink', 'medium'),
  ('Grapefruit', 'Food & Drink', 'medium'),
  ('Cantaloupe', 'Food & Drink', 'medium'),
  ('Applesauce', 'Food & Drink', 'medium'),
  ('Eggplant', 'Food & Drink', 'medium'),
  ('Cornbread', 'Food & Drink', 'medium'),
  ('Honeycomb', 'Food & Drink', 'medium'),
  ('Asparagus', 'Food & Drink', 'medium'),
  ('Artichoke', 'Food & Drink', 'medium'),
  ('Cauliflower', 'Food & Drink', 'medium'),
  ('Zucchini', 'Food & Drink', 'medium'),
  ('Casserole', 'Food & Drink', 'medium'),
  ('Guacamole', 'Food & Drink', 'medium'),
  ('Croissant', 'Food & Drink', 'medium'),
  ('Baguette', 'Food & Drink', 'medium'),
  ('Smoothie', 'Food & Drink', 'medium'),
  ('Enchilada', 'Food & Drink', 'hard'),
  ('Quesadilla', 'Food & Drink', 'hard'),
  ('Butterscotch', 'Food & Drink', 'hard'),
  ('Gingerbread', 'Food & Drink', 'hard'),
  ('Buttermilk', 'Food & Drink', 'hard'),
  ('Ratatouille', 'Food & Drink', 'hard'),
  ('Bouillabaisse', 'Food & Drink', 'hard'),
  ('Prosciutto', 'Food & Drink', 'hard'),
  ('Bruschetta', 'Food & Drink', 'hard'),
  ('Empanada', 'Food & Drink', 'hard'),
  ('Tiramisu', 'Food & Drink', 'hard'),
  ('Basketball', 'Sports', 'easy'),
  ('Football', 'Sports', 'easy'),
  ('Baseball', 'Sports', 'easy'),
  ('Volleyball', 'Sports', 'easy'),
  ('Swimming', 'Sports', 'easy'),
  ('Bowling', 'Sports', 'easy'),
  ('Boxing', 'Sports', 'easy'),
  ('Skateboarding', 'Sports', 'easy'),
  ('Surfing', 'Sports', 'easy'),
  ('Skiing', 'Sports', 'easy'),
  ('Cycling', 'Sports', 'easy'),
  ('Wrestling', 'Sports', 'easy'),
  ('Golf', 'Sports', 'easy'),
  ('Tennis', 'Sports', 'easy'),
  ('Hockey', 'Sports', 'easy'),
  ('Gymnastics', 'Sports', 'easy'),
  ('Badminton', 'Sports', 'medium'),
  ('Snowboarding', 'Sports', 'medium'),
  ('Archery', 'Sports', 'medium'),
  ('Fencing', 'Sports', 'medium'),
  ('Rowing', 'Sports', 'medium'),
  ('Sailing', 'Sports', 'medium'),
  ('Diving', 'Sports', 'medium'),
  ('Cricket', 'Sports', 'medium'),
  ('Rugby', 'Sports', 'medium'),
  ('Karate', 'Sports', 'medium'),
  ('Triathlon', 'Sports', 'medium'),
  ('Marathon', 'Sports', 'medium'),
  ('Weightlifting', 'Sports', 'medium'),
  ('Powerlifting', 'Sports', 'medium'),
  ('Racquetball', 'Sports', 'medium'),
  ('Curling', 'Sports', 'medium'),
  ('Lacrosse', 'Sports', 'medium'),
  ('Handball', 'Sports', 'medium'),
  ('Softball', 'Sports', 'medium'),
  ('Paintball', 'Sports', 'medium'),
  ('Dodgeball', 'Sports', 'medium'),
  ('Trampolining', 'Sports', 'medium'),
  ('Taekwondo', 'Sports', 'hard'),
  ('Pentathlon', 'Sports', 'hard'),
  ('Decathlon', 'Sports', 'hard'),
  ('Biathlon', 'Sports', 'hard'),
  ('Parkour', 'Sports', 'hard'),
  ('Bobsledding', 'Sports', 'hard'),
  ('Orienteering', 'Sports', 'hard'),
  ('Steeplechase', 'Sports', 'hard'),
  ('Dressage', 'Sports', 'hard'),
  ('Waterpolo', 'Sports', 'hard'),
  ('Canoeing', 'Sports', 'hard')
on conflict (word) do nothing;
