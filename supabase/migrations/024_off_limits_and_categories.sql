-- Yappa: off-limits words, and decks that spread across the categories.
--
-- Off-limits words (GAMEPLAY_REDESIGN.md, section 4): each word card lists 3 to 5 words the
-- Knowers can't use (Easy 3, Medium 4, Hard 5; migration 023 sets them). Knowers see them
-- under the secret word; the Guesser only sees them on the round result. A Knower word is
-- turned down if it's an off-limits word or a simple form of one ("beams" for "beam").
-- Only games started by a newer app enforce them (data.offLimits, set by migration 022's
-- start_game(code, true)): older apps can't show the list.
--
-- The secret word's own parts and spellings (components and variants: "light" and "house"
-- for Lighthouse, "bike" for Bicycle) were stored since migration 014 but never checked.
-- Now they count as the target word, in every game. Simple forms match both ways, so
-- "bowl" is too close to Bowling and "flights" to "flight".
--
-- Decks: the 8 categories (migration 023) are spread across a game. Back-to-back rounds
-- never share a category, and no category comes round again while another hasn't been
-- played yet, as far as each difficulty's words allow.

alter table words add column if not exists forbidden text[] not null default '{}';
alter table round_secrets add column if not exists forbidden text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Matching words
-- ---------------------------------------------------------------------------

-- Whether two words are the same word or simple forms of each other (either way round).
create or replace function _same_word(p_word text, p_other text)
returns boolean
language sql
immutable
as $$
  select _is_target_variant(p_word, p_other) or _is_target_variant(p_other, p_word);
