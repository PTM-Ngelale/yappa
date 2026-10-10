-- Fixes: any room member could write arbitrary room state. patch_room() applied whatever
-- JSON patches a client sent, and the "members update rooms" policy allowed direct
-- UPDATEs too — so a player could rewrite history to award themselves wins, end someone
-- else's turn, or reset the timer. Room creation likewise trusted a client-built object.
--
-- Every client write now goes through a narrow SECURITY DEFINER function that checks who
-- is calling and whether the move is legal right now, then makes exactly that change.
-- Clients can still read their rooms (and receive Realtime updates) but can no longer
-- INSERT or UPDATE them directly. AI link verdicts are written by the validate-link edge
-- function (service role) instead of being reported by the client.

drop policy if exists "members update rooms" on rooms;
drop policy if exists "host creates rooms" on rooms;
drop function if exists patch_room(text, jsonb);

-- ---------------------------------------------------------------------------
-- Helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Locks and returns a room the caller belongs to, or raises.
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
  if room_data is null then
    raise exception 'room % not found', p_code;
  end if;
  if not ((room_data -> 'players') ? auth.uid()::text) then
    raise exception 'not a member of room %', p_code;
  end if;
  return room_data;
end;
$$;

-- Only the fields a player profile should have, from whatever the client sent.
create or replace function _clean_player(p_player jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  player_name text := btrim(coalesce(p_player ->> 'name', ''));
  color text := coalesce(p_player ->> 'avatarColor', '');
begin
  if char_length(player_name) < 2 or char_length(player_name) > 24 then
    raise exception 'name must be 2-24 characters';
  end if;
  if color !~ '^#[0-9A-Fa-f]{6}$' then
    color := '#9E9E9E';
  end if;
  return jsonb_build_object(
    'uid', auth.uid()::text,
    'name', player_name,
    'avatarColor', color,
    'role', 'knower',
    'lastSeenAt', (extract(epoch from now()) * 1000)::bigint
  );
end;
$$;

-- Mirrors KnowerActiveScreen's matchesTarget(), so a Knower can't skip the client check
-- and simply submit the answer.
create or replace function _is_target_variant(p_word text, p_target text)
returns boolean
language sql
immutable
as $$
  with n as (select lower(btrim(p_word)) w, lower(btrim(p_target)) t)
  select w = t or w in (
    t || 's', t || 'es', t || 'ing', t || 'ed', t || 'er', t || 'ers',
    regexp_replace(t, 'e$', 'ing'), regexp_replace(t, 'e$', 'ed'),
    regexp_replace(t, 'y$', 'ies'), regexp_replace(t, 'y$', 'ied')
  ) from n;
$$;

revoke all on function _require_member(text) from public, anon, authenticated;
revoke all on function _clean_player(jsonb) from public, anon, authenticated;
revoke all on function _is_target_variant(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lobby
-- ---------------------------------------------------------------------------

create or replace function create_room(p_code text, p_player jsonb)
returns void
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
  ));
end;
$$;

