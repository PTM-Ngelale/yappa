-- Yappa: privacy-safe game counts.
--
-- Games are deleted after 24 hours (migration 008), so without this there are no numbers
-- for playtests, store listings or anyone who asks "how many people play?". This keeps
-- daily totals only: a date, a metric name and a count. No player IDs, names, room codes,
-- words or devices, so nothing in it can be tied back to a person.
--
-- Counted server-side from the room's own state changes (a trigger on rooms), so clients
-- can't inflate the numbers and the app needs no changes beyond saying how a join happened.
--
-- Metrics (one row per UTC day each):
--   games_created_private / games_created_public   a room was opened (Create / Play online)
--   joins_link / joins_code / joins_online         a player joined a lobby, and how
--   games_started                                  all 3 joined and the game began (incl. rematches)
--   games_finished                                 all 9 rounds were played
--   games_ended_early                              ended by a disconnect / "End game now"
--   rematches                                      "Play Again" from Game End
--
-- Read it in the SQL Editor, e.g.:
--   select day, metric, count from game_stats order by day desc, metric;

create table if not exists game_stats (
  day date not null,
  metric text not null,
  count int not null default 0,
  primary key (day, metric)
);
alter table game_stats enable row level security; -- no policies: server-side only

create or replace function _bump_stat(p_metric text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into game_stats (day, metric, count)
  values ((now() at time zone 'utc')::date, p_metric, 1)
  on conflict (day, metric) do update set count = game_stats.count + 1;
$$;

create or replace function _count_room_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status text;
  new_status text := new.data ->> 'status';
  source text;
begin
  if tg_op = 'INSERT' then
    perform _bump_stat(case when new.is_public then 'games_created_public' else 'games_created_private' end);
    return new;
  end if;

  old_status := old.data ->> 'status';

  -- A player joined a lobby. join_room says whether they came by invite link or typed the
  -- code; anyone else arriving in a public lobby came through Play online.
  if new_status = 'lobby'
     and (select count(*) from jsonb_object_keys(coalesce(new.data -> 'players', '{}'::jsonb)))
       > (select count(*) from jsonb_object_keys(coalesce(old.data -> 'players', '{}'::jsonb))) then
    source := nullif(current_setting('yappa.join_source', true), '');
    perform _bump_stat('joins_' || coalesce(source, case when new.is_public then 'online' else 'code' end));
  end if;

  if old_status is distinct from new_status then
    if old_status = 'lobby' and new_status = 'playing' then
      perform _bump_stat('games_started');
    elsif new_status = 'gameover' then
      perform _bump_stat(
        case when old_status = 'resolution'
               and (new.data ->> 'round')::int >= coalesce((new.data ->> 'maxRounds')::int, 9)
             then 'games_finished' else 'games_ended_early' end
      );
    elsif old_status = 'gameover' and new_status = 'lobby' then
      perform _bump_stat('rematches');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_count_change on rooms;
create trigger rooms_count_change
  after insert or update of data on rooms
  for each row execute function _count_room_change();

-- join_room, plus how the player got there: 'link' (an invite link) or 'code' (typed it).
-- The two-argument join_room stays for older app versions; their joins count as 'code'.
create or replace function join_room(p_code text, p_player jsonb, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source in ('link', 'code') then
    perform set_config('yappa.join_source', p_source, true);
  end if;
  perform join_room(p_code, p_player);
  perform set_config('yappa.join_source', '', true);
end;
$$;

revoke all on function _bump_stat(text) from public, anon, authenticated;
revoke all on function _count_room_change() from public, anon, authenticated;
revoke all on function join_room(text, jsonb, text) from public, anon;
grant execute on function join_room(text, jsonb, text) to authenticated;
