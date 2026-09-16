-- Fixes: any authenticated client could previously read/write ANY room by
-- code (see audit) — the old policies only checked auth.role() = 'authenticated',
-- not whether the caller was actually a player in that room. This scoped every
-- policy to "you must already be listed in the room's players map", and adds a
-- dedicated join_room() RPC for the one case where that's not yet true — the
-- join action itself.

drop policy if exists "authenticated read rooms" on rooms;
drop policy if exists "authenticated insert rooms" on rooms;
drop policy if exists "authenticated update rooms" on rooms;

-- Only players already listed in a room's `players` map may read it.
create policy "members read rooms" on rooms
  for select using (
    auth.role() = 'authenticated'
    and (data -> 'players') ? auth.uid()::text
  );

-- A room can only be created by the host it names as its own, and the host
-- must list themselves as a player (createRoom() in room.ts always does both).
create policy "host creates rooms" on rooms
  for insert with check (
    auth.role() = 'authenticated'
    and data ->> 'hostUid' = auth.uid()::text
    and (data -> 'players') ? auth.uid()::text
  );

-- Only current members may patch a room's state (submitWord, typing, timer
-- ticks, resolveRound, etc). WITH CHECK is intentionally permissive — it only
-- needs auth, not continued membership — because leaveRoom() removes the
-- caller from `players` as part of the same update; USING already ensures
-- only an existing member could touch the row in the first place, and RLS is
-- per-row so this can never reach a room the caller isn't already in.
create policy "members update rooms" on rooms
  for update
  using (
    auth.role() = 'authenticated'
    and (data -> 'players') ? auth.uid()::text
  )
  with check (
    auth.role() = 'authenticated'
  );

-- Adds a player to a room's `players` map. SECURITY DEFINER because the
-- joiner is, by definition, not yet a member — the "members update rooms"
-- policy above would otherwise block them from ever joining. Validates the
-- room exists, is still in the lobby (no joining mid-game), isn't full (max
-- 3 players, per the locked spec), and that callers can only ever add
-- themselves — never impersonate another uid.
create or replace function join_room(p_code text, p_player jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  player_uid text;
  player_count int;
begin
  player_uid := p_player ->> 'uid';
  if player_uid is null or player_uid <> auth.uid()::text then
    raise exception 'player uid must match the authenticated caller';
  end if;

  select data into room_data from rooms where code = p_code for update;
  if room_data is null then
    raise exception 'room % not found', p_code;
  end if;

  if room_data ->> 'status' <> 'lobby' then
    raise exception 'room % already started', p_code;
  end if;

  if not (room_data -> 'players' ? player_uid) then
    select count(*) into player_count from jsonb_object_keys(room_data -> 'players');
    if player_count >= 3 then
      raise exception 'room % is full', p_code;
    end if;
  end if;

  update rooms
  set data = jsonb_set(room_data, array['players', player_uid], p_player, true)
  where code = p_code;
end;
$$;

revoke all on function join_room(text, jsonb) from public;
grant execute on function join_room(text, jsonb) to authenticated;
