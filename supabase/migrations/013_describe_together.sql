-- Yappa: "Describe It Together" (GAMEPLAY_REDESIGN.md, phase 2: the core loop).
--
-- The Knowers now take turns adding one word each to a shared description of the secret
-- word; the Guesser guesses as often as they like (3s apart), and every guess shows in the
-- feed. Two clocks run at once:
--   * the turn clock (10s): when it runs out the turn is skipped and passes to the other
--     Knower; the round carries on;
--   * the round clock (60s): when it runs out the round is lost.
-- Every device counts both down itself, but the server decides: skip_turn and expire_round
-- only act once the server's own clock says time is up, and only the first call counts.
--
-- Room data per round: `feed` (replaces `chain`) and `turnIndex`. Feed entries:
--   { "kind": "word",  "text": ..., "by": <uid> }
--   { "kind": "guess", "text": ..., "by": <uid>, "correct": bool }
--   { "kind": "skip",  "by": <uid> }
--
-- Replaces the chain rules (compound links, the AI link check, one guess that ends the
-- round). Old app versions can't play on this; the release switches everything at once.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- Timings in one place. The app mirrors these in src/game/config.ts; the server's values
-- are the ones that count.
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
    'maxWordLength', 24
  );
$$;

-- ---------------------------------------------------------------------------
-- Clocks (extends migration 010's turn_clocks)
-- ---------------------------------------------------------------------------

alter table turn_clocks add column if not exists round_started_at timestamptz;
alter table turn_clocks add column if not exists last_guess_at timestamptz;
alter table turn_clocks add column if not exists guess_pending_at timestamptz;

-- A round starting resets both clocks; a new turn (turnIndex moving on) resets the turn
-- clock. While the game is held for a dropped player, resume_turn_clock shifts both start
-- times on by the time held, so a pause never eats into anyone's time.
create or replace function _restart_turn_clock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.data ->> 'status' <> 'playing' then
    return new;
  end if;
  if old.data ->> 'status' is distinct from 'playing'
     or old.data ->> 'round' is distinct from new.data ->> 'round' then
    insert into turn_clocks (code, started_at, round_started_at)
    values (new.code, now(), now())
    on conflict (code) do update
      set started_at = now(), round_started_at = now(), hold_started_at = null, held_ms = 0,
          last_guess_at = null, guess_pending_at = null;
  elsif old.data ->> 'turnIndex' is distinct from new.data ->> 'turnIndex' then
    update turn_clocks set started_at = now() where code = new.code;
  end if;
  return new;
end;
$$;

create or replace function resume_turn_clock(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _playing_room_for_member(p_code) is null then
    return;
  end if;
  update turn_clocks
  set started_at = started_at + (now() - hold_started_at),
      round_started_at = round_started_at + (now() - hold_started_at),
      hold_started_at = null
  where code = p_code and hold_started_at is not null;
end;
$$;

-- Milliseconds a clock has run, measured on the server (frozen while held).
create or replace function _clock_ms(p_started timestamptz, p_hold timestamptz)
returns int
language sql
volatile
as $$
  select greatest(0, (extract(epoch from (coalesce(p_hold, clock_timestamp()) - p_started)) * 1000)::int);
$$;

-- This turn's and this round's allowance in ms, including the role reveal where it applies.
-- Phase 7's house rules will read them from the room; for now they're the defaults.
create or replace function _turn_limit_ms(p_room jsonb)
returns int
language sql
stable
as $$
  select (_game_config() ->> 'turnMs')::int
    + case when coalesce((p_room ->> 'turnIndex')::int, 0) = 0 then (_game_config() ->> 'introMs')::int else 0 end;
$$;

create or replace function _round_limit_ms(p_room jsonb)
returns int
language sql
stable
as $$
  select (_game_config() ->> 'roundMs')::int + (_game_config() ->> 'introMs')::int;
$$;

-- Where the clocks stand, for a device that loads mid-round, comes back from the background
-- or resumes after a pause. Null outside play.
create or replace function clock_state(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  room_data jsonb := _playing_room_for_member(p_code);
  clock turn_clocks;
begin
  if room_data is null then
    return null;
  end if;
  select * into clock from turn_clocks where code = p_code;
  if clock is null then
    return null;
  end if;
  return jsonb_build_object(
    'round', (room_data ->> 'round')::int,
    'turnIndex', coalesce((room_data ->> 'turnIndex')::int, 0),
    'turnElapsedMs', _clock_ms(clock.started_at, clock.hold_started_at),
    'roundElapsedMs', _clock_ms(clock.round_started_at, clock.hold_started_at),
    'held', clock.hold_started_at is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Rounds
-- ---------------------------------------------------------------------------

-- Replaces migration 004's version: a fresh feed and turn counter instead of a chain.
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
  set data = (room_data - 'targetWord' - 'gameWords' - 'secondsRemaining' - 'linkChecks' - 'guessPending')
    || jsonb_build_object(
      'status', 'playing',
      'round', p_round,
      'category', deck_entry ->> 'category',
      'activeKnowerUid', case when p_round % 2 = 1 then knowers[1] else knowers[2] end,
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

-- Replaces migration 006's version: records the round's feed, how long it took and how many
-- words it needed, then shows Round Result. `chain` (the words alone) stays for the share
-- card. No-op if the round already ended (a guess and the clock racing).
create or replace function _resolve_round(p_code text, p_round int, p_outcome text, p_guess text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  target text;
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

  select target_word into target from round_secrets where code = p_code and round = p_round;
  feed := coalesce(room_data -> 'feed', '[]'::jsonb);
  select coalesce(jsonb_agg(e -> 'text' order by ord), '[]'::jsonb) into words
  from jsonb_array_elements(feed) with ordinality as t(e, ord)
  where e ->> 'kind' = 'word' and not coalesce((e ->> 'struck')::boolean, false);

  select * into clock from turn_clocks where code = p_code;
  duration_ms := least(
    (_game_config() ->> 'roundMs')::int,
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

-- Active Knower adds one word to the description. Rejected if it isn't their turn (or the
-- turn already moved on: p_turn_index is the turn they were on), the turn or round is over,
-- the game is paused, or the word breaks a rule. Returns the next turn's index.
drop function if exists submit_word(text, int, text);
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
  next_knower text;
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

  select uid into next_knower
  from jsonb_array_elements_text(room_data -> 'playerOrder') uid
  where uid <> caller and uid <> room_data ->> 'guesserUid';

  update rooms
  set data = room_data || jsonb_build_object(
    'feed', feed || jsonb_build_array(jsonb_build_object('kind', 'word', 'text', word, 'by', caller)),
    'turnIndex', p_turn_index + 1,
    'activeKnowerUid', next_knower,
    'typing', coalesce(room_data -> 'typing', '{}'::jsonb) - caller
  )
  where code = p_code;
  return p_turn_index + 1;
end;
$$;

-- The turn clock ran out: the turn passes to the other Knower. Any player's device may call
-- it; it only acts once the server agrees the turn is over, and only once per turn.
create or replace function skip_turn(p_code text, p_round int, p_turn_index int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  skipped text;
  next_knower text;
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
  select uid into next_knower
  from jsonb_array_elements_text(room_data -> 'playerOrder') uid
  where uid <> skipped and uid <> room_data ->> 'guesserUid';

  update rooms
  set data = room_data || jsonb_build_object(
    'feed', coalesce(room_data -> 'feed', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('kind', 'skip', 'by', skipped)),
    'turnIndex', p_turn_index + 1,
    'activeKnowerUid', next_knower,
    'typing', coalesce(room_data -> 'typing', '{}'::jsonb) - skipped
  )
  where code = p_code;
  return true;
end;
$$;

-- The round clock ran out: the round is lost. Any player's device may call it; it only acts
-- once the server agrees, and waits (up to guessHoldMs) for a guess that's still being judged.
create or replace function expire_round(p_code text, p_round int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb := _game_config();
  room_data jsonb;
  clock turn_clocks;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    return false;
  end if;
  select * into clock from turn_clocks where code = p_code;
  if clock.hold_started_at is not null
     or _clock_ms(clock.round_started_at, null) < _round_limit_ms(room_data) - (cfg ->> 'earlyMs')::int then
    return false;
  end if;
  if clock.guess_pending_at is not null
     and _clock_ms(clock.guess_pending_at, null) < (cfg ->> 'guessHoldMs')::int then
    return false;
  end if;
  return _resolve_round(p_code, p_round, 'lost-timeout', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Guesses (called by the validate-guess edge function with the service role)
-- ---------------------------------------------------------------------------

-- Takes the Guesser's next guess slot: 'ok', or why not ('not-the-guesser', 'round-over',
-- 'paused', 'cooldown'). Holds the round clock while the guess is judged.
create or replace function begin_guess(p_code text, p_round int, p_uid text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb := _game_config();
  room_data jsonb;
  clock turn_clocks;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null or room_data ->> 'guesserUid' is distinct from p_uid then
    return 'not-the-guesser';
  end if;
  if room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    return 'round-over';
  end if;
  select * into clock from turn_clocks where code = p_code for update;
  if clock.hold_started_at is not null then
    return 'paused';
  end if;
  if _clock_ms(clock.round_started_at, null) > _round_limit_ms(room_data) + (cfg ->> 'graceMs')::int then
    return 'round-over';
  end if;
  if clock.last_guess_at is not null
     and _clock_ms(clock.last_guess_at, null) < (cfg ->> 'guessCooldownMs')::int - (cfg ->> 'earlyMs')::int then
    return 'cooldown';
  end if;
  update turn_clocks set last_guess_at = now(), guess_pending_at = now() where code = p_code;
  return 'ok';
end;
$$;

-- Records a judged guess: a correct one wins the round, a wrong one goes into the feed for
-- everyone to see and play carries on. False if the round had already ended.
create or replace function record_guess(p_code text, p_round int, p_guess text, p_correct boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  update turn_clocks set guess_pending_at = null where code = p_code;
  select data into room_data from rooms where code = p_code for update;
  if room_data is null or room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    return false;
  end if;
  update rooms
  set data = jsonb_set(
    room_data,
    '{feed}',
    coalesce(room_data -> 'feed', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'kind', 'guess', 'text', p_guess, 'by', room_data ->> 'guesserUid', 'correct', p_correct
    )),
    true
  )
  where code = p_code;
  if p_correct then
    return _resolve_round(p_code, p_round, 'won', p_guess);
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Play Again (replaces migration 009's version: clears the feed instead of the chain)
-- ---------------------------------------------------------------------------

create or replace function reset_room_to_lobby(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  players jsonb;
  player_uid text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'gameover' then
    return;
  end if;
  players := room_data -> 'players';
  for player_uid in select jsonb_object_keys(players) loop
    players := jsonb_set(players, array[player_uid, 'role'], '"knower"');
    players := jsonb_set(players, array[player_uid, 'lastSeenAt'], to_jsonb(now_ms));
  end loop;
  update rooms
  set data = (room_data - 'secondsRemaining' - 'linkChecks' - 'guessPending') || jsonb_build_object(
    'status', 'lobby',
    'round', 1,
    'playerOrder', null,
    'chain', null,
    'feed', null,
    'turnIndex', 0,
    'category', '',
    'activeKnowerUid', '',
    'guesserUid', '',
    'players', players,
    'typing', '{}'::jsonb,
    'history', '{}'::jsonb
  )
  where code = p_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports (replaces migration 009's version: snapshots the feed, with who said each word)
-- ---------------------------------------------------------------------------

create or replace function report_player(p_code text, p_reported_uid text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller text := auth.uid()::text;
  room_data jsonb;
begin
  room_data := _require_member(p_code);
  if p_reported_uid = caller or not ((room_data -> 'players') ? p_reported_uid) then
    raise exception 'that player is not in this game';
  end if;
  if p_reason not in ('name', 'words', 'cheating', 'other') then
    raise exception 'unknown reason';
  end if;
  if (select count(*) from player_reports
      where reporter_uid = caller and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many reports, try again later';
  end if;

  insert into player_reports (room_code, reporter_uid, reported_uid, reported_name, reason, snapshot)
  values (
    p_code, caller, p_reported_uid,
    room_data -> 'players' -> p_reported_uid ->> 'name',
    p_reason,
    jsonb_build_object(
      'players', (select jsonb_object_agg(key, value ->> 'name') from jsonb_each(room_data -> 'players')),
      'feed', room_data -> 'feed',
      'history', (
        select coalesce(jsonb_agg(jsonb_build_object('round', key, 'feed', value -> 'feed', 'guess', value -> 'guess')), '[]'::jsonb)
        from jsonb_each(coalesce(room_data -> 'history', '{}'::jsonb))
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Removed: the chain rules
-- ---------------------------------------------------------------------------

drop function if exists tick_timer(text, int);
drop function if exists resolve_round_timeout(text, int);
drop function if exists mark_guess_pending(text, int);
drop function if exists resolve_round_guess(text, int, text, boolean);
drop function if exists record_link_check(text, int, int, text, boolean);
drop function if exists turn_elapsed_ms(text);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function _game_config() from public, anon, authenticated;
revoke all on function _clock_ms(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function _turn_limit_ms(jsonb) from public, anon, authenticated;
revoke all on function _round_limit_ms(jsonb) from public, anon, authenticated;
revoke all on function _setup_round(text, int) from public, anon, authenticated;
revoke all on function _resolve_round(text, int, text, text) from public, anon, authenticated;
revoke all on function clock_state(text) from public, anon;
revoke all on function submit_word(text, int, int, text) from public, anon;
revoke all on function skip_turn(text, int, int) from public, anon;
revoke all on function expire_round(text, int) from public, anon;
revoke all on function begin_guess(text, int, text) from public, anon, authenticated;
revoke all on function record_guess(text, int, text, boolean) from public, anon, authenticated;
grant execute on function clock_state(text) to authenticated;
grant execute on function submit_word(text, int, int, text) to authenticated;
grant execute on function skip_turn(text, int, int) to authenticated;
grant execute on function expire_round(text, int) to authenticated;
grant execute on function begin_guess(text, int, text) to service_role;
grant execute on function record_guess(text, int, text, boolean) to service_role;
