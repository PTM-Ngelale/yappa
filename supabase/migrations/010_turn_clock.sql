-- Yappa: a server-side turn clock, so a device that reloads, rejoins or comes back from the
-- background mid-turn picks the countdown up where it really is, instead of restarting at 30.
--
-- Each device counts a turn down itself (the host no longer writes tick_timer every second).
-- That works while everyone sees each turn start live, but a device that loads the room
-- mid-turn can't know how much of it has gone. So the server keeps one clock per room:
--   * it restarts whenever a turn starts (a round starts, or a word lands in the chain);
--   * players' devices pause it while someone has dropped (the Disconnected overlay) and
--     resume it when they're back, so the time the game sat frozen doesn't count;
--   * turn_elapsed_ms() reports how long the turn has run, measured on the server's clock,
--     so phone clocks that disagree don't matter.
-- Kept in its own table so pausing doesn't broadcast a room update to every player.
--
-- Additive only: older app versions never touch it.

create table if not exists turn_clocks (
  code text primary key references rooms (code) on delete cascade,
  started_at timestamptz not null,
  -- Set while the game is held for a dropped player; null otherwise.
  hold_started_at timestamptz,
  -- Time this turn spent held, not counting a hold still in progress.
  held_ms int not null default 0
);
alter table turn_clocks enable row level security; -- no policies: definer functions only

-- A turn starts when the room goes to 'playing', the round changes, or the chain grows.
-- A trigger, so _setup_round and submit_word stay as they are.
create or replace function _restart_turn_clock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_len int := case when jsonb_typeof(old.data -> 'chain') = 'array' then jsonb_array_length(old.data -> 'chain') else 0 end;
  new_len int := case when jsonb_typeof(new.data -> 'chain') = 'array' then jsonb_array_length(new.data -> 'chain') else 0 end;
begin
  if new.data ->> 'status' = 'playing' and (
    old.data ->> 'status' is distinct from 'playing'
    or old.data ->> 'round' is distinct from new.data ->> 'round'
    or old_len <> new_len
  ) then
    insert into turn_clocks (code, started_at) values (new.code, now())
    on conflict (code) do update
      set started_at = now(),
          -- Still held (unlikely: the game is frozen): the new turn starts held too.
          hold_started_at = case when turn_clocks.hold_started_at is not null then now() end,
          held_ms = 0;
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_restart_turn_clock on rooms;
create trigger rooms_restart_turn_clock
  after update of data on rooms
  for each row execute function _restart_turn_clock();

-- The room's data if the caller is a member and the round is in play, else null. Read-only,
-- so unlike _require_member it takes no row lock.
create or replace function _playing_room_for_member(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  select data into room_data from rooms where code = p_code;
  if room_data is null or not ((room_data -> 'players') ? auth.uid()::text) then
    raise exception 'not a member of room %', p_code;
  end if;
  return case when room_data ->> 'status' = 'playing' then room_data end;
end;
$$;

-- Milliseconds the current turn has run, not counting time held — null outside play.
create or replace function turn_elapsed_ms(p_code text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clock turn_clocks;
begin
  if _playing_room_for_member(p_code) is null then
    return null;
  end if;
  select * into clock from turn_clocks where code = p_code;
  if clock is null then
    return null;
  end if;
  return greatest(0, (extract(epoch from (coalesce(clock.hold_started_at, clock_timestamp()) - clock.started_at)) * 1000)::int - clock.held_ms);
end;
$$;

-- Someone has dropped: hold the clock. Every remaining player's device calls this; the
-- first call starts the hold and the rest are no-ops.
create or replace function pause_turn_clock(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _playing_room_for_member(p_code) is null then
    return;
  end if;
  update turn_clocks set hold_started_at = now() where code = p_code and hold_started_at is null;
end;
$$;

-- They're back: let the clock run again. Also called by every device; only the first counts.
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
  set held_ms = held_ms + (extract(epoch from (now() - hold_started_at)) * 1000)::int,
      hold_started_at = null
  where code = p_code and hold_started_at is not null;
end;
$$;

revoke all on function _restart_turn_clock() from public, anon, authenticated;
revoke all on function _playing_room_for_member(text) from public, anon, authenticated;
revoke all on function turn_elapsed_ms(text) from public, anon;
revoke all on function pause_turn_clock(text) from public, anon;
revoke all on function resume_turn_clock(text) from public, anon;
grant execute on function turn_elapsed_ms(text) to authenticated;
grant execute on function pause_turn_clock(text) to authenticated;
grant execute on function resume_turn_clock(text) to authenticated;
