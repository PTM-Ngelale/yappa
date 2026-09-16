-- Fixes: clicking "Back to Home" (leaveRoom) threw
-- "new row violates row-level security policy for table rooms" (42501).
--
-- Root cause isolated empirically: any patch_room() update that removes the
-- caller's own key from `players` fails WITH CHECK, even though "members
-- update rooms"'s WITH CHECK doesn't reference membership at all (it's just
-- auth.role() = 'authenticated') — updates that keep the caller as a member
-- (including advanceRound's role reassignment, which touches the same
-- `players` path) succeed reliably. Rather than chase the exact Postgres RLS
-- interaction further, this isolates the mutation into its own SECURITY
-- DEFINER function, the same proven pattern already used by join_room() in
-- migration 002 for the mirror-image case (adding a member).

create or replace function leave_room(p_code text, p_uid text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  if p_uid is null or p_uid <> auth.uid()::text then
    raise exception 'uid must match the authenticated caller';
  end if;

  select data into room_data from rooms where code = p_code for update;
  if room_data is null then
    return; -- room already gone — nothing to do
  end if;

  update rooms
  set data = jsonb_set(
    room_data,
    array['players'],
    coalesce(room_data -> 'players', '{}'::jsonb) - p_uid,
    true
  )
  where code = p_code;
end;
$$;

revoke all on function leave_room(text, text) from public;
grant execute on function leave_room(text, text) to authenticated;

-- Leaving no longer goes through the generic patcher, so "members update
-- rooms" no longer needs its permissive WITH CHECK escape hatch — tighten it
-- back to require continued membership, matching the read/select policy.
alter policy "members update rooms" on rooms
  with check (
    auth.role() = 'authenticated'
    and (data -> 'players') ? auth.uid()::text
  );
