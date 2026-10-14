-- Yappa: only a room's players can join its Realtime channels.
--
-- The app's two channels per room, `room:<CODE>` (live room updates) and
-- `presence:room:<CODE>` (who's online), were public: anyone with the app's public key could
-- join a room's presence channel, see its players' ids, and announce themselves as one of
-- them, hiding a real player's disconnect. The app now joins both as private channels, which
-- Realtime only lets a client join if these policies on realtime.messages allow it:
--   * reading (joining, receiving presence): players listed in that room;
--   * writing (presence tracking): the same players, presence only. Nobody may send
--     broadcast messages on these channels.
-- Room updates themselves still come through postgres_changes, which the rooms table's own
-- RLS already limits to members.
--
-- Rollout: these policies do nothing while public channels are allowed, so apply this first,
-- ship the app that joins private channels, then turn off "Allow public access" in the
-- dashboard (Realtime settings) once players have updated. Older apps join public channels
-- and stop getting live updates from that point.

-- The room code a channel topic belongs to, or null for any other topic.
create or replace function _room_channel_code(p_topic text)
returns text
language sql
immutable
as $$
  select case
    when p_topic ~ '^room:[A-Z0-9]{4}$' then substr(p_topic, 6)
    when p_topic ~ '^presence:room:[A-Z0-9]{4}$' then substr(p_topic, 15)
  end;
$$;

-- Evaluated as the joining player inside the policies below, so they need to call it.
revoke all on function _room_channel_code(text) from public, anon;
grant execute on function _room_channel_code(text) to authenticated;

-- Supabase always has the realtime schema; the local PGlite test database stubs it.
do $do$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages not available: room channel policies not created';
    return;
  end if;

  drop policy if exists "room players join room channels" on realtime.messages;
  create policy "room players join room channels" on realtime.messages
    for select to authenticated
    using (
      exists (
        select 1 from public.rooms r
        where r.code = public._room_channel_code(realtime.topic())
          and (r.data -> 'players') ? auth.uid()::text
      )
    );

  drop policy if exists "room players track presence" on realtime.messages;
  create policy "room players track presence" on realtime.messages
    for insert to authenticated
    with check (
      realtime.messages.extension = 'presence'
      and realtime.topic() like 'presence:room:%'
      and exists (
        select 1 from public.rooms r
        where r.code = public._room_channel_code(realtime.topic())
          and (r.data -> 'players') ? auth.uid()::text
      )
    );
end
$do$;
