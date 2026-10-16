-- Yappa: clocks that fit the player count.
--
-- With 3 to 5 players a Knower waits longer between turns, so turns and rounds get longer:
--   * Each Knower turn lasts 15 seconds (was 10).
--   * The round lasts 60 seconds with 3 players, 75 with 4 and 90 with 5 (15 more per
--     player past 3). Duo keeps its 60 second round and has no turn clock.
-- A game records its clocks as data.turnMs and data.roundMs when it starts, and the
-- server's turn and round limits read them from the room.
--
-- Older apps count 10 and 60 seconds on the device and only ask the server to end a turn
-- or round for a few seconds after that, so a game they host must keep those clocks or it
-- would never move on. They call start_game(code), which still starts a game without
-- recorded clocks (the old 10 and 60 seconds). Newer apps call start_game(code, true): the
-- newer rules, which are these clocks and (migration 024) off-limits words, recorded as
-- data.offLimits.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- Replaces migration 021's version: adds the clocks for games that record them. turnMs
-- and roundMs stay the clocks for games that don't (started by an older app).
create or replace function _game_config()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'turnMs', 10000,
    'roundMs', 60000,
    -- Games that record their clocks: the turn, the round with 3 players or fewer, and
    -- what each player past 3 adds to the round.
    'timedTurnMs', 15000,
    'timedRoundMs', 60000,
    'roundMsPerExtraPlayer', 15000,
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

-- The clocks for a game of p_count players. Mirrors timingsFor() in src/game/config.ts.
create or replace function _clocks_for(p_count int)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'turnMs', (_game_config() ->> 'timedTurnMs')::int,
    'roundMs', (_game_config() ->> 'timedRoundMs')::int
      + (_game_config() ->> 'roundMsPerExtraPlayer')::int * greatest(p_count - 3, 0)
  );
$$;
revoke all on function _clocks_for(int) from public, anon, authenticated;

-- Replaces migration 013's version: the room's own round clock, when it has one.
create or replace function _round_limit_ms(p_room jsonb)
returns int
language sql
stable
as $$
  select coalesce((p_room ->> 'roundMs')::int, (_game_config() ->> 'roundMs')::int)
    + (_game_config() ->> 'introMs')::int;
$$;

-- Replaces migration 021's version: the room's own turn clock, when it has one.
create or replace function _turn_limit_ms(p_room jsonb)
returns int
language sql
stable
as $$
  select case
    when p_room ->> 'mode' = 'duo' then _round_limit_ms(p_room)
    else coalesce((p_room ->> 'turnMs')::int, (_game_config() ->> 'turnMs')::int)
      + case when coalesce((p_room ->> 'turnIndex')::int, 0) = 0 then (_game_config() ->> 'introMs')::int else 0 end
  end;
$$;

-- ---------------------------------------------------------------------------
-- Starting a game
-- ---------------------------------------------------------------------------

-- Migration 021's start_game, plus the newer rules (the clocks and data.offLimits): recorded
-- when p_new_rules, cleared otherwise
-- (Play Again in a room whose last game recorded them, started from an older app).
create or replace function _start_game(p_code text, p_new_rules boolean)
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
  set data = (room_data - 'turnMs' - 'roundMs' - 'offLimits') || jsonb_build_object(
    'playerOrder', play_order,
    'maxRounds', rounds,
    'mode', case when duo then 'duo' else 'team' end,
    'clueBudget', case when duo then (_game_config() -> 'duoClues') else 'null'::jsonb end,
    'history', '{}'::jsonb
  ) || case
    when p_new_rules then _clocks_for(player_count) || jsonb_build_object('offLimits', true)
    else '{}'::jsonb
  end
  where code = p_code;

  perform _setup_round(p_code, 1);
end;
$$;
revoke all on function _start_game(text, boolean) from public, anon, authenticated;

-- Older apps: the old 10 and 60 second clocks.
create or replace function start_game(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _start_game(p_code, false);
end;
$$;
revoke all on function start_game(text) from public, anon;
grant execute on function start_game(text) to authenticated;

-- Newer apps: clocks that fit the player count.
create or replace function start_game(p_code text, p_new_rules boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _start_game(p_code, p_new_rules);
end;
$$;
revoke all on function start_game(text, boolean) from public, anon;
grant execute on function start_game(text, boolean) to authenticated;
