-- Clue Line: versus mode, two teams racing on the same word.
--
-- A private room can switch to versus in the lobby. Players split into two teams, Red and
-- Blue, of 2 or 3 each (4 to 6 players: a versus room seats 6). Players pick their own side
-- and the host can move anyone or shuffle the teams.
--
-- Every round both teams get the same secret word at once. Each team has its own Guesser
-- and its own description feed, and plays it like a normal round: its Knowers take turns
-- (15 second turns; a team with one Knower keeps the turn all round, as in duo) and its
-- Guesser guesses as often as they like, 3 seconds apart. The first Guesser to get it wins
-- the round for their team; if the 75 second round clock runs out nobody scores.
--   * 6 rounds, so on a team of 2 each player guesses 3 times, on a team of 3 twice. The
--     deck is 2 Easy, 2 Medium, 2 Hard, easiest first.
--   * Off-limits words are on (versus needs a newer app anyway).
--   * The app shows a player only their own team's clues, and how many the other team
--     has given. Room data does carry both feeds, as it does every clue today: this is a
--     game between friends with a room code, not Play online, which never matches versus.
--
-- Room data (data.mode = 'versus'):
--   lobby:   data.versus (the host's switch); players[uid].team ('red' or 'blue').
--   playing: data.sides.<team> = { order, guesserUid, activeKnowerUid, feed, turnIndex },
--            the team's own copy of the round fields that sit at the top level in other
--            games (those stay empty). Clocks: the round clock is still turn_clocks; each
--            team's turn clock and guess cooldown are in side_clocks.
--   history: each round also has `winner` (the team, or null) and `sides` (each team's
--            Guesser, feed and clue count). Its feed, chain and guesserUid are the
--            winning team's, so the share card and reports still read it.
--
-- Older apps can't show any of this. join_room only seats a player in a versus lobby if
-- their app says it can play versus (the newer 4-argument join_room, players[uid].canVersus),
-- and the host can only switch versus on once everyone in the lobby has such an app.
-- The validate-guess edge function now passes the Guesser to record_guess, so it knows
-- which team guessed.

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

-- Versus in one place. The app mirrors these in src/game/versus.ts.
create or replace function _versus_config()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('minTeam', 2, 'maxTeam', 3, 'rounds', 6, 'roundMs', 75000);
$$;

create or replace function _teams()
returns text[]
language sql
immutable
as $$
  select array['red', 'blue'];
$$;

revoke all on function _versus_config() from public, anon, authenticated;
revoke all on function _teams() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Secrets and clocks
-- ---------------------------------------------------------------------------

-- A versus round has two Guessers; neither may read the word.
alter table round_secrets add column if not exists guesser_uids text[] not null default '{}';

drop policy if exists "knowers read round secret" on round_secrets;
create policy "knowers read round secret" on round_secrets
  for select using (
    auth.role() = 'authenticated'
    and auth.uid()::text <> guesser_uid
    and not (auth.uid()::text = any(guesser_uids))
    and exists (
      select 1 from rooms r
      where r.code = round_secrets.code
        and (r.data -> 'players') ? auth.uid()::text
    )
  );

-- Each team's turn clock and guess cooldown in a versus round (the round clock is shared:
-- turn_clocks.round_started_at).
create table if not exists side_clocks (
  code text not null references rooms (code) on delete cascade,
  side text not null,
  started_at timestamptz not null,
  last_guess_at timestamptz,
  guess_pending_at timestamptz,
  primary key (code, side)
);
alter table side_clocks enable row level security; -- no policies: definer functions only
revoke all on side_clocks from anon, authenticated;

-- A round starting restarts both teams' turn clocks; a team's turn moving on restarts its own.
create or replace function _restart_side_clocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team text;
begin
  if new.data ->> 'status' <> 'playing' or new.data ->> 'mode' is distinct from 'versus' then
    return new;
  end if;
  if old.data ->> 'status' is distinct from 'playing'
     or old.data ->> 'round' is distinct from new.data ->> 'round' then
    delete from side_clocks where code = new.code;
    insert into side_clocks (code, side, started_at)
    select new.code, t, now() from jsonb_object_keys(new.data -> 'sides') t;
    return new;
  end if;
  for team in select jsonb_object_keys(new.data -> 'sides') loop
    if old.data -> 'sides' -> team ->> 'turnIndex' is distinct from new.data -> 'sides' -> team ->> 'turnIndex' then
      update side_clocks set started_at = now() where code = new.code and side = team;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function _restart_side_clocks() from public, anon, authenticated;

drop trigger if exists rooms_restart_side_clocks on rooms;
create trigger rooms_restart_side_clocks
  after update of data on rooms
  for each row execute function _restart_side_clocks();

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

-- The team p_uid plays on in this versus game, or null.
create or replace function _side_of(p_room jsonb, p_uid text)
returns text
language sql
immutable
as $$
  select s.key from jsonb_each(coalesce(p_room -> 'sides', '{}'::jsonb)) s
  where (s.value -> 'order') ? p_uid
  limit 1;
$$;

-- The room as p_side plays it: the team's own order, Guesser, active Knower, feed and turn
-- at the top level, where the turn and guess logic of other games reads them.
create or replace function _side_view(p_room jsonb, p_side text)
returns jsonb
language sql
immutable
as $$
  select p_room || jsonb_build_object(
    'playerOrder', side -> 'order',
    'guesserUid', side -> 'guesserUid',
    'activeKnowerUid', side -> 'activeKnowerUid',
    'feed', coalesce(side -> 'feed', '[]'::jsonb),
    'turnIndex', coalesce(side -> 'turnIndex', '0'::jsonb)
  )
  from (select p_room -> 'sides' -> p_side as side) s;
