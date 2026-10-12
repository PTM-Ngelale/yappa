-- Online play with strangers:
--   * quick_match() drops the caller into the oldest open public lobby, or opens a new one;
--   * set_room_public() lets a host open a friends' lobby to strangers to fill a seat;
--   * lobby_heartbeat() keeps a lobby player marked present, and clears players who've
--     gone quiet out of public lobbies, so nobody gets matched into a dead room;
--   * names and chain words are checked against blocked_words;
--   * report_player() records a report (with a snapshot of the game) for review.
-- A public game starts itself when full — the host's app runs the countdown (see lobby.tsx).

-- ---------------------------------------------------------------------------
-- Public rooms
-- ---------------------------------------------------------------------------

alter table rooms add column if not exists is_public boolean not null default false;
create index if not exists rooms_public_lobby on rooms (created_at) where is_public;

-- A lobby player counts as gone after this long without a heartbeat (the app sends one
-- every 15s; the slack covers a quick trip to another app to share the code).
create or replace function _lobby_stale_ms()
returns bigint language sql immutable as $$ select 90000::bigint $$;

-- Removes players who've stopped sending heartbeats from a public lobby (never p_keep),
-- hands the host role on if needed, and deletes the room if nobody is left.
-- Returns the room's new data, or null if it was deleted. Caller must hold the row lock.
create or replace function _prune_public_lobby(p_code text, p_room jsonb, p_keep text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  players jsonb := '{}'::jsonb;
  item record;
  new_host text;
begin
  for item in select key, value from jsonb_each(p_room -> 'players') loop
    if item.key = p_keep
       or coalesce((item.value ->> 'lastSeenAt')::bigint, 0) > now_ms - _lobby_stale_ms() then
      players := players || jsonb_build_object(item.key, item.value);
    end if;
  end loop;

  if players = p_room -> 'players' then
    return p_room;
  end if;
  if players = '{}'::jsonb then
    delete from rooms where code = p_code;
    return null;
  end if;

  new_host := p_room ->> 'hostUid';
  if not (players ? new_host) then
    select key into new_host from jsonb_each(players)
    order by (value ->> 'lastSeenAt')::bigint, key limit 1;
  end if;

  p_room := p_room || jsonb_build_object('players', players, 'hostUid', new_host);
  update rooms set data = p_room where code = p_code;
  return p_room;
end;
$$;

revoke all on function _lobby_stale_ms() from public, anon, authenticated;
revoke all on function _prune_public_lobby(text, jsonb, text) from public, anon, authenticated;

-- "Play online": join the oldest open public lobby, or open a new one. Returns the code.
create or replace function quick_match(p_player jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller text := auth.uid()::text;
  me jsonb;
  candidate record;
  room_data jsonb;
  new_code text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if caller is null or p_player ->> 'uid' is distinct from caller then
    raise exception 'player uid must match the authenticated caller';
  end if;
  me := _clean_player(p_player);

  -- Already waiting in a public lobby (e.g. tapped twice)? Stay there.
  select code into new_code from rooms
  where is_public and data ->> 'status' = 'lobby' and (data -> 'players') ? caller
  limit 1;
  if new_code is not null then
    return new_code;
  end if;

  for candidate in
    select code from rooms
    where is_public and data ->> 'status' = 'lobby' and created_at > now() - interval '2 hours'
    order by created_at
    for update skip locked
  loop
    select data into room_data from rooms where code = candidate.code;
    room_data := _prune_public_lobby(candidate.code, room_data, caller);
    if room_data is not null
       and (select count(*) from jsonb_object_keys(room_data -> 'players')) < 3 then
      update rooms
      set data = jsonb_set(room_data, array['players', caller], me, true)
      where code = candidate.code;
      return candidate.code;
    end if;
  end loop;

  -- Nobody waiting: open a new public lobby with the caller as host.
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * 32)::int, 1), '')
    into new_code from generate_series(1, 4);
    exit when not exists (select 1 from rooms where code = new_code);
  end loop;
  insert into rooms (code, is_public, data) values (new_code, true, jsonb_build_object(
    'hostUid', caller,
    'status', 'lobby',
    'isPublic', true,
    'round', 1,
    'maxRounds', 9,
    'playerOrder', null,
    'chain', null,
    'category', '',
    'secondsRemaining', 30,
    'activeKnowerUid', '',
    'guesserUid', '',
    'players', jsonb_build_object(caller, me),
    'typing', '{}'::jsonb,
    'linkChecks', '{}'::jsonb,
    'history', '{}'::jsonb,
    'createdAt', (extract(epoch from now()) * 1000)::bigint
  ));
  return new_code;
