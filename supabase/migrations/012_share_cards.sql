-- Yappa: shareable game cards.
--
-- From Game End, a player can share a link (yappa-three.vercel.app/c/<id>) whose preview is
-- a picture of the game: the score and the chains. The card is built here from the room's
-- own history, never from text the client sends, so nobody can put made-up words on a card
-- served from our site. Rooms are deleted after 24 hours; cards are kept so links keep working.
--
-- A card holds only the game: each round's secret word, chain and result, and the score.
-- No player names, IDs or room codes.

create table if not exists share_cards (
  id text primary key,
  created_at timestamptz not null default now(),
  -- md5 of the game's history: sharing the same game again returns the same card.
  game_hash text not null unique,
  max_rounds int not null,
  -- [{ "round", "category", "targetWord", "chain", "outcome" }] in round order.
  rounds jsonb not null
);
alter table share_cards enable row level security; -- no policies: definer functions only

-- The caller's finished game as a card; returns its id. Only players in the room, and only
-- once the game is over.
create or replace function create_share_card(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  card_rounds jsonb;
  hash text;
  card_id text;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'gameover' then
    raise exception 'the game is not over';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'round', (h ->> 'round')::int,
           'category', h ->> 'category',
           'targetWord', h ->> 'targetWord',
           'chain', coalesce(h -> 'chain', '[]'::jsonb),
           'outcome', h ->> 'outcome'
         ) order by (h ->> 'round')::int), '[]'::jsonb)
  into card_rounds
  from jsonb_each(coalesce(room_data -> 'history', '{}'::jsonb)) as e(k, h);
  if jsonb_array_length(card_rounds) = 0 then
    raise exception 'no rounds to share';
  end if;

  -- The room code and start time make two games with identical rounds distinct.
  hash := md5(p_code || ':' || coalesce(room_data ->> 'createdAt', '') || ':' || card_rounds::text);
  select id into card_id from share_cards where game_hash = hash;
  if card_id is not null then
    return card_id;
  end if;

  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
    into card_id from generate_series(1, 8);
    exit when not exists (select 1 from share_cards where id = card_id);
  end loop;
  insert into share_cards (id, game_hash, max_rounds, rounds)
  values (card_id, hash, coalesce((room_data ->> 'maxRounds')::int, 9), card_rounds);
  perform _bump_stat('cards_shared');
  return card_id;
end;
$$;

-- A card for the public card page and its preview image. Anyone with the link may read it.
create or replace function get_share_card(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', id, 'maxRounds', max_rounds, 'rounds', rounds)
  from share_cards
  where id = p_id;
$$;

revoke all on function create_share_card(text) from public, anon;
grant execute on function create_share_card(text) to authenticated;
revoke all on function get_share_card(text) from public;
grant execute on function get_share_card(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention: cards are kept for a year (replaces migration 009's version)
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
