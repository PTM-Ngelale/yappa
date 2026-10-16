-- Yappa: 3 to 5 players.
--
-- A game was exactly 3 players: one Guesser and two Knowers taking turns. Now 3 to 5 can
-- play. Each round still has one Guesser; everyone else is a Knower, and the Knowers take
-- turns in play order (skipping the Guesser), so with 4 players three Knowers go round in
-- a circle.
--   * Rounds: everyone guesses the same number of times. 3 players play 9 rounds (3 guesses
--     each), 4 play 8 and 5 play 10 (2 guesses each), so a game stays around 12-15 minutes.
--   * The deck splits the rounds into thirds, easiest first: 9 is 3/3/3, 8 is 3/3/2, 10 is
--     4/3/3.
--   * Private rooms take up to 5. Play online still matches 3 strangers and starts when the
--     third arrives, and a lobby can only go public while it has fewer than 3 players.
--   * Two players joining with the same avatar colour: the newcomer gets a free one, so
--     every Knower's clues stay tellable apart in the feed.
-- Leaving mid-game still ends it for everyone.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- Player counts in one place. The app mirrors these in src/game/players.ts.
create or replace function _player_limits()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('min', 3, 'max', 5, 'public', 3);
$$;

-- Rounds for a game of p_players: everyone guesses 3 times with 3 players, twice with more.
create or replace function _rounds_for(p_players int)
returns int
language sql
immutable
as $$
  select case when p_players <= 3 then p_players * 3 else p_players * 2 end;
$$;

-- The app's avatar colours (src/lib/avatarColors.ts).
create or replace function _avatar_colors()
returns text[]
language sql
immutable
as $$
  select array['#E57373', '#FF8A65', '#FFB74D', '#81C784', '#4DB6AC', '#4FC3F7', '#9575CD', '#F06292'];
$$;

revoke all on function _player_limits() from public, anon, authenticated;
revoke all on function _rounds_for(int) from public, anon, authenticated;
revoke all on function _avatar_colors() from public, anon, authenticated;

