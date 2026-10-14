-- Yappa: words (GAMEPLAY_REDESIGN.md, phase 3).
--
-- Each word gets an id and room for the data the leak rules need (phase 4):
--   * `forbidden`  - 3 to 5 words Knowers may not use (Easy 3, Medium 4, Hard 5);
--   * `components` - the parts of a compound target (light, house for Lighthouse);
--   * `variants`   - spellings beyond normal plurals and endings.
-- They start empty. scripts/words/draft.mjs drafts them into a review file; once reviewed,
-- scripts/words/to-sql.mjs turns that file into the migration that fills them in.
--
-- Each game now draws 3 Easy, 3 Medium and 3 Hard words, easiest first. The Guesser rotates
-- every round, so rounds 1 to 3 give each player an Easy word, 4 to 6 a Medium one and 7 to 9
-- a Hard one. Play Again avoids the words this room has already played, falling back to them
-- only when there aren't enough fresh ones left.

-- ---------------------------------------------------------------------------
-- Word data
-- ---------------------------------------------------------------------------

alter table words add column if not exists id text;
update words set id = trim(both '-' from regexp_replace(lower(word), '[^a-z0-9]+', '-', 'g'))
where id is null;
alter table words alter column id set not null;
create unique index if not exists words_id_key on words (id);

alter table words add column if not exists forbidden text[] not null default '{}';
alter table words add column if not exists components text[] not null default '{}';
alter table words add column if not exists variants text[] not null default '{}';

-- Words this room has played, oldest first, kept away from the next game's draw. Lives with
-- the deck rather than in rooms.data so the Guesser can't read the word list for the game
-- about to start.
alter table game_decks add column if not exists used_word_ids text[] not null default '{}';

-- Which word a round is playing, for the leak-verdict cache and sneaky-clue flags (phase 4).
alter table round_secrets add column if not exists word_id text;

-- ---------------------------------------------------------------------------
-- Drawing the deck
-- ---------------------------------------------------------------------------

-- How many words of the room's history Play Again keeps away (10 games).
create or replace function _used_word_memory()
returns int
language sql
immutable
as $$ select 90 $$;

-- Replaces migration 004's version: 3 Easy, 3 Medium, 3 Hard, in that order (shuffled within
-- each), spanning at least 3 categories. Words in p_avoid are drawn only once a difficulty
-- runs out of others.
drop function if exists _draw_deck();
create or replace function _draw_deck(p_avoid text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  picks jsonb;
begin
  for attempt in 1..25 loop
    select jsonb_agg(
      jsonb_build_object('id', id, 'word', word, 'category', category, 'difficulty', difficulty)
      order by tier, shuffle
    )
    into picks
    from (
      select id, word, category, difficulty,
        case difficulty when 'easy' then 1 when 'medium' then 2 else 3 end as tier,
        random() as shuffle,
        row_number() over (
          partition by difficulty
          order by (id = any(coalesce(p_avoid, '{}'))), random()
        ) as pick
      from words
    ) drawn
    where pick <= 3;

    exit when (
      select count(distinct e ->> 'category') from jsonb_array_elements(picks) e
    ) >= 3;
  end loop;
  return picks; -- astronomically unlikely to still be < 3 categories; accept it if so
end;
$$;
revoke all on function _draw_deck(text[]) from public, anon, authenticated;

-- Replaces migration 004's version: remembers the room's last game before drawing the next.
create or replace function start_game(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  play_order jsonb;
  used text[];
  keep int := _used_word_memory();
begin
  room_data := _require_host(p_code);
  if room_data ->> 'status' <> 'lobby' then
    return; -- already started (e.g. a retried call): nothing to do
  end if;

  select jsonb_agg(uid order by random()) into play_order
  from jsonb_object_keys(room_data -> 'players') uid;
  if jsonb_array_length(play_order) <> 3 then
    raise exception 'Yappa needs exactly 3 players';
  end if;

  -- The room's history plus the game just played (decks from before this migration only
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

  insert into game_decks (code, words, used_word_ids) values (p_code, _draw_deck(used), used)
  on conflict (code) do update set words = excluded.words, used_word_ids = excluded.used_word_ids;
  delete from round_secrets where code = p_code;

  update rooms
  set data = room_data || jsonb_build_object(
    'playerOrder', play_order,
    'maxRounds', 9,
    'history', '{}'::jsonb
  )
  where code = p_code;

  perform _setup_round(p_code, 1);
end;
$$;
revoke all on function start_game(text) from public, anon;
grant execute on function start_game(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rounds (replaces migration 013's version: also records which word the round plays)
-- ---------------------------------------------------------------------------

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
begin
  select data into room_data from rooms where code = p_code for update;
  select words -> (p_round - 1) into deck_entry from game_decks where code = p_code;
  if deck_entry is null then
    raise exception 'no word drawn for room % round %', p_code, p_round;
  end if;

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

  insert into round_secrets (code, round, target_word, guesser_uid, word_id)
  values (
    p_code, p_round, deck_entry ->> 'word', guesser,
    coalesce(deck_entry ->> 'id', (select w.id from words w where w.word = deck_entry ->> 'word'))
  )
  on conflict (code, round) do update
    set target_word = excluded.target_word, guesser_uid = excluded.guesser_uid, word_id = excluded.word_id;

  update rooms
  set data = (room_data - 'targetWord' - 'gameWords' - 'secondsRemaining' - 'linkChecks' - 'guessPending')
    || jsonb_build_object(
      'status', 'playing',
      'round', p_round,
      'category', deck_entry ->> 'category',
      'activeKnowerUid', case when p_round % 2 = 1 then knowers[1] else knowers[2] end,
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
