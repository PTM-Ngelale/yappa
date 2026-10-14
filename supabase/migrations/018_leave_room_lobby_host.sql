-- Fixes: a host leaving a lobby that hasn't started yet, with other players still in it,
-- failed with "cannot extract elements from a scalar". create_room and reset_room_to_lobby
-- store `playerOrder` as JSON null, and coalesce() only replaces SQL NULL, so picking the
-- next host from the turn order tried to read the elements of a JSON null.

-- Replaces migration 005's version: a playerOrder that isn't an array counts as empty, so the
-- host role passes to whoever joined first.
create or replace function leave_room(p_code text, p_uid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  remaining jsonb;
  new_host text;
  play_order jsonb;
begin
  if p_uid is null or p_uid <> auth.uid()::text then
    raise exception 'uid must match the authenticated caller';
  end if;

  select data into room_data from rooms where code = p_code for update;
  if room_data is null or not ((room_data -> 'players') ? p_uid) then
    return; -- room gone or already left — nothing to do
  end if;

  remaining := (room_data -> 'players') - p_uid;
  if remaining = '{}'::jsonb then
    delete from rooms where code = p_code;
    return;
  end if;

  new_host := room_data ->> 'hostUid';
  if new_host = p_uid then
    -- Next player in turn order if a game has run, otherwise whoever joined first.
    play_order := room_data -> 'playerOrder';
    if jsonb_typeof(play_order) is distinct from 'array' then
      play_order := '[]'::jsonb;
    end if;
    select uid into new_host
    from jsonb_array_elements_text(play_order) uid
    where remaining ? uid
    limit 1;
    if new_host is null then
      select key into new_host
      from jsonb_each(remaining)
      order by (value ->> 'lastSeenAt')::bigint nulls last, key
      limit 1;
    end if;
  end if;

  update rooms
  set data = room_data || jsonb_build_object('players', remaining, 'hostUid', new_host)
  where code = p_code;
end;
$$;

revoke all on function leave_room(text, text) from public, anon;
grant execute on function leave_room(text, text) to authenticated;