-- Same checks as migration 002's version, but builds the player record server-side
-- instead of storing whatever object the client sent.
create or replace function join_room(p_code text, p_player jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  player_uid text := auth.uid()::text;
  player_count int;
begin
  if player_uid is null or p_player ->> 'uid' is distinct from player_uid then
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
  set data = jsonb_set(room_data, array['players', player_uid], _clean_player(p_player), true)
  where code = p_code;
end;
$$;

-- Replaces migration 003's version. Now that host-only moves (start, advance, timer) are
-- enforced server-side, a departing host must hand the role on — otherwise the remaining
-- players are stuck in a room nobody can start. The last player out deletes the room
-- (cascading to its deck and round secrets).
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
    select uid into new_host
    from jsonb_array_elements_text(coalesce(room_data -> 'playerOrder', '[]'::jsonb)) uid
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

-- ---------------------------------------------------------------------------
-- Gameplay
-- ---------------------------------------------------------------------------

-- Active Knower adds a word: appends it, hands the turn to the other Knower, and resets
-- the per-turn timer. Returns the word's index in the chain (for the AI link check).
create or replace function submit_word(p_code text, p_round int, p_word text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  caller text := auth.uid()::text;
  word text := btrim(coalesce(p_word, ''));
  target text;
  next_knower text;
  new_chain jsonb;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    raise exception 'round is not in play';
  end if;
  if room_data ->> 'activeKnowerUid' <> caller then
    raise exception 'not your turn';
  end if;
  if word !~ '^\S{1,30}$' then
    raise exception 'one word, up to 30 characters';
  end if;
  select target_word into target from round_secrets where code = p_code and round = p_round;
  if _is_target_variant(word, target) then
    raise exception 'that is the target word';
  end if;

  select uid into next_knower
  from jsonb_array_elements_text(room_data -> 'playerOrder') uid
  where uid <> caller and uid <> room_data ->> 'guesserUid';

  new_chain := coalesce(room_data -> 'chain', '[]'::jsonb);
  if jsonb_typeof(new_chain) <> 'array' then
    new_chain := '[]'::jsonb;
  end if;
  new_chain := new_chain || to_jsonb(word);

  update rooms
  set data = room_data || jsonb_build_object(
    'chain', new_chain,
    'activeKnowerUid', next_knower,
    'secondsRemaining', 30,
    'typing', coalesce(room_data -> 'typing', '{}'::jsonb) - caller
  )
  where code = p_code;
  return jsonb_array_length(new_chain) - 1;
end;
$$;

-- "[name] is typing…" — only the active Knower's own flag.
create or replace function set_typing(p_code text, p_typing boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  caller text := auth.uid()::text;
  typing jsonb;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'playing' or room_data ->> 'activeKnowerUid' <> caller then
    return; -- turn already moved on — a stale indicator update is harmless to drop
  end if;
  typing := coalesce(room_data -> 'typing', '{}'::jsonb);
  typing := case when p_typing then typing || jsonb_build_object(caller, true) else typing - caller end;
  update rooms set data = jsonb_set(room_data, '{typing}', typing, true) where code = p_code;
end;
$$;

-- Host's once-a-second timer tick. The server does the decrement, so the host can only
-- advance time, never add it back.
create or replace function tick_timer(p_code text, p_round int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    return;
  end if;
  update rooms
  set data = jsonb_set(
    room_data,
    '{secondsRemaining}',
    to_jsonb(greatest(0, coalesce((room_data ->> 'secondsRemaining')::int, 30) - 1)),
    true
  )
  where code = p_code;
end;
$$;

-- Guesser locked in a guess — holds the host's timer at zero while validate-guess judges it.
create or replace function mark_guess_pending(p_code text, p_round int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'guesserUid' <> auth.uid()::text
    or room_data ->> 'status' <> 'playing'
    or (room_data ->> 'round')::int <> p_round then
    raise exception 'no guess can be made right now';
  end if;
  update rooms set data = room_data || '{"guessPending": true}'::jsonb where code = p_code;
end;
$$;

-- Disconnect overlay's "End game now" (or its countdown running out) — any player.
create or replace function end_game(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' in ('playing', 'resolution') then
    update rooms set data = room_data || '{"status": "gameover"}'::jsonb where code = p_code;
  end if;
end;
$$;

-- Game End's "Play Again" — any player, only once the game is over.
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
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'gameover' then
    return;
  end if;
  players := room_data -> 'players';
  for player_uid in select jsonb_object_keys(players) loop
    players := jsonb_set(players, array[player_uid, 'role'], '"knower"');
  end loop;
  update rooms
  set data = room_data || jsonb_build_object(
    'status', 'lobby',
    'round', 1,
    'playerOrder', null,
    'chain', null,
    'category', '',
    'secondsRemaining', 30,
    'activeKnowerUid', '',
    'guesserUid', '',
    'players', players,
    'typing', '{}'::jsonb,
    'linkChecks', '{}'::jsonb,
    'guessPending', null,
    'history', '{}'::jsonb
  )
  where code = p_code;
end;
$$;

-- validate-link (service role) records the AI's verdict on chain[p_index]. p_word guards
-- against a stale verdict landing on a different round or word.
create or replace function record_link_check(p_code text, p_round int, p_index int, p_word text, p_valid boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null
    or room_data ->> 'status' <> 'playing'
    or (room_data ->> 'round')::int <> p_round
    or room_data -> 'chain' ->> p_index is distinct from p_word then
    return;
  end if;
  update rooms
  set data = jsonb_set(
    room_data,
    '{linkChecks}',
    coalesce(room_data -> 'linkChecks', '{}'::jsonb)
      || jsonb_build_object(p_index::text, case when p_valid then 'valid' else 'invalid' end),
    true
  )
  where code = p_code;
end;
$$;

revoke all on function leave_room(text, text) from public, anon;
revoke all on function create_room(text, jsonb) from public, anon;
revoke all on function join_room(text, jsonb) from public, anon;
revoke all on function submit_word(text, int, text) from public, anon;
revoke all on function set_typing(text, boolean) from public, anon;
revoke all on function tick_timer(text, int) from public, anon;
revoke all on function mark_guess_pending(text, int) from public, anon;
revoke all on function end_game(text) from public, anon;
revoke all on function reset_room_to_lobby(text) from public, anon;
revoke all on function record_link_check(text, int, int, text, boolean) from public, anon, authenticated;

grant execute on function leave_room(text, text) to authenticated;
grant execute on function create_room(text, jsonb) to authenticated;
grant execute on function join_room(text, jsonb) to authenticated;
grant execute on function submit_word(text, int, text) to authenticated;
grant execute on function set_typing(text, boolean) to authenticated;
grant execute on function tick_timer(text, int) to authenticated;
grant execute on function mark_guess_pending(text, int) to authenticated;
grant execute on function end_game(text) to authenticated;
grant execute on function reset_room_to_lobby(text) to authenticated;
grant execute on function record_link_check(text, int, int, text, boolean) to service_role;
