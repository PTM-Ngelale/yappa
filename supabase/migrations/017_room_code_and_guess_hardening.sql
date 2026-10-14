-- Yappa: security fixes from the October 2026 audit.
--
-- 1. Room codes can't be brute-forced. A private room's 4-character code (about 1M
--    possibilities) is the only thing keeping strangers out, and nothing limited how many
--    codes one player could try. Now:
--      * join_room() and create_room() report a missed code as a status instead of raising,
--        so the miss can be recorded (a raise would roll the record back), and a player who
--        misses too often in an hour is refused;
--      * other functions no longer say whether a room exists: _require_member() and
--        _require_host() give a non-member the same error for "no such room" and "not your
--        room", so they can't be used to find live codes for free.
-- 2. Guesses go through the same filters as names and words. The Guesser's text went into
--    everyone's feed as typed, skipping the invisible-character stripping and the blocked-word
--    check. begin_guess() now refuses an offensive guess (before it takes the guess slot), and
--    record_guess() strips invisible characters.

-- ---------------------------------------------------------------------------
-- Missed room codes
-- ---------------------------------------------------------------------------

-- One row per missed code (no such room, already started or full). Kept an hour.
create table if not exists join_failures (
  uid text not null,
  at timestamptz not null default now()
);
create index if not exists join_failures_uid_at on join_failures (uid, at);
create index if not exists join_failures_at on join_failures (at);
alter table join_failures enable row level security; -- no policies: definer functions only

-- Misses allowed per player per rolling hour. Typos and a full room cost one each, so a real
-- player never gets near it; someone guessing codes runs out long before finding one.
create or replace function _join_failure_limit()
returns int language sql immutable as $$ select 20 $$;

-- Raises if the caller has used up their misses for the hour.
create or replace function _check_join_failures()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller text := auth.uid()::text;
begin
  delete from join_failures where uid = caller and at < now() - interval '1 hour';
  if (select count(*) from join_failures where uid = caller) >= _join_failure_limit() then
    raise exception 'too many attempts, try again later';
  end if;
end;
$$;

create or replace function _note_join_failure()
returns void
language sql
security definer
set search_path = public
as $$
  insert into join_failures (uid) values (auth.uid()::text);
$$;

revoke all on function _join_failure_limit() from public, anon, authenticated;
revoke all on function _check_join_failures() from public, anon, authenticated;
revoke all on function _note_join_failure() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- No existence oracle in the membership checks
-- ---------------------------------------------------------------------------