-- p_player's colour, or the first free one from the palette if someone else in p_players
-- already has it (kept as is if every colour is taken).
create or replace function _free_color(p_players jsonb, p_player jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  taken text[];
  free text;
begin
  select coalesce(array_agg(upper(value ->> 'avatarColor')), '{}') into taken
  from jsonb_each(coalesce(p_players, '{}'::jsonb))
  where key <> p_player ->> 'uid';
  if not (upper(p_player ->> 'avatarColor') = any(taken)) then
    return p_player;
  end if;
  select c into free from unnest(_avatar_colors()) with ordinality as t(c, ord)
  where not (upper(c) = any(taken))
  order by ord limit 1;
  if free is null then
    return p_player;
  end if;
  return jsonb_set(p_player, '{avatarColor}', to_jsonb(free));
end;
$$;
revoke all on function _free_color(jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Turn order
-- ---------------------------------------------------------------------------

-- The Knower after p_after in play order, skipping the Guesser and wrapping round. With a
-- single Knower that's p_after again.
create or replace function _next_knower(p_room jsonb, p_after text)
returns text
language sql
immutable
as $$
  with play_order as (
    select uid, ord from jsonb_array_elements_text(p_room -> 'playerOrder') with ordinality as t(uid, ord)
  ), here as (
    select coalesce((select ord from play_order where uid = p_after), 0) as pos
  )
  select coalesce(
    (select uid from play_order, here
     where uid <> p_room ->> 'guesserUid' and uid <> p_after
     order by (ord <= pos), ord
     limit 1),
    p_after
  );
$$;
revoke all on function _next_knower(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lobby
-- ---------------------------------------------------------------------------

-- Replaces migration 017's version: up to 5 players in a private room, 3 in a public one,
-- and a newcomer whose colour is taken gets a free one.
create or replace function join_room(p_code text, p_player jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  player_uid text := auth.uid()::text;
  player_count int;
  seats int;
  me jsonb;
begin
  if player_uid is null or p_player ->> 'uid' is distinct from player_uid then
    raise exception 'player uid must match the authenticated caller';
  end if;
  me := _clean_player(p_player);
  perform _check_join_failures();

  select data into room_data from rooms where code = p_code for update;
  if room_data is null then
    perform _note_join_failure();
    return 'not-found';
  end if;
  if room_data ->> 'status' <> 'lobby' then
    perform _note_join_failure();
    return 'started';
  end if;
  if not (room_data -> 'players' ? player_uid) then
    select count(*) into player_count from jsonb_object_keys(room_data -> 'players');
    seats := (_player_limits() ->> case when coalesce((room_data ->> 'isPublic')::boolean, false) then 'public' else 'max' end)::int;
    if player_count >= seats then
      perform _note_join_failure();
      return 'full';
    end if;
  end if;

  update rooms
  set data = jsonb_set(room_data, array['players', player_uid], _free_color(room_data -> 'players', me), true)
  where code = p_code;
  return 'ok';
end;
$$;

-- Replaces migration 009's version: fills public lobbies to _player_limits().public, and a
-- newcomer whose colour is taken gets a free one.
create or replace function quick_match(p_player jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller text := auth.uid()::text;
  me jsonb;
  candidate record;
  room_data jsonb;
  new_code text;
  seats int := (_player_limits() ->> 'public')::int;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if caller is null or p_player ->> 'uid' is distinct from caller then
    raise exception 'player uid must match the authenticated caller';
  end if;
  me := _clean_player(p_player);

  -- Already waiting in a public lobby (e.g. tapped twice)? Stay there.
  select code into new_code from rooms
  where is_public and data ->> 'status' = 'lobby' and (data -> 'players') ? caller
  limit 1;
  if new_code is not null then
    return new_code;
  end if;

  for candidate in
    select code from rooms
    where is_public and data ->> 'status' = 'lobby' and created_at > now() - interval '2 hours'
    order by created_at
    for update skip locked
  loop
    select data into room_data from rooms where code = candidate.code;
    room_data := _prune_public_lobby(candidate.code, room_data, caller);
    if room_data is not null
       and (select count(*) from jsonb_object_keys(room_data -> 'players')) < seats then
      update rooms
      set data = jsonb_set(room_data, array['players', caller], _free_color(room_data -> 'players', me), true)
      where code = candidate.code;
      return candidate.code;
    end if;
  end loop;

  -- Nobody waiting: open a new public lobby with the caller as host.
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '')
    into new_code from generate_series(1, 4);
    exit when not exists (select 1 from rooms where code = new_code);
  end loop;
  insert into rooms (code, is_public, data) values (new_code, true, jsonb_build_object(
    'hostUid', caller,
    'status', 'lobby',
    'isPublic', true,
    'round', 1,
    'maxRounds', 9,
    'playerOrder', null,
    'chain', null,
    'category', '',
    'secondsRemaining', 30,
    'activeKnowerUid', '',
    'guesserUid', '',
    'players', jsonb_build_object(caller, me),
    'typing', '{}'::jsonb,
    'linkChecks', '{}'::jsonb,
    'history', '{}'::jsonb,
    'createdAt', (extract(epoch from now()) * 1000)::bigint
  ));
  return new_code;
end;
$$;

-- Replaces migration 009's version: a lobby can only go public while Play online could
-- still fill it (fewer than 3 players); closing it again is always allowed.
create or replace function set_room_public(p_code text, p_public boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'lobby' then
    raise exception 'the game has already started';
  end if;
  if p_public
     and (select count(*) from jsonb_object_keys(room_data -> 'players')) >= (_player_limits() ->> 'public')::int then
    raise exception 'too many players to play online';
  end if;
  update rooms
  set is_public = p_public,
      data = room_data || jsonb_build_object('isPublic', p_public)
  where code = p_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting a game
-- ---------------------------------------------------------------------------

-- Replaces migration 014's version: p_count words split into thirds by difficulty, easiest
-- first (9 is 3/3/3, 8 is 3/3/2, 10 is 4/3/3), shuffled within each, spanning at least 3
-- categories. Words in p_avoid are drawn only once a difficulty runs out of others.
drop function if exists _draw_deck(text[]);
create or replace function _draw_deck(p_avoid text[], p_count int default 9)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  picks jsonb;
  easy int := ceil(p_count / 3.0)::int;
  medium int := ceil(p_count * 2 / 3.0)::int - ceil(p_count / 3.0)::int;
  hard int := p_count - ceil(p_count * 2 / 3.0)::int;
begin
  for attempt in 1..25 loop
    select jsonb_agg(
      jsonb_build_object('id', id, 'word', word, 'category', category, 'difficulty', difficulty)
      order by tier, shuffle
    )
    into picks
    from (
      select id, word, category, difficulty,
        case difficulty when 'easy' then 1 when 'medium' then 2 else 3 end as tier,
        random() as shuffle,
        row_number() over (
          partition by difficulty
          order by (id = any(coalesce(p_avoid, '{}'))), random()
        ) as pick
      from words
    ) drawn
    where pick <= case difficulty when 'easy' then easy when 'medium' then medium else hard end;

    exit when (
      select count(distinct e ->> 'category') from jsonb_array_elements(picks) e
    ) >= 3;
  end loop;
  return picks; -- astronomically unlikely to still be < 3 categories; accept it if so
end;
$$;
revoke all on function _draw_deck(text[], int) from public, anon, authenticated;

-- Replaces migration 014's version: 3 to 5 players, with rounds to match.
create or replace function start_game(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  play_order jsonb;
  player_count int;
  rounds int;
  used text[];
  keep int := _used_word_memory();
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'lobby' then
    return; -- already started (e.g. a retried call): nothing to do
  end if;

  select jsonb_agg(uid order by random()) into play_order
  from jsonb_object_keys(room_data -> 'players') uid;
  player_count := jsonb_array_length(play_order);
  if player_count < (_player_limits() ->> 'min')::int or player_count > (_player_limits() ->> 'max')::int then
    raise exception 'Yappa needs % to % players', _player_limits() ->> 'min', _player_limits() ->> 'max';
  end if;
  rounds := _rounds_for(player_count);

  -- The room's history plus the game just played (decks from before migration 014 only
  -- carry the word, so look its id up).
  select d.used_word_ids || array(
    select coalesce(e ->> 'id', (select w.id from words w where w.word = e ->> 'word'))
    from jsonb_array_elements(d.words) with ordinality as t(e, ord)
    order by ord
  )
  into used
  from game_decks d where d.code = p_code;
  used := array_remove(coalesce(used, '{}'), null);
  if cardinality(used) > keep then
    used := used[cardinality(used) - keep + 1 :];
  end if;

  insert into game_decks (code, words, used_word_ids) values (p_code, _draw_deck(used, rounds), used)
  on conflict (code) do update set words = excluded.words, used_word_ids = excluded.used_word_ids;
  delete from round_secrets where code = p_code;

  update rooms
  set data = room_data || jsonb_build_object(
    'playerOrder', play_order,
    'maxRounds', rounds,
    'history', '{}'::jsonb
  )
  where code = p_code;

  perform _setup_round(p_code, 1);
end;
$$;
revoke all on function start_game(text) from public, anon;
grant execute on function start_game(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rounds
-- ---------------------------------------------------------------------------

-- Replaces migration 016's version: any number of Knowers. Who goes first moves on one
-- Knower each round (with two Knowers that's the same alternation as before).
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
  entry_id text;
begin
  select data into room_data from rooms where code = p_code for update;
  select words -> (p_round - 1) into deck_entry from game_decks where code = p_code;
  if deck_entry is null then
    raise exception 'no word drawn for room % round %', p_code, p_round;
  end if;
  entry_id := coalesce(deck_entry ->> 'id', (select w.id from words w where w.word = deck_entry ->> 'word'));

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

  insert into round_secrets (code, round, target_word, guesser_uid, word_id, meaning)
  values (
    p_code, p_round, deck_entry ->> 'word', guesser, entry_id,
    coalesce((select w.meaning from words w where w.id = entry_id), '')
  )
  on conflict (code, round) do update
    set target_word = excluded.target_word, guesser_uid = excluded.guesser_uid,
        word_id = excluded.word_id, meaning = excluded.meaning;

  update rooms
  set data = (room_data - 'targetWord' - 'gameWords' - 'secondsRemaining' - 'linkChecks' - 'guessPending')
    || jsonb_build_object(
      'status', 'playing',
      'round', p_round,
      'category', deck_entry ->> 'category',
      'activeKnowerUid', knowers[((p_round - 1) % cardinality(knowers)) + 1],
      'guesserUid', guesser,
      'players', players,
      'chain', null,
      'feed', '[]'::jsonb,
      'turnIndex', 0,
      'typing', '{}'::jsonb
    )
  where code = p_code;
end;
$$;

-- Replaces migration 013's version: the turn passes to the next Knower in play order.
create or replace function submit_word(p_code text, p_round int, p_turn_index int, p_word text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb := _game_config();
  room_data jsonb;
  caller text := auth.uid()::text;
  word text := btrim(_strip_invisible(p_word));
  target text;
  feed jsonb;
  last_word text;
  clock turn_clocks;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    raise exception 'round is not in play';
  end if;
  if room_data ->> 'activeKnowerUid' <> caller
     or coalesce((room_data ->> 'turnIndex')::int, 0) <> p_turn_index then
    raise exception 'not your turn';
  end if;

  select * into clock from turn_clocks where code = p_code;
  if clock.hold_started_at is not null then
    raise exception 'game is paused';
  end if;
  if _clock_ms(clock.started_at, null) > _turn_limit_ms(room_data) + (cfg ->> 'graceMs')::int
     or _clock_ms(clock.round_started_at, null) > _round_limit_ms(room_data) + (cfg ->> 'graceMs')::int then
    raise exception 'turn is over';
  end if;

  -- One word: letters, with apostrophes or hyphens inside (don't, x-ray).
  if length(word) > (cfg ->> 'maxWordLength')::int or word !~ '^[[:alpha:]]+([''’-][[:alpha:]]+)*$' then
    raise exception 'one word, up to % letters', cfg ->> 'maxWordLength';
  end if;
  if _is_offensive(word) then
    raise exception 'word not allowed';
  end if;
  select target_word into target from round_secrets where code = p_code and round = p_round;
  if _is_target_variant(word, target) then
    raise exception 'that is the target word';
  end if;

  feed := coalesce(room_data -> 'feed', '[]'::jsonb);
  select e ->> 'text' into last_word
  from jsonb_array_elements(feed) with ordinality as t(e, ord)
  where e ->> 'kind' = 'word'
  order by ord desc limit 1;
  if lower(last_word) = lower(word) then
    raise exception 'same as the last word';
  end if;

  update rooms
  set data = room_data || jsonb_build_object(
    'feed', feed || jsonb_build_array(jsonb_build_object('kind', 'word', 'text', word, 'by', caller)),
    'turnIndex', p_turn_index + 1,
    'activeKnowerUid', _next_knower(room_data, caller),
    'typing', coalesce(room_data -> 'typing', '{}'::jsonb) - caller
  )
  where code = p_code;
  return p_turn_index + 1;
end;
$$;

-- Replaces migration 013's version: the turn passes to the next Knower in play order.
create or replace function skip_turn(p_code text, p_round int, p_turn_index int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  skipped text;
  clock turn_clocks;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'playing'
     or (room_data ->> 'round')::int <> p_round
     or coalesce((room_data ->> 'turnIndex')::int, 0) <> p_turn_index then
    return false;
  end if;
  select * into clock from turn_clocks where code = p_code;
  if clock.hold_started_at is not null
     or _clock_ms(clock.started_at, null) < _turn_limit_ms(room_data) - (_game_config() ->> 'earlyMs')::int then
    return false;
  end if;

  skipped := room_data ->> 'activeKnowerUid';
  update rooms
  set data = room_data || jsonb_build_object(
    'feed', coalesce(room_data -> 'feed', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('kind', 'skip', 'by', skipped)),
    'turnIndex', p_turn_index + 1,
    'activeKnowerUid', _next_knower(room_data, skipped),
    'typing', coalesce(room_data -> 'typing', '{}'::jsonb) - skipped
  )
  where code = p_code;
  return true;
end;
$$;