end;
$$;

-- Host, in the lobby: open the room to Play online (or close it again).
create or replace function set_room_public(p_code text, p_public boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'lobby' then
    raise exception 'the game has already started';
  end if;
  update rooms
  set is_public = p_public,
      data = room_data || jsonb_build_object('isPublic', p_public)
  where code = p_code;
end;
$$;

-- Every lobby player, every 15s: "still here". Also clears out players who've gone quiet,
-- in public lobbies only — friends in a private lobby can take their time.
create or replace function lobby_heartbeat(p_code text)
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
  if room_data ->> 'status' <> 'lobby' then
    return;
  end if;
  room_data := jsonb_set(
    room_data, array['players', caller, 'lastSeenAt'],
    to_jsonb((extract(epoch from now()) * 1000)::bigint)
  );
  update rooms set data = room_data where code = p_code;
  if coalesce((room_data ->> 'isPublic')::boolean, false) then
    perform _prune_public_lobby(p_code, room_data, caller);
  end if;
end;
$$;

revoke all on function quick_match(jsonb) from public, anon;
revoke all on function set_room_public(text, boolean) from public, anon;
revoke all on function lobby_heartbeat(text) from public, anon;
grant execute on function quick_match(jsonb) to authenticated;
grant execute on function set_room_public(text, boolean) to authenticated;
grant execute on function lobby_heartbeat(text) to authenticated;

-- Replaces migration 005's version: also marks everyone present, so a public lobby that
-- just came back from Play Again isn't cleared before their next heartbeat arrives.
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

-- ---------------------------------------------------------------------------
-- Offensive-word filter
-- ---------------------------------------------------------------------------

-- 'token': blocks a word that appears on its own (so "Scunthorpe" or "class" are fine).
-- 'substring': blocks the word anywhere, for slurs that don't occur inside normal words.
-- Add rows in the Supabase table editor to extend the list; no deploy needed.
create table if not exists blocked_words (
  word text primary key,
  match text not null default 'token' check (match in ('token', 'substring'))
);
alter table blocked_words enable row level security; -- no policies: server-side only

insert into blocked_words (word, match) values
  ('fuck', 'substring'), ('nigger', 'substring'), ('nigga', 'substring'), ('faggot', 'substring'),
  ('motherfucker', 'token'), ('fucker', 'token'), ('fucking', 'token'), ('fck', 'token'), ('fuk', 'token'),
  ('shit', 'token'), ('shite', 'token'), ('bullshit', 'token'), ('shithead', 'token'),
  ('cunt', 'token'), ('cunts', 'token'), ('twat', 'token'), ('wanker', 'token'), ('wank', 'token'),
  ('bitch', 'token'), ('bitches', 'token'), ('bastard', 'token'), ('asshole', 'token'), ('arsehole', 'token'),
  ('dickhead', 'token'), ('cocksucker', 'token'), ('pussy', 'token'), ('slut', 'token'), ('whore', 'token'),
  ('blowjob', 'token'), ('handjob', 'token'), ('cum', 'token'), ('jizz', 'token'), ('dildo', 'token'),
  ('porn', 'token'), ('porno', 'token'), ('rape', 'token'), ('rapist', 'token'), ('raping', 'token'),
  ('nazi', 'token'), ('hitler', 'token'), ('kkk', 'token'),
  ('fag', 'token'), ('fags', 'token'), ('dyke', 'token'), ('tranny', 'token'),
  ('retard', 'token'), ('retarded', 'token'), ('spastic', 'token'), ('spaz', 'token'),
  ('kike', 'token'), ('chink', 'token'), ('gook', 'token'), ('spic', 'token'), ('wetback', 'token'),
  ('coon', 'token'), ('paki', 'token'), ('raghead', 'token'), ('towelhead', 'token'), ('beaner', 'token')
on conflict (word) do nothing;

-- Lower-cases, undoes common letter swaps (f4ck, $h1t) and drops accents.
create or replace function _filter_normalize(p_text text)
returns text
language sql
immutable
as $$
  select translate(lower(coalesce(p_text, '')), '0134578@$!|àáâäãåèéêëìíîïòóôöõùúûüçñ', 'oieastbasiiaaaaaaeeeeiiiiooooouuuucn');
$$;

create or replace function _is_offensive(p_text text)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  norm text := _filter_normalize(p_text);
  compact text := regexp_replace(norm, '[^a-z]', '', 'g');
  tokens text[];
begin
  if compact = '' then
    return false;
  end if;
  -- Each word on its own, plus the whole thing squashed together ("f.u.c.k", "f u c k"),
  -- each also with stretched letters squeezed ("fuuuck" -> "fuck", "niggggger" -> "nigger").
  tokens := array(select t from regexp_split_to_table(norm, '[^a-z]+') t where t <> '') || compact;
  tokens := tokens
    || array(select regexp_replace(t, '([a-z])\1{2,}', '\1', 'g') from unnest(tokens) t)
    || array(select regexp_replace(t, '([a-z])\1{2,}', '\1\1', 'g') from unnest(tokens) t);
  return exists (select 1 from blocked_words b where b.match = 'token' and b.word = any (tokens))
      or exists (select 1 from blocked_words b, unnest(tokens) t where b.match = 'substring' and t like '%' || b.word || '%');
end;
$$;

revoke all on function _filter_normalize(text) from public, anon, authenticated;
revoke all on function _is_offensive(text) from public, anon, authenticated;

-- Replaces migration 007's version: also rejects offensive names.
create or replace function _clean_player(p_player jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  player_name text := btrim(_strip_invisible(p_player ->> 'name'));
  color text := coalesce(p_player ->> 'avatarColor', '');
begin
  if char_length(player_name) < 2 or char_length(player_name) > 24 then
    raise exception 'name must be 2-24 characters';
  end if;
  if _is_offensive(player_name) then
    raise exception 'name not allowed';
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

revoke all on function _clean_player(jsonb) from public, anon, authenticated;

-- Replaces migration 007's version: identical except offensive words are rejected.
create or replace function submit_word(p_code text, p_round int, p_word text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  caller text := auth.uid()::text;
  word text := btrim(_strip_invisible(p_word));
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
  if _is_offensive(word) then
    raise exception 'word not allowed';
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

revoke all on function submit_word(text, int, text) from public, anon;
grant execute on function submit_word(text, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

-- Reviewed by the developer in the Supabase table editor. Kept 90 days (purge_expired_data).
create table if not exists player_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  room_code text not null,
  reporter_uid text not null,
  reported_uid text not null,
  reported_name text not null,
  reason text not null,
  -- What everyone saw: player names and every chain word, so the report survives the
  -- room being deleted.
  snapshot jsonb not null
);
alter table player_reports enable row level security; -- no policies: server-side only
create index if not exists player_reports_reporter on player_reports (reporter_uid, created_at);

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
      'chain', room_data -> 'chain',
      'history', (
        select coalesce(jsonb_agg(jsonb_build_object('round', key, 'chain', value -> 'chain', 'guess', value -> 'guess')), '[]'::jsonb)
        from jsonb_each(coalesce(room_data -> 'history', '{}'::jsonb))
      )
    )
  );
end;
$$;

revoke all on function report_player(text, text, text) from public, anon;
grant execute on function report_player(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Retention: also drop reports after 90 days (replaces migration 008's version)
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

  delete from public.player_reports where created_at < now() - interval '90 days';

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
