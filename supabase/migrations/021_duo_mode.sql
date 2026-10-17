-- Yappa: duo mode, for 2 players.
--
-- Two players can now start a game. With one Knower there's nobody to pass the turn to, so
-- duo plays differently:
--   * Roles swap every round: 6 rounds, so each player guesses 3 times. The deck is 2 Easy,
--     2 Medium, 2 Hard, easiest first (migration 020's _draw_deck and _rounds_for already
--     give this for 2 players).
--   * No turn clock. The Knower keeps the turn and adds one word at a time.
--   * A clue budget instead: 8 words a round. Once they're spent the Knower can't add more,
--     and the Guesser has whatever is left of the round clock to get it.
--   * The score is rounds won, plus the clues used (fewer is better); the app adds those up
--     from each round's history (wordCount).
-- Rooms record it as data.mode ('duo' or 'team') and data.clueBudget (null outside duo),
-- set when the game starts. Play online still needs 3, so duo is for private rooms only.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- Replaces migration 020's version: 2 players can start (duo).
create or replace function _player_limits()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('min', 2, 'max', 5, 'public', 3);
$$;

-- Replaces migration 013's version: adds duoClues, the clue budget per duo round.
create or replace function _game_config()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'turnMs', 10000,
    'roundMs', 60000,
    'guessCooldownMs', 3000,
    -- The role reveal every device shows as a round starts: the first turn and the round
    -- get this much on top, so play itself still gets the full time.
    'introMs', 2500,
    -- Lets a word or guess sent just before time ran out still count.
    'graceMs', 750,
    -- How early a device's skip or expiry may arrive (its clock started a moment late).
    'earlyMs', 250,
    -- How long the round clock waits for a guess that's still being judged.
    'guessHoldMs', 8000,
    'maxWordLength', 24,
    'duoClues', 8
  );
$$;

-- Replaces migration 013's version: a duo turn lasts the whole round (there's no one to
-- pass it to), so only the round clock can stop the Knower.
create or replace function _turn_limit_ms(p_room jsonb)
returns int
language sql
stable
as $$
  select case
    when p_room ->> 'mode' = 'duo' then _round_limit_ms(p_room)
    else (_game_config() ->> 'turnMs')::int
      + case when coalesce((p_room ->> 'turnIndex')::int, 0) = 0 then (_game_config() ->> 'introMs')::int else 0 end
  end;
$$;

-- ---------------------------------------------------------------------------
-- Starting a game
-- ---------------------------------------------------------------------------

-- Replaces migration 020's version: also records the mode, and the clue budget for duo.
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
  duo boolean;
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
  duo := player_count = 2;

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
    'mode', case when duo then 'duo' else 'team' end,
    'clueBudget', case when duo then (_game_config() -> 'duoClues') else 'null'::jsonb end,
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

-- Replaces migration 020's version: in duo, refuses a word once the round's clues are spent.
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
  select target_word into target from round_secrets where code = p_code and round = p_round;
  if _is_target_variant(word, target) then
    raise exception 'that is the target word';
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

-- Replaces migration 020's version: duo has no turns to skip.
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
     or room_data ->> 'mode' = 'duo'
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
