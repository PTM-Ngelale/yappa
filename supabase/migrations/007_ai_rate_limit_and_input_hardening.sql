-- 1. Rate-limits the AI referees. Every validate-guess / validate-link call that would reach
--    Anthropic first takes a slot here: a per-player hourly cap stops one account running up
--    the bill, and a global hourly cap is a circuit breaker against many throwaway accounts.
--    When a cap is hit the edge functions degrade gracefully (local-only guess matching, no
--    link flag) rather than failing the game.
-- 2. Strips invisible characters (zero-width, bidi overrides, control chars) from player
--    names and chain words. Otherwise "Tram​poline" renders as the target word while
--    slipping past _is_target_variant, and names could spoof others with direction overrides.

-- ---------------------------------------------------------------------------
-- AI quota
-- ---------------------------------------------------------------------------

create table if not exists ai_usage (
  uid text not null,
  at timestamptz not null default now()
);
create index if not exists ai_usage_uid_at on ai_usage (uid, at);
create index if not exists ai_usage_at on ai_usage (at);
alter table ai_usage enable row level security; -- no policies: service role only

-- Takes one AI call slot for p_uid, or returns false if the player or everyone combined
-- is over their cap for the past hour. Called by the edge functions (service role) only.
create or replace function take_ai_quota(p_uid text, p_per_user_hourly int, p_global_hourly int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used int;
begin
  -- Serialise concurrent calls so parallel requests can't all slip under the cap.
  perform pg_advisory_xact_lock(hashtext('take_ai_quota'));

  delete from ai_usage where at < now() - interval '1 hour';

  select count(*) into used from ai_usage where uid = p_uid;
  if used >= p_per_user_hourly then
    return false;
  end if;
  select count(*) into used from ai_usage;
  if used >= p_global_hourly then
    return false;
  end if;

  insert into ai_usage (uid) values (p_uid);
  return true;
end;
$$;

revoke all on function take_ai_quota(text, int, int) from public, anon, authenticated;
grant execute on function take_ai_quota(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Invisible-character stripping
-- ---------------------------------------------------------------------------

create or replace function _strip_invisible(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    coalesce(p_text, ''),
    '[\u0000-\u001F\u007F-\u009F­؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]',
    '',
    'g'
  );
$$;

revoke all on function _strip_invisible(text) from public, anon, authenticated;

-- Replaces migration 005's version: same rules, names stripped of invisible characters first.
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

-- Replaces migration 005's version: identical except the word is stripped of invisible
-- characters before it's validated, compared with the target, and stored.
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
