-- The host picks which word categories a game draws from (friends' rooms only).
--
-- The choice lives on the room as data.categories (absent = every category) and survives
-- rematches. Online rooms always play every category: strangers can't agree on a pick, so
-- _start_game ignores the choice there. At least _category_minimum() must stay on, so every
-- difficulty has words to spare and the category still narrows the Guesser's guess.
--
-- Older apps never call set_categories(), so their rooms keep drawing from everything.

create or replace function _category_minimum()
returns int
language sql
immutable
as $$ select 3 $$;

-- Replaces migration 024's version. Still p_count words split into thirds by difficulty,
-- easiest first. Each round now picks, in order of importance: a word from p_categories
-- (when given), the round's difficulty or else the nearest one, a different category from
-- the round before, a word not in p_avoid, the category this deck has used least, then at
-- random. Falling back a difficulty, or outside p_categories, beats a short deck.
drop function if exists _draw_deck(text[], int);
create or replace function _draw_deck(p_avoid text[], p_count int default 9, p_categories text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  easy int := ceil(p_count / 3.0)::int;
  medium int := ceil(p_count * 2 / 3.0)::int - ceil(p_count / 3.0)::int;
  picks jsonb := '[]'::jsonb;
  ids text[] := '{}';
  cats text[] := '{}';
  prev text;
  tier int;
  pick record;
begin
  for i in 1..p_count loop
    tier := case when i <= easy then 0 when i <= easy + medium then 1 else 2 end;
    select w.id, w.word, w.category, w.difficulty into pick
    from words w
    where not (w.id = any(ids))
    order by
      (p_categories is not null and not (w.category = any(p_categories))),
      abs((case w.difficulty when 'easy' then 0 when 'medium' then 1 else 2 end) - tier),
      coalesce(w.category = prev, false),
      (w.id = any(coalesce(p_avoid, '{}'))),
      (select count(*) from unnest(cats) c where c = w.category),
      random()
    limit 1;
    exit when not found;
    picks := picks || jsonb_build_array(
      jsonb_build_object('id', pick.id, 'word', pick.word, 'category', pick.category, 'difficulty', pick.difficulty)
    );
    ids := ids || pick.id;
    cats := cats || pick.category;
    prev := pick.category;
  end loop;
  return picks;
end;
$$;
revoke all on function _draw_deck(text[], int, text[]) from public, anon, authenticated;

-- Host, in a friends' lobby: the categories to draw from. Null, or every category, means
-- all of them (the default).
create or replace function set_categories(p_code text, p_categories text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  picked text[];
  known text[];
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'lobby' then
    raise exception 'the game has already started';
  end if;
  if coalesce((room_data ->> 'isPublic')::boolean, false) then
    raise exception 'online games play every category';
  end if;
  select array_agg(distinct category order by category) into known from words;
  select array_agg(distinct c order by c) into picked from unnest(coalesce(p_categories, known)) c;
  if exists (select 1 from unnest(picked) c where not (c = any(known))) then
    raise exception 'unknown category';
  end if;
  if cardinality(picked) < _category_minimum() then
    raise exception 'pick at least % categories', _category_minimum();
  end if;
  update rooms
  set data = case
    when picked @> known then room_data - 'categories'
    else room_data || jsonb_build_object('categories', to_jsonb(picked))
  end
  where code = p_code;
end;
$$;
revoke all on function set_categories(text, text[]) from public, anon;
grant execute on function set_categories(text, text[]) to authenticated;

-- Replaces migration 025's version: the deck draws from the room's categories (friends'
-- rooms only).
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
  categories text[];
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

  if not coalesce((room_data ->> 'isPublic')::boolean, false) and jsonb_typeof(room_data -> 'categories') = 'array' then
    categories := array(select jsonb_array_elements_text(room_data -> 'categories'));
  end if;

  insert into game_decks (code, words, used_word_ids) values (p_code, _draw_deck(used, rounds, categories), used)
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