$$;
revoke all on function _same_word(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Decks
-- ---------------------------------------------------------------------------

-- Replaces migration 020's version. Still p_count words split into thirds by difficulty,
-- easiest first, preferring words outside p_avoid. Each round now picks, in order of
-- importance: a different category from the round before, a word not in p_avoid, the
-- category this deck has used least, then at random.
create or replace function _draw_deck(p_avoid text[], p_count int default 9)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  easy int := ceil(p_count / 3.0)::int;
  medium int := ceil(p_count * 2 / 3.0)::int - ceil(p_count / 3.0)::int;
  picks jsonb := '[]'::jsonb;
  ids text[] := '{}';
  cats text[] := '{}';
  prev text;
  tier text;
  pick record;
begin
  for i in 1..p_count loop
    tier := case when i <= easy then 'easy' when i <= easy + medium then 'medium' else 'hard' end;
    select w.id, w.word, w.category, w.difficulty into pick
    from words w
    where w.difficulty = tier and not (w.id = any(ids))
    order by
      coalesce(w.category = prev, false),
      (w.id = any(coalesce(p_avoid, '{}'))),
      (select count(*) from unnest(cats) c where c = w.category),
      random()
    limit 1;
    exit when not found;
    picks := picks || jsonb_build_array(
      jsonb_build_object('id', pick.id, 'word', pick.word, 'category', pick.category, 'difficulty', pick.difficulty)
    );
    ids := ids || pick.id;
    cats := cats || pick.category;
    prev := pick.category;
  end loop;
  return picks;
end;
$$;
revoke all on function _draw_deck(text[], int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rounds
-- ---------------------------------------------------------------------------

-- Replaces migration 020's version: also copies the word's off-limits list next to it, for
-- the Knowers (games with data.offLimits only).
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

  insert into round_secrets (code, round, target_word, guesser_uid, word_id, meaning, forbidden)
  values (
    p_code, p_round, deck_entry ->> 'word', guesser, entry_id,
    coalesce((select w.meaning from words w where w.id = entry_id), ''),
    case when room_data ->> 'offLimits' = 'true'
      then coalesce((select w.forbidden from words w where w.id = entry_id), '{}')
      else '{}'
    end
  )
  on conflict (code, round) do update
    set target_word = excluded.target_word, guesser_uid = excluded.guesser_uid,
        word_id = excluded.word_id, meaning = excluded.meaning, forbidden = excluded.forbidden;

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

-- Replaces migration 021's version: the secret word's parts and spellings count as the
-- word itself, and off-limits words are turned down (games with data.offLimits). The
-- message starts "word not allowed" so older apps still say the word isn't allowed.
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
  target_id text;
  off_limits text[];
  clue text; -- the word again: `word` would clash with words.word in a query
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

  feed := coalesce(room_data -> 'feed', '[]'::jsonb);
  if room_data ->> 'mode' = 'duo'
     and (select count(*) from jsonb_array_elements(feed) e where e ->> 'kind' = 'word')
       >= coalesce((room_data ->> 'clueBudget')::int, (cfg ->> 'duoClues')::int) then
    raise exception 'out of clues';
  end if;

  -- One word: letters, with apostrophes or hyphens inside (don't, x-ray).
  if length(word) > (cfg ->> 'maxWordLength')::int or word !~ '^[[:alpha:]]+([''’-][[:alpha:]]+)*$' then
    raise exception 'one word, up to % letters', cfg ->> 'maxWordLength';
  end if;
  if _is_offensive(word) then
    raise exception 'word not allowed';
  end if;
  clue := word;
  select s.target_word, s.word_id, s.forbidden into target, target_id, off_limits
  from round_secrets s where s.code = p_code and s.round = p_round;
  if _same_word(word, target) or exists (
    select 1 from words w, unnest(w.components || w.variants) part
    where w.id = target_id and _same_word(clue, part)
  ) then
    raise exception 'that is the target word';
  end if;
  if room_data ->> 'offLimits' = 'true'
     and exists (select 1 from unnest(coalesce(off_limits, '{}')) f where _same_word(word, f)) then
    raise exception 'word not allowed: off limits';
  end if;

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

-- Replaces migration 013's version: the round's history also keeps its off-limits words
-- (shown to everyone on the round result), and the time taken is capped by the room's own
-- round clock (migration 022) rather than the old 60 seconds.
create or replace function _resolve_round(p_code text, p_round int, p_outcome text, p_guess text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  target text;
  off_limits text[];
  feed jsonb;
  words jsonb;
  clock turn_clocks;
  duration_ms int;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null
    or room_data ->> 'status' <> 'playing'
    or (room_data ->> 'round')::int <> p_round then
    return false;
  end if;

  select s.target_word, s.forbidden into target, off_limits
  from round_secrets s where s.code = p_code and s.round = p_round;
  feed := coalesce(room_data -> 'feed', '[]'::jsonb);
  select coalesce(jsonb_agg(e -> 'text' order by ord), '[]'::jsonb) into words
  from jsonb_array_elements(feed) with ordinality as t(e, ord)
  where e ->> 'kind' = 'word' and not coalesce((e ->> 'struck')::boolean, false);

  select * into clock from turn_clocks where code = p_code;
  duration_ms := least(
    _round_limit_ms(room_data) - (_game_config() ->> 'introMs')::int,
    greatest(0, coalesce(_clock_ms(clock.round_started_at, clock.hold_started_at), 0) - (_game_config() ->> 'introMs')::int)
  );

  update rooms
  set data = jsonb_set(
    room_data || jsonb_build_object('status', 'resolution', 'typing', '{}'::jsonb),
    array['history', p_round::text],
    jsonb_build_object(
      'round', p_round,
      'category', room_data ->> 'category',
      'targetWord', target,
      'forbidden', to_jsonb(coalesce(off_limits, '{}')),
      'feed', feed,
      'chain', words,
      'wordCount', jsonb_array_length(words),
      'durationMs', duration_ms,
      'guesserUid', room_data ->> 'guesserUid',
      'outcome', p_outcome,
      'guess', p_guess
    ),
    true
  )
  where code = p_code;
  return true;
end;
$$;