-- Replaces migration 005's version: "no such room" and "not a member" read the same.
create or replace function _require_member(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null or not ((room_data -> 'players') ? auth.uid()::text) then
    raise exception 'not a member of room %', p_code;
  end if;
  return room_data;
end;
$$;

-- Replaces migration 004's version: a non-member gets the same error whether or not the room
-- exists; only a member learns they aren't the host.
create or replace function _require_host(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'hostUid' <> auth.uid()::text then
    raise exception 'only the host can do that';
  end if;
  return room_data;
end;
$$;

revoke all on function _require_member(text) from public, anon, authenticated;
revoke all on function _require_host(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lobby
-- ---------------------------------------------------------------------------

-- Replaces migration 005's version. Returns 'ok', or 'taken' if the code is in use (the app
-- picks another). A taken code counts as a miss, so creating rooms can't be used to probe
-- codes either.
drop function if exists create_room(text, jsonb);
create function create_room(p_code text, p_player jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  host jsonb;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  if p_code !~ '^[A-Z0-9]{4}$' then
    raise exception 'room code must be 4 characters';
  end if;
  host := _clean_player(p_player);
  perform _check_join_failures();

  insert into rooms (code, data) values (p_code, jsonb_build_object(
    'hostUid', auth.uid()::text,
    'status', 'lobby',
    'round', 1,
    'maxRounds', 9,
    'playerOrder', null,
    'chain', null,
    'category', '',
    'secondsRemaining', 30,
    'activeKnowerUid', '',
    'guesserUid', '',
    'players', jsonb_build_object(auth.uid()::text, host),
    'typing', '{}'::jsonb,
    'linkChecks', '{}'::jsonb,
    'history', '{}'::jsonb,
    'createdAt', (extract(epoch from now()) * 1000)::bigint
  ))
  on conflict (code) do nothing;
  if not found then
    perform _note_join_failure();
    return 'taken';
  end if;
  return 'ok';
end;
$$;

-- Replaces migration 005's version. Returns 'ok', or why not: 'not-found', 'started' or
-- 'full'. Each miss is recorded, and a player with too many misses this hour is refused.
drop function if exists join_room(text, jsonb, text);
drop function if exists join_room(text, jsonb);
create function join_room(p_code text, p_player jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  player_uid text := auth.uid()::text;
  player_count int;
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
    if player_count >= 3 then
      perform _note_join_failure();
      return 'full';
    end if;
  end if;

  update rooms
  set data = jsonb_set(room_data, array['players', player_uid], me, true)
  where code = p_code;
  return 'ok';
end;
$$;

-- Replaces migration 011's version: same, returning join_room's status.
create function join_room(p_code text, p_player jsonb, p_source text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  if p_source in ('link', 'code') then
    perform set_config('yappa.join_source', p_source, true);
  end if;
  result := join_room(p_code, p_player);
  perform set_config('yappa.join_source', '', true);
  return result;
end;
$$;

revoke all on function create_room(text, jsonb) from public, anon;
revoke all on function join_room(text, jsonb) from public, anon;
revoke all on function join_room(text, jsonb, text) from public, anon;
grant execute on function create_room(text, jsonb) to authenticated;
grant execute on function join_room(text, jsonb) to authenticated;
grant execute on function join_room(text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Guesses (called by the validate-guess edge function with the service role)
-- ---------------------------------------------------------------------------

-- Replaces migration 013's version: also takes the guess, and returns 'not-allowed' for an
-- offensive one without using up the Guesser's slot. p_guess defaults to null so an edge
-- function deployed before this migration keeps working.
drop function if exists begin_guess(text, int, text);
create function begin_guess(p_code text, p_round int, p_uid text, p_guess text default null)
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
  if p_guess is not null and _is_offensive(_strip_invisible(p_guess)) then
    return 'not-allowed';
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

-- Replaces migration 013's version: the guess is stripped of invisible characters before it
-- goes into the feed.
create or replace function record_guess(p_code text, p_round int, p_guess text, p_correct boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  guess text := btrim(_strip_invisible(p_guess));
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
      'kind', 'guess', 'text', guess, 'by', room_data ->> 'guesserUid', 'correct', p_correct
    )),
    true
  )
  where code = p_code;
  if p_correct then
    return _resolve_round(p_code, p_round, 'won', guess);
  end if;
  return true;
end;
$$;

revoke all on function begin_guess(text, int, text, text) from public, anon, authenticated;
revoke all on function record_guess(text, int, text, boolean) from public, anon, authenticated;
grant execute on function begin_guess(text, int, text, text) to service_role;
grant execute on function record_guess(text, int, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Retention: also drop old missed-code rows (replaces migration 012's version)
-- ---------------------------------------------------------------------------

create or replace function purge_expired_data()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- round_secrets go with their room (on delete cascade).
  delete from public.rooms where created_at < now() - interval '24 hours';

  delete from public.ai_usage where at < now() - interval '1 hour';

  delete from public.join_failures where at < now() - interval '1 hour';

  delete from public.player_reports where created_at < now() - interval '90 days';

  delete from public.share_cards where created_at < now() - interval '365 days';

  -- "Unused" = no sign-in and no session refresh (the app refreshes on every launch) in 30 days.
  delete from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
    and not exists (
      select 1 from auth.sessions s
      where s.user_id = u.id and s.updated_at > now() - interval '30 days'
    );
end;
$$;

revoke all on function purge_expired_data() from public, anon, authenticated;