$$;

-- p_room with p_changes made to p_side's round fields, or to the top level when p_side is null.
create or replace function _with_side(p_room jsonb, p_side text, p_changes jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p_side is null then p_room || p_changes
    else jsonb_set(p_room, array['sides', p_side], (p_room -> 'sides' -> p_side) || p_changes)
  end;
$$;

-- Whether this round has a single Knower, who keeps the turn all round: duo, or a versus
-- team of 2 (p_room is that team's view).
create or replace function _single_knower(p_room jsonb)
returns boolean
language sql
immutable
as $$
  select p_room ->> 'mode' = 'duo'
    or (p_room ->> 'mode' = 'versus' and jsonb_array_length(coalesce(p_room -> 'playerOrder', '[]'::jsonb)) <= 2);
$$;

-- The team with fewer players in p_players, Red on a tie.
create or replace function _smaller_team(p_players jsonb)
returns text
language sql
immutable
as $$
  select case
    when count(*) filter (where value ->> 'team' = 'red') <= count(*) filter (where value ->> 'team' = 'blue')
      then 'red' else 'blue'
  end
  from jsonb_each(coalesce(p_players, '{}'::jsonb));
$$;

revoke all on function _side_of(jsonb, text) from public, anon, authenticated;
revoke all on function _side_view(jsonb, text) from public, anon, authenticated;
revoke all on function _with_side(jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function _single_knower(jsonb) from public, anon, authenticated;
revoke all on function _smaller_team(jsonb) from public, anon, authenticated;

-- Replaces migration 022's version: a lone Knower's turn (duo, or a versus team of 2) lasts
-- the whole round.
create or replace function _turn_limit_ms(p_room jsonb)
returns int
language sql
stable
as $$
  select case
    when _single_knower(p_room) then _round_limit_ms(p_room)
    else coalesce((p_room ->> 'turnMs')::int, (_game_config() ->> 'turnMs')::int)
      + case when coalesce((p_room ->> 'turnIndex')::int, 0) = 0 then (_game_config() ->> 'introMs')::int else 0 end
  end;
$$;

-- ---------------------------------------------------------------------------
-- Lobby
-- ---------------------------------------------------------------------------

-- Replaces migration 020's version: a versus lobby seats 6 and only players whose app can
-- play versus; a newcomer to one joins the smaller team, and a player joining again keeps
-- their team. The 4-argument join_room below says the app can play versus.
create or replace function join_room(p_code text, p_player jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  player_uid text := auth.uid()::text;
  can_versus boolean := coalesce(current_setting('yappa.can_versus', true), '') = 'on';
  versus boolean;
  player_count int;
  seats int;
  me jsonb;
begin
  if player_uid is null or p_player ->> 'uid' is distinct from player_uid then
    raise exception 'player uid must match the authenticated caller';
  end if;
  me := _clean_player(p_player);
  perform _check_join_failures();

  select data into room_data from rooms where code = p_code for update;
  if room_data is null then
    perform _note_join_failure();
    return 'not-found';
  end if;
  if room_data ->> 'status' <> 'lobby' then
    perform _note_join_failure();
    return 'started';
  end if;
  versus := coalesce((room_data ->> 'versus')::boolean, false);
  if versus and not can_versus then
    return 'full'; -- an older app: it can't play versus
  end if;
  if not (room_data -> 'players' ? player_uid) then
    select count(*) into player_count from jsonb_object_keys(room_data -> 'players');
    seats := case
      when versus then (_versus_config() ->> 'maxTeam')::int * 2
      when coalesce((room_data ->> 'isPublic')::boolean, false) then (_player_limits() ->> 'public')::int
      else (_player_limits() ->> 'max')::int
    end;
    if player_count >= seats then
      perform _note_join_failure();
      return 'full';
    end if;
  end if;

  if can_versus then
    me := me || jsonb_build_object('canVersus', true);
  end if;
  if room_data -> 'players' -> player_uid ? 'team' then
    me := me || jsonb_build_object('team', room_data -> 'players' -> player_uid -> 'team');
  elsif versus then
    me := me || jsonb_build_object('team', _smaller_team(room_data -> 'players'));
  end if;

  update rooms
  set data = jsonb_set(room_data, array['players', player_uid], _free_color(room_data -> 'players', me), true)
  where code = p_code;
  return 'ok';
end;
$$;

-- join_room from an app that can play versus.
create or replace function join_room(p_code text, p_player jsonb, p_source text, p_versus boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  perform set_config('yappa.can_versus', case when p_versus then 'on' else '' end, true);
  result := join_room(p_code, p_player, p_source);
  perform set_config('yappa.can_versus', '', true);
  return result;
end;
$$;
revoke all on function join_room(text, jsonb, text, boolean) from public, anon;
grant execute on function join_room(text, jsonb, text, boolean) to authenticated;

-- Host, in the lobby: switch versus on or off. On: everyone needs an app that can play it,
-- and anyone without a team gets one (keeping them even). Off: only while the room fits a
-- normal game.
create or replace function set_versus(p_code text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  caller text := auth.uid()::text;
  players jsonb;
  player_uid text;
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'lobby' then
    raise exception 'the game has already started';
  end if;
  players := room_data -> 'players';
  if p_on then
    if coalesce((room_data ->> 'isPublic')::boolean, false) then
      raise exception 'online games cannot be versus';
    end if;
    -- The host is switching it on, so their app can play it.
    players := jsonb_set(players, array[caller, 'canVersus'], 'true'::jsonb);
    if exists (select 1 from jsonb_each(players) where not coalesce((value ->> 'canVersus')::boolean, false)) then
      raise exception 'someone needs to update the app to play versus';
    end if;
    for player_uid in select key from jsonb_each(players) order by key loop
      if not coalesce(players -> player_uid ->> 'team' = any(_teams()), false) then
        players := jsonb_set(players, array[player_uid, 'team'], to_jsonb(_smaller_team(players)));
      end if;
    end loop;
  elsif (select count(*) from jsonb_object_keys(players)) > (_player_limits() ->> 'max')::int then
    raise exception 'too many players for a normal game';
  end if;
  update rooms
  set data = room_data || jsonb_build_object('versus', p_on, 'players', players)
  where code = p_code;
end;
$$;
revoke all on function set_versus(text, boolean) from public, anon;
grant execute on function set_versus(text, boolean) to authenticated;

-- In a versus lobby: a player picks their own team, or the host moves anyone. A team holds 3.
create or replace function set_team(p_code text, p_uid text, p_team text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  caller text := auth.uid()::text;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'lobby' then
    raise exception 'the game has already started';
  end if;
  if not coalesce((room_data ->> 'versus')::boolean, false) then
    raise exception 'this is not a versus game';
  end if;
  if p_uid is distinct from caller and room_data ->> 'hostUid' is distinct from caller then
    raise exception 'only the host can move other players';
  end if;
  if not ((room_data -> 'players') ? p_uid) then
    raise exception 'that player is not in this game';
  end if;
  if not coalesce(p_team = any(_teams()), false) then
    raise exception 'unknown team';
  end if;
  if room_data -> 'players' -> p_uid ->> 'team' = p_team then
    return;
  end if;
  if (select count(*) from jsonb_each(room_data -> 'players') where value ->> 'team' = p_team)
     >= (_versus_config() ->> 'maxTeam')::int then
    raise exception 'that team is full';
  end if;
  update rooms
  set data = jsonb_set(room_data, array['players', p_uid, 'team'], to_jsonb(p_team))
  where code = p_code;
end;
$$;
revoke all on function set_team(text, text, text) from public, anon;
grant execute on function set_team(text, text, text) to authenticated;

-- Host, in a versus lobby: deal everyone into two teams at random (as even as they go).
create or replace function shuffle_teams(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  players jsonb;
  player_uid text;
  i int := 0;
  first_team text := (_teams())[1 + floor(random() * 2)::int];
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'lobby' then
    raise exception 'the game has already started';
  end if;
  if not coalesce((room_data ->> 'versus')::boolean, false) then
    raise exception 'this is not a versus game';
  end if;
  players := room_data -> 'players';
  for player_uid in select key from jsonb_each(players) order by random() loop
    players := jsonb_set(
      players,
      array[player_uid, 'team'],
      to_jsonb(case when i % 2 = 0 then first_team when first_team = 'red' then 'blue' else 'red' end)
    );
    i := i + 1;
  end loop;
  update rooms set data = jsonb_set(room_data, '{players}', players) where code = p_code;
end;
$$;
revoke all on function shuffle_teams(text) from public, anon;
grant execute on function shuffle_teams(text) to authenticated;

-- Replaces migration 020's version: a versus lobby can't go public.
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
  if p_public and coalesce((room_data ->> 'versus')::boolean, false) then
    raise exception 'versus games are played with friends';
  end if;
  if p_public
     and (select count(*) from jsonb_object_keys(room_data -> 'players')) >= (_player_limits() ->> 'public')::int then
    raise exception 'too many players to play online';
  end if;
  update rooms
  set is_public = p_public,
      data = room_data || jsonb_build_object('isPublic', p_public)
  where code = p_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting a game
-- ---------------------------------------------------------------------------

-- Replaces migration 022's version: a versus room starts a versus game (newer apps only):
-- each team's play order is shuffled, 6 rounds, 15 second turns, a 75 second round and
-- off-limits words.
create or replace function _start_game(p_code text, p_new_rules boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  play_order jsonb;
  team_order jsonb;
  sides jsonb := '{}'::jsonb;
  team text;
  player_count int;
  rounds int;
  duo boolean;
  versus boolean;
  vcfg jsonb := _versus_config();
  used text[];
  keep int := _used_word_memory();
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'lobby' then
    return; -- already started (e.g. a retried call): nothing to do
  end if;
  versus := coalesce((room_data ->> 'versus')::boolean, false);

  if versus then
    if not p_new_rules then
      raise exception 'update the app to play versus';
    end if;
    if exists (select 1 from jsonb_each(room_data -> 'players') where not coalesce(value ->> 'team' = any(_teams()), false)) then
      raise exception 'everyone needs a team';
    end if;
    play_order := '[]'::jsonb;
    foreach team in array _teams() loop
      select coalesce(jsonb_agg(key order by random()), '[]'::jsonb) into team_order
      from jsonb_each(room_data -> 'players') where value ->> 'team' = team;
      if jsonb_array_length(team_order) < (vcfg ->> 'minTeam')::int or jsonb_array_length(team_order) > (vcfg ->> 'maxTeam')::int then
        raise exception 'each team needs % or % players', vcfg ->> 'minTeam', vcfg ->> 'maxTeam';
      end if;
      sides := sides || jsonb_build_object(team, jsonb_build_object('order', team_order));
      play_order := play_order || team_order;
    end loop;
    player_count := jsonb_array_length(play_order);
    rounds := (vcfg ->> 'rounds')::int;
    duo := false;
  else
    select jsonb_agg(uid order by random()) into play_order
    from jsonb_object_keys(room_data -> 'players') uid;
    player_count := jsonb_array_length(play_order);
    if player_count < (_player_limits() ->> 'min')::int or player_count > (_player_limits() ->> 'max')::int then
      raise exception 'Yappa needs % to % players', _player_limits() ->> 'min', _player_limits() ->> 'max';
    end if;
    rounds := _rounds_for(player_count);
    duo := player_count = 2;
  end if;

  -- The room's history plus the game just played (decks from before migration 014 only
  -- carry the word, so look its id up).
  select d.used_word_ids || array(
    select coalesce(e ->> 'id', (select w.id from words w where w.word = e ->> 'word'))
    from jsonb_array_elements(d.words) with ordinality as t(e, ord)
    order by ord
  )
  into used
  from game_decks d where d.code = p_code;
  used := array_remove(coalesce(used, '{}'), null);
  if cardinality(used) > keep then
    used := used[cardinality(used) - keep + 1 :];
  end if;

  insert into game_decks (code, words, used_word_ids) values (p_code, _draw_deck(used, rounds), used)
  on conflict (code) do update set words = excluded.words, used_word_ids = excluded.used_word_ids;
  delete from round_secrets where code = p_code;

  update rooms
  set data = (room_data - 'turnMs' - 'roundMs' - 'offLimits' - 'sides') || jsonb_build_object(
    'playerOrder', play_order,
    'maxRounds', rounds,
    'mode', case when versus then 'versus' when duo then 'duo' else 'team' end,
    'clueBudget', case when duo then (_game_config() -> 'duoClues') else 'null'::jsonb end,
    'history', '{}'::jsonb
  ) || case
    when versus then jsonb_build_object(
      'sides', sides,
      'turnMs', (_game_config() -> 'timedTurnMs'),
      'roundMs', vcfg -> 'roundMs',
      'offLimits', true
    )
    when p_new_rules then _clocks_for(player_count) || jsonb_build_object('offLimits', true)
    else '{}'::jsonb
  end
  where code = p_code;

  perform _setup_round(p_code, 1);
end;
$$;
revoke all on function _start_game(text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rounds
-- ---------------------------------------------------------------------------

-- A versus round: on each team the Guesser moves on one place in the team's order and the
-- first Knower with it; both Guessers are kept from the word.
create or replace function _setup_versus_round(p_code text, p_round int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  deck_entry jsonb;
  entry_id text;
  sides jsonb;
  players jsonb;
  team text;
  team_order jsonb;
  guesser text;
  knowers text[];
  guessers text[] := '{}';
  player_uid text;
begin
  select data into room_data from rooms where code = p_code for update;
  select words -> (p_round - 1) into deck_entry from game_decks where code = p_code;
  if deck_entry is null then
    raise exception 'no word drawn for room % round %', p_code, p_round;
  end if;
  entry_id := coalesce(deck_entry ->> 'id', (select w.id from words w where w.word = deck_entry ->> 'word'));

  sides := room_data -> 'sides';
  players := room_data -> 'players';
  foreach team in array _teams() loop
    team_order := sides -> team -> 'order';
    guesser := team_order ->> ((p_round - 1) % jsonb_array_length(team_order));
    select array_agg(uid order by ord) into knowers
    from jsonb_array_elements_text(team_order) with ordinality as t(uid, ord)
    where uid <> guesser;
    sides := jsonb_set(sides, array[team], jsonb_build_object(
      'order', team_order,
      'guesserUid', guesser,
      'activeKnowerUid', knowers[((p_round - 1) % cardinality(knowers)) + 1],
      'feed', '[]'::jsonb,
      'turnIndex', 0
    ));
    guessers := guessers || guesser;
    for player_uid in select jsonb_array_elements_text(team_order) loop
      players := jsonb_set(
        players,
        array[player_uid, 'role'],
        to_jsonb(case when player_uid = guesser then 'guesser' else 'knower' end)
      );
    end loop;
  end loop;

  insert into round_secrets (code, round, target_word, guesser_uid, guesser_uids, word_id, meaning, forbidden)
  values (
    p_code, p_round, deck_entry ->> 'word', guessers[1], guessers, entry_id,
    coalesce((select w.meaning from words w where w.id = entry_id), ''),
    coalesce((select w.forbidden from words w where w.id = entry_id), '{}')
  )
  on conflict (code, round) do update
    set target_word = excluded.target_word, guesser_uid = excluded.guesser_uid,
        guesser_uids = excluded.guesser_uids, word_id = excluded.word_id,
        meaning = excluded.meaning, forbidden = excluded.forbidden;

  update rooms
  set data = room_data || jsonb_build_object(
    'status', 'playing',
    'round', p_round,
    'category', deck_entry ->> 'category',
    'activeKnowerUid', '',
    'guesserUid', '',
    'players', players,
    'sides', sides,
    'chain', null,
    'feed', '[]'::jsonb,
    'turnIndex', 0,
    'typing', '{}'::jsonb
  )
  where code = p_code;
end;
$$;
revoke all on function _setup_versus_round(text, int) from public, anon, authenticated;

-- Replaces migration 024's version: hands versus rounds to _setup_versus_round.
create or replace function _setup_round(p_code text, p_round int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  deck_entry jsonb;
  play_order jsonb;
  guesser text;
  knowers text[];
  players jsonb;
  player_uid text;
  entry_id text;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data ->> 'mode' = 'versus' then
    perform _setup_versus_round(p_code, p_round);
    return;
  end if;
  select words -> (p_round - 1) into deck_entry from game_decks where code = p_code;
  if deck_entry is null then
    raise exception 'no word drawn for room % round %', p_code, p_round;
  end if;
  entry_id := coalesce(deck_entry ->> 'id', (select w.id from words w where w.word = deck_entry ->> 'word'));

  play_order := room_data -> 'playerOrder';
  guesser := play_order ->> ((p_round - 1) % jsonb_array_length(play_order));
  select array_agg(uid order by ord) into knowers
  from jsonb_array_elements_text(play_order) with ordinality as t(uid, ord)
  where uid <> guesser;

  players := room_data -> 'players';
  for player_uid in select jsonb_object_keys(players) loop
    players := jsonb_set(
      players,
      array[player_uid, 'role'],
      to_jsonb(case when player_uid = guesser then 'guesser' else 'knower' end)
    );
  end loop;

  insert into round_secrets (code, round, target_word, guesser_uid, word_id, meaning, forbidden)
  values (
    p_code, p_round, deck_entry ->> 'word', guesser, entry_id,
    coalesce((select w.meaning from words w where w.id = entry_id), ''),
    case when room_data ->> 'offLimits' = 'true'
      then coalesce((select w.forbidden from words w where w.id = entry_id), '{}')
      else '{}'
    end
  )
  on conflict (code, round) do update
    set target_word = excluded.target_word, guesser_uid = excluded.guesser_uid,
        guesser_uids = excluded.guesser_uids, word_id = excluded.word_id,
        meaning = excluded.meaning, forbidden = excluded.forbidden;

  update rooms
  set data = (room_data - 'targetWord' - 'gameWords' - 'secondsRemaining' - 'linkChecks' - 'guessPending')
    || jsonb_build_object(
      'status', 'playing',
      'round', p_round,
      'category', deck_entry ->> 'category',
      'activeKnowerUid', knowers[((p_round - 1) % cardinality(knowers)) + 1],
      'guesserUid', guesser,
      'players', players,
      'chain', null,
      'feed', '[]'::jsonb,
      'turnIndex', 0,
      'typing', '{}'::jsonb
    )
  where code = p_code;
end;
$$;

-- Replaces migration 024's version: in versus a Knower adds to their own team's feed, on
-- their team's turn clock.
create or replace function submit_word(p_code text, p_round int, p_turn_index int, p_word text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb := _game_config();
  room_data jsonb;
  caller text := auth.uid()::text;
  my_side text;
  view jsonb;
  word text := btrim(_strip_invisible(p_word));
  target text;
  target_id text;
  off_limits text[];
  clue text; -- the word again: `word` would clash with words.word in a query
  feed jsonb;
  last_word text;
  clock turn_clocks;
  turn_started timestamptz;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'mode' = 'versus' then
    my_side := _side_of(room_data, caller);
  end if;
  view := case when my_side is null then room_data else _side_view(room_data, my_side) end;
  if room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    raise exception 'round is not in play';
  end if;
  if view ->> 'activeKnowerUid' is distinct from caller
     or coalesce((view ->> 'turnIndex')::int, 0) <> p_turn_index then
    raise exception 'not your turn';
  end if;

  select * into clock from turn_clocks where code = p_code;
  turn_started := case
    when my_side is null then clock.started_at
    else (select s.started_at from side_clocks s where s.code = p_code and s.side = my_side)
  end;
  if clock.hold_started_at is not null then
    raise exception 'game is paused';
  end if;
  if _clock_ms(turn_started, null) > _turn_limit_ms(view) + (cfg ->> 'graceMs')::int
     or _clock_ms(clock.round_started_at, null) > _round_limit_ms(view) + (cfg ->> 'graceMs')::int then
    raise exception 'turn is over';
  end if;

  feed := coalesce(view -> 'feed', '[]'::jsonb);
  if view ->> 'mode' = 'duo'
     and (select count(*) from jsonb_array_elements(feed) e where e ->> 'kind' = 'word')
       >= coalesce((view ->> 'clueBudget')::int, (cfg ->> 'duoClues')::int) then
    raise exception 'out of clues';
  end if;

  -- One word: letters, with apostrophes or hyphens inside (don't, x-ray).
  if length(word) > (cfg ->> 'maxWordLength')::int or word !~ '^[[:alpha:]]+([''’-][[:alpha:]]+)*$' then
    raise exception 'one word, up to % letters', cfg ->> 'maxWordLength';
  end if;
  if _is_offensive(word) then
    raise exception 'word not allowed';
  end if;
  clue := word;
  select s.target_word, s.word_id, s.forbidden into target, target_id, off_limits
  from round_secrets s where s.code = p_code and s.round = p_round;
  if _same_word(word, target) or exists (
    select 1 from words w, unnest(w.components || w.variants) part
    where w.id = target_id and _same_word(clue, part)
  ) then
    raise exception 'that is the target word';
  end if;
  if room_data ->> 'offLimits' = 'true'
     and exists (select 1 from unnest(coalesce(off_limits, '{}')) f where _same_word(word, f)) then
    raise exception 'word not allowed: off limits';
  end if;

  select e ->> 'text' into last_word
  from jsonb_array_elements(feed) with ordinality as t(e, ord)
  where e ->> 'kind' = 'word'
  order by ord desc limit 1;
  if lower(last_word) = lower(word) then
    raise exception 'same as the last word';
  end if;

  update rooms
  set data = _with_side(room_data, my_side, jsonb_build_object(
    'feed', feed || jsonb_build_array(jsonb_build_object('kind', 'word', 'text', word, 'by', caller)),
    'turnIndex', p_turn_index + 1,
    'activeKnowerUid', _next_knower(view, caller)
  )) || jsonb_build_object('typing', coalesce(room_data -> 'typing', '{}'::jsonb) - caller)
  where code = p_code;
  return p_turn_index + 1;
end;
$$;

-- Replaces migration 021's version: in versus it skips the caller's own team's turn. A lone
-- Knower (duo, a versus team of 2) is never skipped.
create or replace function skip_turn(p_code text, p_round int, p_turn_index int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  my_side text;
  view jsonb;
  skipped text;
  clock turn_clocks;
  turn_started timestamptz;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'mode' = 'versus' then
    my_side := _side_of(room_data, auth.uid()::text);
    if my_side is null then
      return false;
    end if;
  end if;
  view := case when my_side is null then room_data else _side_view(room_data, my_side) end;
  if room_data ->> 'status' <> 'playing'
     or _single_knower(view)
     or (room_data ->> 'round')::int <> p_round
     or coalesce((view ->> 'turnIndex')::int, 0) <> p_turn_index then
    return false;
  end if;
  select * into clock from turn_clocks where code = p_code;
  turn_started := case
    when my_side is null then clock.started_at
    else (select s.started_at from side_clocks s where s.code = p_code and s.side = my_side)
  end;
  if clock.hold_started_at is not null
     or _clock_ms(turn_started, null) < _turn_limit_ms(view) - (_game_config() ->> 'earlyMs')::int then
    return false;
  end if;

  skipped := view ->> 'activeKnowerUid';
  update rooms
  set data = _with_side(room_data, my_side, jsonb_build_object(
    'feed', coalesce(view -> 'feed', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('kind', 'skip', 'by', skipped)),
    'turnIndex', p_turn_index + 1,
    'activeKnowerUid', _next_knower(view, skipped)
  )) || jsonb_build_object('typing', coalesce(room_data -> 'typing', '{}'::jsonb) - skipped)
  where code = p_code;
  return true;
end;
$$;

-- Replaces migration 013's version: also waits for either versus team's guess still being judged.
create or replace function expire_round(p_code text, p_round int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb := _game_config();
  room_data jsonb;
  clock turn_clocks;
begin
  room_data := _require_member(p_code);
  if room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    return false;
  end if;
  select * into clock from turn_clocks where code = p_code;
  if clock.hold_started_at is not null
     or _clock_ms(clock.round_started_at, null) < _round_limit_ms(room_data) - (cfg ->> 'earlyMs')::int then
    return false;
  end if;
  if clock.guess_pending_at is not null
     and _clock_ms(clock.guess_pending_at, null) < (cfg ->> 'guessHoldMs')::int then
    return false;
  end if;
  if exists (
    select 1 from side_clocks s
    where s.code = p_code and s.guess_pending_at is not null
      and _clock_ms(s.guess_pending_at, null) < (cfg ->> 'guessHoldMs')::int
  ) then
    return false;
  end if;
  return _resolve_round(p_code, p_round, 'lost-timeout', null);
end;
$$;

-- The end of a versus round: p_winner's Guesser got it with p_guess, or nobody did (null).
-- Records both teams' feeds; the entry's own feed, chain and Guesser are the winner's.
create or replace function _resolve_versus_round(p_code text, p_round int, p_winner text, p_guess text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  target text;
  off_limits text[];
  sides jsonb;
  winner jsonb;
  words jsonb;
  clock turn_clocks;
  duration_ms int;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null
    or room_data ->> 'status' <> 'playing'
    or (room_data ->> 'round')::int <> p_round then
    return false;
  end if;

  select s.target_word, s.forbidden into target, off_limits
  from round_secrets s where s.code = p_code and s.round = p_round;

  select jsonb_object_agg(key, jsonb_build_object(
    'guesserUid', value -> 'guesserUid',
    'feed', coalesce(value -> 'feed', '[]'::jsonb),
    'wordCount', (
      select count(*) from jsonb_array_elements(coalesce(value -> 'feed', '[]'::jsonb)) e
      where e ->> 'kind' = 'word' and not coalesce((e ->> 'struck')::boolean, false)
    )
  ))
  into sides
  from jsonb_each(room_data -> 'sides');
  winner := case when p_winner is null then null else sides -> p_winner end;
  select coalesce(jsonb_agg(e -> 'text' order by ord), '[]'::jsonb) into words
  from jsonb_array_elements(coalesce(winner -> 'feed', '[]'::jsonb)) with ordinality as t(e, ord)
  where e ->> 'kind' = 'word' and not coalesce((e ->> 'struck')::boolean, false);

  select * into clock from turn_clocks where code = p_code;
  duration_ms := least(
    _round_limit_ms(room_data) - (_game_config() ->> 'introMs')::int,
    greatest(0, coalesce(_clock_ms(clock.round_started_at, clock.hold_started_at), 0) - (_game_config() ->> 'introMs')::int)
  );

  update rooms
  set data = jsonb_set(
    room_data || jsonb_build_object('status', 'resolution', 'typing', '{}'::jsonb),
    array['history', p_round::text],
    jsonb_build_object(
      'round', p_round,
      'category', room_data ->> 'category',
      'targetWord', target,
      'forbidden', to_jsonb(coalesce(off_limits, '{}')),
      'feed', coalesce(winner -> 'feed', '[]'::jsonb),
      'chain', words,
      'wordCount', jsonb_array_length(words),
      'durationMs', duration_ms,
      'guesserUid', coalesce(winner ->> 'guesserUid', ''),
      'outcome', case when p_winner is null then 'lost-timeout' else 'won' end,
      'guess', p_guess,
      'winner', to_jsonb(p_winner),
      'sides', sides
    ),
    true
  )
  where code = p_code;
  return true;
end;
$$;
revoke all on function _resolve_versus_round(text, int, text, text) from public, anon, authenticated;

-- Replaces migration 024's version: a versus round that runs out goes to _resolve_versus_round.
create or replace function _resolve_round(p_code text, p_round int, p_outcome text, p_guess text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  target text;
  off_limits text[];
  feed jsonb;
  words jsonb;
  clock turn_clocks;
  duration_ms int;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null
    or room_data ->> 'status' <> 'playing'
    or (room_data ->> 'round')::int <> p_round then
    return false;
  end if;
  if room_data ->> 'mode' = 'versus' then
    return _resolve_versus_round(p_code, p_round, null, null);
  end if;

  select s.target_word, s.forbidden into target, off_limits
  from round_secrets s where s.code = p_code and s.round = p_round;
  feed := coalesce(room_data -> 'feed', '[]'::jsonb);
  select coalesce(jsonb_agg(e -> 'text' order by ord), '[]'::jsonb) into words
  from jsonb_array_elements(feed) with ordinality as t(e, ord)
  where e ->> 'kind' = 'word' and not coalesce((e ->> 'struck')::boolean, false);

  select * into clock from turn_clocks where code = p_code;
  duration_ms := least(
    _round_limit_ms(room_data) - (_game_config() ->> 'introMs')::int,
    greatest(0, coalesce(_clock_ms(clock.round_started_at, clock.hold_started_at), 0) - (_game_config() ->> 'introMs')::int)
  );

  update rooms
  set data = jsonb_set(
    room_data || jsonb_build_object('status', 'resolution', 'typing', '{}'::jsonb),
    array['history', p_round::text],
    jsonb_build_object(
      'round', p_round,
      'category', room_data ->> 'category',
      'targetWord', target,
      'forbidden', to_jsonb(coalesce(off_limits, '{}')),
      'feed', feed,
      'chain', words,
      'wordCount', jsonb_array_length(words),
      'durationMs', duration_ms,
      'guesserUid', room_data ->> 'guesserUid',
      'outcome', p_outcome,
      'guess', p_guess
    ),
    true
  )
  where code = p_code;
  return true;
end;
$$;

-- Replaces migration 005's version: in versus, only the active Knower of the caller's team.
create or replace function set_typing(p_code text, p_typing boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  caller text := auth.uid()::text;
  view jsonb;
  typing jsonb;
begin
  room_data := _require_member(p_code);
  view := case
    when room_data ->> 'mode' = 'versus' and _side_of(room_data, caller) is not null
      then _side_view(room_data, _side_of(room_data, caller))
    else room_data
  end;
  if room_data ->> 'status' <> 'playing' or view ->> 'activeKnowerUid' is distinct from caller then
    return; -- turn already moved on — a stale indicator update is harmless to drop
  end if;
  typing := coalesce(room_data -> 'typing', '{}'::jsonb);
  typing := case when p_typing then typing || jsonb_build_object(caller, true) else typing - caller end;
  update rooms set data = jsonb_set(room_data, '{typing}', typing, true) where code = p_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clocks
-- ---------------------------------------------------------------------------

-- Replaces migration 013's version: in versus the turn is the caller's team's.
create or replace function clock_state(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  room_data jsonb := _playing_room_for_member(p_code);
  my_side text;
  clock turn_clocks;
  turn_started timestamptz;
begin
  if room_data is null then
    return null;
  end if;
  select * into clock from turn_clocks where code = p_code;
  if clock is null then
    return null;
  end if;
  if room_data ->> 'mode' = 'versus' then
    my_side := _side_of(room_data, auth.uid()::text);
  end if;
  turn_started := case
    when my_side is null then clock.started_at
    else (select s.started_at from side_clocks s where s.code = p_code and s.side = my_side)
  end;
  return jsonb_build_object(
    'round', (room_data ->> 'round')::int,
    'turnIndex', coalesce((
      case when my_side is null then room_data else _side_view(room_data, my_side) end ->> 'turnIndex'
    )::int, 0),
    'turnElapsedMs', coalesce(_clock_ms(turn_started, clock.hold_started_at), 0),
    'roundElapsedMs', _clock_ms(clock.round_started_at, clock.hold_started_at),
    'held', clock.hold_started_at is not null
  );
end;
$$;

-- Replaces migration 013's version: also moves both versus teams' turn clocks on.
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
  update side_clocks s
  set started_at = s.started_at + (now() - t.hold_started_at)
  from turn_clocks t
  where t.code = p_code and s.code = p_code and t.hold_started_at is not null;
  update turn_clocks
  set started_at = started_at + (now() - hold_started_at),
      round_started_at = round_started_at + (now() - hold_started_at),
      hold_started_at = null
  where code = p_code and hold_started_at is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guesses (called by the validate-guess edge function with the service role)
-- ---------------------------------------------------------------------------

-- Replaces migration 017's version: in versus either team's Guesser may guess, each on their
-- own 3 second cooldown.
create or replace function begin_guess(p_code text, p_round int, p_uid text, p_guess text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb := _game_config();
  room_data jsonb;
  my_side text;
  view jsonb;
  clock turn_clocks;
  last_guess timestamptz;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null then
    return 'not-the-guesser';
  end if;
  if room_data ->> 'mode' = 'versus' then
    my_side := _side_of(room_data, p_uid);
  end if;
  view := case when my_side is null then room_data else _side_view(room_data, my_side) end;
  if view ->> 'guesserUid' is distinct from p_uid then
    return 'not-the-guesser';
  end if;
  if room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    return 'round-over';
  end if;
  if p_guess is not null and _is_offensive(_strip_invisible(p_guess)) then
    return 'not-allowed';
  end if;
  select * into clock from turn_clocks where code = p_code for update;
  if clock.hold_started_at is not null then
    return 'paused';
  end if;
  if _clock_ms(clock.round_started_at, null) > _round_limit_ms(room_data) + (cfg ->> 'graceMs')::int then
    return 'round-over';
  end if;
  if my_side is null then
    last_guess := clock.last_guess_at;
  else
    select s.last_guess_at into last_guess from side_clocks s where s.code = p_code and s.side = my_side for update;
  end if;
  if last_guess is not null
     and _clock_ms(last_guess, null) < (cfg ->> 'guessCooldownMs')::int - (cfg ->> 'earlyMs')::int then
    return 'cooldown';
  end if;
  if my_side is null then
    update turn_clocks set last_guess_at = now(), guess_pending_at = now() where code = p_code;
  else
    update side_clocks set last_guess_at = now(), guess_pending_at = now() where code = p_code and side = my_side;
  end if;
  return 'ok';
end;
$$;

-- Records a judged guess by p_uid: a correct one wins the round (in versus, for their team),
-- a wrong one goes into the feed (in versus, their team's) and play carries on. False if the
-- round had already ended, or for a versus guess that doesn't say whose it is.
create or replace function record_guess(p_code text, p_round int, p_guess text, p_correct boolean, p_uid text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  my_side text;
  view jsonb;
  guess text := btrim(_strip_invisible(p_guess));
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data ->> 'mode' = 'versus' then
    my_side := _side_of(room_data, p_uid);
  end if;
  if my_side is null then
    update turn_clocks set guess_pending_at = null where code = p_code;
  else
    update side_clocks set guess_pending_at = null where code = p_code and side = my_side;
  end if;
  if room_data is null or room_data ->> 'status' <> 'playing' or (room_data ->> 'round')::int <> p_round then
    return false;
  end if;
  if room_data ->> 'mode' = 'versus' and my_side is null then
    return false;
  end if;
  view := case when my_side is null then room_data else _side_view(room_data, my_side) end;
  update rooms
  set data = _with_side(room_data, my_side, jsonb_build_object(
    'feed', coalesce(view -> 'feed', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'kind', 'guess', 'text', guess, 'by', view ->> 'guesserUid', 'correct', p_correct
    ))
  ))
  where code = p_code;
  if p_correct then
    if my_side is null then
      return _resolve_round(p_code, p_round, 'won', guess);
    end if;
    return _resolve_versus_round(p_code, p_round, my_side, guess);
  end if;
  return true;
end;
$$;

-- Replaces migration 017's version: the edge function deployed before this migration.
create or replace function record_guess(p_code text, p_round int, p_guess text, p_correct boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return record_guess(p_code, p_round, p_guess, p_correct, null);
end;
$$;

revoke all on function begin_guess(text, int, text, text) from public, anon, authenticated;
revoke all on function record_guess(text, int, text, boolean) from public, anon, authenticated;
revoke all on function record_guess(text, int, text, boolean, text) from public, anon, authenticated;
grant execute on function begin_guess(text, int, text, text) to service_role;
grant execute on function record_guess(text, int, text, boolean) to service_role;
grant execute on function record_guess(text, int, text, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Play Again and reports
-- ---------------------------------------------------------------------------

-- Replaces migration 013's version: also clears the versus teams' rounds (the teams
-- themselves, and the versus switch, stay for the rematch).
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
  set data = (room_data - 'secondsRemaining' - 'linkChecks' - 'guessPending' - 'sides') || jsonb_build_object(
    'status', 'lobby',
    'round', 1,
    'playerOrder', null,
    'chain', null,
    'feed', null,
    'turnIndex', 0,
    'category', '',
    'activeKnowerUid', '',
    'guesserUid', '',
    'players', players,
    'typing', '{}'::jsonb,
    'history', '{}'::jsonb
  )
  where code = p_code;
end;
$$;

-- Replaces migration 013's version: the snapshot also has both versus teams' feeds.
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
      'feed', room_data -> 'feed',
      'sides', room_data -> 'sides',
      'history', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'round', key, 'feed', value -> 'feed', 'sides', value -> 'sides', 'guess', value -> 'guess'
        )), '[]'::jsonb)
        from jsonb_each(coalesce(room_data -> 'history', '{}'::jsonb))
      )
    )
  );
end;
$$;
