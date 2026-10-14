// End-to-end check of the database game logic: applies every migration to an in-memory
// Postgres (PGlite), stubs Supabase's auth schema and roles, then plays a full game using
// only the functions clients and edge functions can call. Verifies the target word stays
// hidden from the Guesser and that every illegal write is rejected.
//
// Run: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const migrations = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const applyMigrations = async (filter) => {
  for (const f of migrations.filter(filter)) {
    await db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
};

const db = new PGlite();
let failures = 0;
let passed = 0;
const check = (cond, msg) => {
  if (cond) passed++;
  else { failures++; console.log('FAIL', msg); }
};

// --- Supabase stand-ins ------------------------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create table auth.users (id uuid primary key, is_anonymous boolean not null default true, created_at timestamptz not null default now(), last_sign_in_at timestamptz);
  create table auth.sessions (id serial primary key, user_id uuid references auth.users (id) on delete cascade, updated_at timestamptz not null default now());
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  create publication supabase_realtime;
  -- Supabase's default grants: table access is governed by RLS, functions are executable.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);

const [HOST, P2, P3, OUTSIDER] = ['1', '2', '3', '4'].map(
  (d) => `${d.repeat(8)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(12)}`,
);
/** Runs `sql` as a signed-in user, or as the service role when `uid` is null. */
const as = async (uid, sql, params) => {
  const role = uid ? 'authenticated' : 'service_role';
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false), set_config('request.jwt.claim.role', '${role}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
/** Runs `sql` as a visitor who isn't signed in (the web card page). */
const asAnon = async (sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'anon', false); set role anon;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const fails = async (uid, sql, params) => { try { await as(uid, sql, params); return false; } catch { return true; } };
const room = async (code = 'ABCD') => (await db.query(`select data from rooms where code = $1`, [code])).rows[0]?.data;
const secretFor = async (round) =>
  (await db.query(`select target_word from round_secrets where code = 'ABCD' and round = $1`, [round])).rows[0].target_word;
const stat = async (metric) =>
  (await db.query(`select coalesce(sum(count), 0)::int n from game_stats where metric = $1`, [metric])).rows[0].n;
const player = (uid, extra = {}) => ({ uid, name: `P${uid[0]}`, avatarColor: '#123456', role: 'knower', lastSeenAt: 0, ...extra });

// --- Migrations, with a legacy room in between ---------------------------------------
await applyMigrations((f) => f < '004');
await db.query(`insert into rooms (code, data) values ('OLD1', $1)`, [{ hostUid: HOST, status: 'gameover', targetWord: 'Anchor', gameWords: [{ word: 'Anchor' }], players: {} }]);
await applyMigrations((f) => f >= '004');
const legacy = await room('OLD1');
check(!('targetWord' in legacy) && !('gameWords' in legacy), 'legacy room data loses its answers');
check((await db.query('select count(*)::int n from words')).rows[0].n === 251, '251 words seeded');

// --- Lobby -------------------------------------------------------------------------
check(await fails(HOST, `insert into rooms (code, data) values ('ZZZZ', $1)`, [{ hostUid: HOST, players: { [HOST]: {} } }]), 'direct INSERT into rooms is rejected');
check(await fails(HOST, `select create_room('ab', $1)`, [player(HOST)]), 'create_room rejects a malformed code');
await as(HOST, `select create_room('ABCD', $1)`, [player(HOST, { role: 'guesser', isAdmin: true })]);
let d = await room();
check(d.hostUid === HOST && d.status === 'lobby' && d.players[HOST].role === 'knower' && !('isAdmin' in d.players[HOST]), 'create_room builds clean state (forged fields dropped)');
check(await fails(OUTSIDER, `select create_room('ABCD', $1)`, [player(OUTSIDER)]), 'cannot create over an existing room');
check(await fails(P2, `select join_room('ABCD', $1)`, [player(P3)]), 'cannot join as someone else');
await as(P2, `select join_room('ABCD', $1)`, [player(P2, { name: '  Sam  ', avatarColor: 'javascript:x' })]);
d = await room();
check(d.players[P2].name === 'Sam' && d.players[P2].avatarColor === '#9E9E9E', 'join_room trims the name and rejects a bad colour');
check(await fails(P3, `select start_game('ABCD')`), 'non-member cannot start');
await as(P3, `select join_room('ABCD', $1)`, [player(P3)]);
check(await fails(OUTSIDER, `select join_room('ABCD', $1)`, [player(OUTSIDER)]), 'a fourth player is rejected');

// --- Direct writes are closed --------------------------------------------------------
check(await fails(HOST, `select patch_room('ABCD', '[]'::jsonb)`), 'patch_room no longer exists');
await as(P2, `update rooms set data = data || '{"status":"gameover"}' where code = 'ABCD'`).catch(() => {});
check((await room()).status === 'lobby', 'direct UPDATE on rooms changes nothing');
check(await fails(HOST, `select record_link_check('ABCD', 1, 1, 'x', false)`), 'clients cannot record link verdicts');
check(await fails(HOST, `select resolve_round_guess('ABCD', 1, 'x', true)`), 'clients cannot declare a guess correct');
check(await fails(HOST, `select _setup_round('ABCD', 2)`), 'clients cannot call internal helpers');
check(await fails(P2, `select start_game('ABCD')`), 'only the host can start');
await as(P2, `select reset_room_to_lobby('ABCD')`);
await as(HOST, `select start_game('ABCD')`);
check((await room()).status === 'playing', 'the host can start');
check((await as(HOST, `select * from words`)).rows.length === 0 && (await as(HOST, `select * from game_decks`)).rows.length === 0, 'the word list and deck are unreadable');

// --- Play 9 rounds: describe it together (migration 013) ---------------------------------
// Time is simulated by moving the clocks' start times back.
const clockRow = async () => (await db.query(`select * from turn_clocks where code = 'ABCD'`)).rows[0];
const age = (cols, ms) =>
  db.query(`update turn_clocks set ${cols.map((c) => `${c} = ${c} - make_interval(secs => $1::float / 1000)`).join(', ')} where code = 'ABCD'`, [ms]);
const ageTurn = (ms) => age(['started_at'], ms);
const ageRound = (ms) => age(['started_at', 'round_started_at'], ms);
const ageCooldown = () => age(['last_guess_at'], 4000);
const guess = async (round, uid) => (await as(null, `select begin_guess('ABCD', $1, $2) r`, [round, uid])).rows[0].r;
const record = async (round, text, correct) => (await as(null, `select record_guess('ABCD', $1, $2, $3) ok`, [round, text, correct])).rows[0].ok;
const say = async (uid, round, turn, word) => (await as(uid, `select submit_word('ABCD', $1, $2, $3) i`, [round, turn, word])).rows[0].i;
/** Same JSON content, whatever the key order (Postgres sorts jsonb keys). */
const sameJson = (a, b) => JSON.stringify(a, Object.keys(a ?? {}).sort()) === JSON.stringify(b, Object.keys(b ?? {}).sort());
let wins = 0;
for (let round = 1; round <= 9; round++) {
  d = await room();
  const target = await secretFor(round);
  check(d.status === 'playing' && d.round === round && !JSON.stringify(d).includes(`"${target}"`), `round ${round}: playing, target absent from room data`);
  check((await as(d.guesserUid, `select * from round_secrets where code = 'ABCD' and round = $1`, [round])).rows.length === 0, `round ${round}: the Guesser cannot read the target`);
  const first = d.activeKnowerUid;
  const second = Object.keys(d.players).find((u) => u !== first && u !== d.guesserUid);
  const guesser = d.guesserUid;
  for (const k of [first, second]) {
    check((await as(k, `select target_word from round_secrets where code = 'ABCD' and round = $1`, [round])).rows[0]?.target_word === target, `round ${round}: a Knower can read the target`);
  }
  check(d.turnIndex === 0 && Array.isArray(d.feed) && d.feed.length === 0 && d.chain === null && !('secondsRemaining' in d), `round ${round}: a fresh feed and turn counter`);

  if (round === 1) {
    check(await fails(second, `select submit_word('ABCD', 1, 0, 'tall')`), 'the waiting Knower cannot submit');
    check(await fails(guesser, `select submit_word('ABCD', 1, 0, 'tall')`), 'the Guesser cannot submit words');
    check(await fails(first, `select submit_word('ABCD', 1, 0, $1)`, [target.toLowerCase() + 's']), 'a Knower cannot submit the target (or its plural)');
    check(await fails(first, `select submit_word('ABCD', 1, 0, 'two words')`), 'two words at once are rejected');
    check(await fails(first, `select submit_word('ABCD', 1, 0, '!!!')`), 'punctuation alone is rejected');
    check(await fails(first, `select submit_word('ABCD', 1, 0, $1)`, ['a'.repeat(25)]), 'words over 24 letters are rejected');
    check(await fails(first, `select submit_word('ABCD', 1, 3, 'tall')`), 'a stale turn index is rejected');
    check(await fails(first, `select submit_word('ABCD', 2, 0, 'tall')`), 'wrong-round submissions are rejected');
    await as(first, `select set_typing('ABCD', true)`);
    await as(second, `select set_typing('ABCD', true)`);
    const t = (await room()).typing;
    check(t[first] === true && !(second in t), 'only the active Knower can set typing');

    const state = (await as(guesser, `select clock_state('ABCD') s`)).rows[0].s;
    check(state.round === 1 && state.turnIndex === 0 && state.turnElapsedMs >= 0 && state.roundElapsedMs >= 0 && state.held === false, 'a player can read where both clocks stand');
    check(await fails(OUTSIDER, `select clock_state('ABCD')`), 'a non-member cannot read the clocks');
    check((await db.query(`select * from turn_clocks`)).rows.length === 1 && (await as(HOST, `select * from turn_clocks`)).rows.length === 0, 'the clock table is unreadable to clients');

    // A pause freezes both clocks and blocks moves; resuming shifts both start times on.
    await as(P2, `select pause_turn_clock('ABCD')`);
    const held = (await as(first, `select clock_state('ABCD') s`)).rows[0].s;
    await new Promise((r) => setTimeout(r, 40));
    const stillHeld = (await as(first, `select clock_state('ABCD') s`)).rows[0].s;
    check(held.held && stillHeld.turnElapsedMs === held.turnElapsedMs && stillHeld.roundElapsedMs === held.roundElapsedMs, 'a pause freezes both clocks');
    check(await fails(first, `select submit_word('ABCD', 1, 0, 'tall')`), 'no words while paused');
    await ageTurn(20000);
    check((await as(guesser, `select skip_turn('ABCD', 1, 0) ok`)).rows[0].ok === false, 'no skips while paused');
    await ageTurn(-20000);
    const before = await clockRow();
    await as(P3, `select pause_turn_clock('ABCD')`);
    await as(P2, `select resume_turn_clock('ABCD')`);
    await as(P3, `select resume_turn_clock('ABCD')`);
    const after = await clockRow();
    check(after.hold_started_at === null && +after.started_at > +before.started_at && +after.round_started_at > +before.round_started_at, 'resuming shifts both clocks on by the pause, once');
    check(await fails(OUTSIDER, `select pause_turn_clock('ABCD')`), 'a non-member cannot pause the clocks');
  }

  // Turn 0: the first Knower describes; the turn passes and the turn clock restarts.
  const turnStartedBefore = (await clockRow()).started_at;
  check(await say(first, round, 0, 'tall') === 1, `round ${round}: a word lands`);
  d = await room();
  check(d.activeKnowerUid === second && d.turnIndex === 1 && !(first in (d.typing ?? {})), `round ${round}: the turn passes to the other Knower`);
  check(sameJson(d.feed[0], { kind: 'word', text: 'tall', by: first }), `round ${round}: the word is in the feed with who said it`);
  check(+(await clockRow()).started_at > +turnStartedBefore, `round ${round}: the turn clock restarts`);
  check(await fails(first, `select submit_word('ABCD', $1, 1, 'again')`, [round]), `round ${round}: no going twice in a row`);

  if (round === 1) {
    check(await fails(second, `select submit_word('ABCD', 1, 1, 'Tall')`), 'the previous word cannot be repeated');
    // The turn clock runs out: an early skip does nothing; then the first call skips, once.
    check((await as(guesser, `select skip_turn('ABCD', 1, 1) ok`)).rows[0].ok === false, 'a skip before the turn is over does nothing');
    await ageTurn(10500);
    const [a, b] = await Promise.all([
      as(guesser, `select skip_turn('ABCD', 1, 1) ok`),
      as(first, `select skip_turn('ABCD', 1, 1) ok`),
    ]);
    d = await room();
    check([a.rows[0].ok, b.rows[0].ok].filter(Boolean).length === 1 && d.turnIndex === 2, 'two devices skipping at once skip one turn');
    check(d.activeKnowerUid === first && sameJson(d.feed[1], { kind: 'skip', by: second }), 'the skip is in the feed and the turn passes');
    check(d.status === 'playing', 'a skipped turn does not end the round');
    // A word sent just as the turn ends still counts (grace); well after, it doesn't.
    await ageTurn(10400);
    check(await say(first, 1, 2, "don't") === 3, 'a word inside the grace period counts (apostrophes allowed)');
    await ageTurn(12000);
    check(await fails(second, `select submit_word('ABCD', 1, 3, 'thing')`), 'a word after the turn ran out is rejected');
    await as(first, `select skip_turn('ABCD', 1, 3)`);
    check(await say(first, 1, 4, 'x-ray') === 5, 'hyphenated words are allowed');
    // Guesses: the Guesser only, 3 seconds apart, wrong ones go into the feed.
    check(await guess(1, first) === 'not-the-guesser', 'only the Guesser can guess');
    check(await guess(1, guesser) === 'ok', 'the Guesser can guess');
    check(await guess(1, guesser) === 'cooldown', 'guesses are 3 seconds apart');
    check(await record(1, 'cliff', false) === true, 'a wrong guess is recorded');
    d = await room();
    check(d.status === 'playing' && sameJson(d.feed.at(-1), { kind: 'guess', text: 'cliff', by: guesser, correct: false }), 'a wrong guess shows in the feed and play goes on');
  }

  if (round % 3 === 0) {
    // The round clock runs out, but waits for a guess that's still being judged.
    check((await as(first, `select expire_round('ABCD', $1) ok`, [round])).rows[0].ok === false, `round ${round}: the round can't be ended early`);
    check(await guess(round, guesser) === 'ok', `round ${round}: a last-second guess`);
    await ageRound(63000);
    check((await as(first, `select expire_round('ABCD', $1) ok`, [round])).rows[0].ok === false, `round ${round}: time's up, but the pending guess is waited for`);
    await record(round, 'wrong', false);
    const [x, y] = await Promise.all([
      as(first, `select expire_round('ABCD', $1) ok`, [round]),
      as(guesser, `select expire_round('ABCD', $1) ok`, [round]),
    ]);
    check([x.rows[0].ok, y.rows[0].ok].filter(Boolean).length === 1, `round ${round}: the round ends once, however many devices call it`);
    await ageCooldown();
    check(await guess(round, guesser) === 'round-over', `round ${round}: no guesses after time's up`);
  } else {
    if (round !== 1) check(await guess(round, guesser) === 'ok', `round ${round}: a guess`);
    else { await ageCooldown(); check(await guess(round, guesser) === 'ok', 'the next guess after the cooldown'); }
    check(await record(round, target, true) === true, `round ${round}: the right guess wins`);
    wins++;
    check(await record(round, 'late', true) === false, `round ${round}: a second resolution is a no-op`);
  }
  const h = (await room()).history[String(round)];
  check(h.targetWord === target && Array.isArray(h.feed) && h.feed[0].text === 'tall' && h.chain[0] === 'tall' && h.wordCount === h.chain.length, `round ${round}: history has the feed, its words and the word count`);
  check(typeof h.durationMs === 'number' && h.durationMs >= 0 && h.durationMs <= 60000, `round ${round}: history has how long the round took`);
  check(round % 3 === 0 ? h.outcome === 'lost-timeout' && h.guess === null : h.outcome === 'won' && h.guess === target && h.feed.at(-1).correct === true, `round ${round}: outcome and guess recorded`);
  check(await fails(second, `select submit_word('ABCD', $1, 1, 'late')`, [round]), `round ${round}: no words after the round`);
  await as(P2, `select reset_room_to_lobby('ABCD')`);
  check((await room()).status === 'resolution', `round ${round}: Play Again is a no-op mid-game`);
  await as(HOST, `select advance_round('ABCD', $1)`, [round]);
  await as(HOST, `select advance_round('ABCD', $1)`, [round]); // a double tap must not skip a round
}

d = await room();
check(d.status === 'gameover', 'game over after 9 rounds');
check(Object.values(d.history).filter((h) => h.outcome === 'won').length === wins, `score adds up (${wins})`);
const guessCounts = Object.values(d.history).reduce((m, h) => ((m[h.guesserUid] = (m[h.guesserUid] ?? 0) + 1), m), {});
check(Object.values(guessCounts).length === 3 && Object.values(guessCounts).every((n) => n === 3), 'each player guessed exactly 3 times');
const deck = (await db.query(`select words from game_decks where code = 'ABCD'`)).rows[0].words;
check(deck.length === 9 && new Set(deck.map((w) => w.category)).size >= 3, 'deck: 9 words across at least 3 categories');
check(deck.map((w) => w.difficulty).join() === 'easy,easy,easy,medium,medium,medium,hard,hard,hard', 'deck: 3 Easy, then 3 Medium, then 3 Hard');
const tiersByGuesser = Object.values(d.history).reduce((m, h) => ((m[h.guesserUid] = [...(m[h.guesserUid] ?? []), deck[h.round - 1].difficulty]), m), {});
check(Object.values(tiersByGuesser).every((t) => t.join() === 'easy,medium,hard'), 'each Guesser gets one Easy, one Medium and one Hard word, in that order');
const secretIds = (await db.query(`select word_id from round_secrets where code = 'ABCD' order by round`)).rows.map((r) => r.word_id);
check(secretIds.join() === deck.map((w) => w.id).join(), 'each round records which word it plays');
check(await fails(OUTSIDER, `select end_game('ABCD')`), 'a non-member cannot end a game');

check(await stat('games_created_private') === 1 && await stat('joins_code') === 2, 'stats: the room and both typed-code joins are counted');
check(await stat('games_started') === 1 && await stat('games_finished') === 1 && await stat('games_ended_early') === 0, 'stats: a started and a finished game are counted');

// --- Share cards (migration 012) ------------------------------------------------------------
const cardId = (await as(P2, `select create_share_card('ABCD') id`)).rows[0].id;
check(/^[A-Za-z0-9]{8}$/.test(cardId), 'a player can make a share card of a finished game');
check((await as(P3, `select create_share_card('ABCD') id`)).rows[0].id === cardId, 'sharing the same game again gives the same card');
check(await fails(OUTSIDER, `select create_share_card('ABCD')`), 'only players in the game can make its card');
const card = (await asAnon(`select get_share_card($1) c`, [cardId])).rows[0].c;
check(card.rounds.length === 9 && card.maxRounds === 9 && card.rounds[0].targetWord && Array.isArray(card.rounds[0].chain), 'anyone with the link can read the card');
check(![HOST, P2, P3, 'ABCD'].some((x) => JSON.stringify(card).includes(x)), 'a card holds no player IDs or room code');
check((await asAnon(`select get_share_card('nope') c`)).rows[0].c === null, 'an unknown card is empty');
const readsCards = async (run) => { try { return (await run(`select * from share_cards`)).rows.length > 0; } catch { return false; } };
check(!(await readsCards(asAnon)) && !(await readsCards((q) => as(P2, q))), 'the cards table is unreadable to clients');
check(await (async () => { try { await asAnon(`select create_share_card('ABCD')`); return false; } catch { return true; } })(), 'visitors who are not signed in cannot make cards');

// --- Host leaves, the game carries on --------------------------------------------------
const nextInOrder = d.playerOrder.find((u) => u !== HOST);
await as(HOST, `select leave_room('ABCD', $1)`, [HOST]);
d = await room();
check(!(HOST in d.players) && d.hostUid === nextInOrder, 'a departing host hands off to the next player in turn order');
await as(P3, `select reset_room_to_lobby('ABCD')`);
d = await room();
check(d.status === 'lobby' && Object.keys(d.history).length === 0 && Object.values(d.players).every((p) => p.role === 'knower'), 'Play Again resets to a clean lobby');
check(await fails(HOST, `select start_game('ABCD')`), 'the old host can no longer start');
await as(OUTSIDER, `select join_room('ABCD', $1)`, [player(OUTSIDER)]);
await as(nextInOrder, `select start_game('ABCD')`);
check((await room()).status === 'playing', 'the new host can start the next game');
const rematch = (await db.query(`select words, used_word_ids from game_decks where code = 'ABCD'`)).rows[0];
check(rematch.words.every((w) => !deck.some((x) => x.id === w.id)), 'Play Again draws words the room has not played');
check(rematch.used_word_ids.join() === deck.map((w) => w.id).join(), 'the room remembers the words it played');
const allIds = (await db.query(`select array_agg(id) ids from words`)).rows[0].ids;
const starved = (await db.query(`select _draw_deck($1) d`, [allIds])).rows[0].d;
check(starved.length === 9 && starved.map((w) => w.difficulty).join() === 'easy,easy,easy,medium,medium,medium,hard,hard,hard', 'with every word played, the draw falls back to played words');
check((await db.query(`select count(distinct id)::int n, count(*)::int t from words`)).rows[0].n === allIds.length, 'every word has its own id');
const wordList = (await db.query(`select id from words`)).rows.map((r) => r.id);
check(wordList.length === 251 && wordList.includes('toothbrush') && !wordList.includes('sextant'), 'the reviewed word list swaps obscure words for familiar ones');
check((await db.query(`select 1 from information_schema.columns where table_name = 'words' and column_name = 'forbidden'`)).rows.length === 0, 'words carry no forbidden lists');
await as(P2, `select end_game('ABCD')`);
check((await room()).status === 'gameover', 'any player can end the game (disconnect overlay)');

for (const u of [P2, P3, OUTSIDER]) await as(u, `select leave_room('ABCD', $1)`, [u]);
check((await room()) === undefined, 'the last player out deletes the room');
check((await db.query(`select count(*)::int n from round_secrets where code = 'ABCD'`)).rows[0].n === 0, '…along with its round secrets');

// --- AI quota (migration 007) -----------------------------------------------------------
const takeQuota = async (uid, perUser, global) =>
  (await as(null, `select take_ai_quota($1, $2, $3) ok`, [uid, perUser, global])).rows[0].ok;
check(await fails(HOST, `select take_ai_quota($1, 100, 100)`, [HOST]), 'players cannot call take_ai_quota themselves');
check(await fails(HOST, `select * from ai_usage`) || (await as(HOST, `select * from ai_usage`)).rows.length === 0, 'players cannot read ai_usage');
const firstThree = [await takeQuota(HOST, 3, 100), await takeQuota(HOST, 3, 100), await takeQuota(HOST, 3, 100)];
check(firstThree.every(Boolean) && !(await takeQuota(HOST, 3, 100)), 'per-player cap: 3 allowed, the 4th refused');
check(await takeQuota(P2, 3, 100), "one player's cap doesn't block another");
check(!(await takeQuota(P3, 3, 4)), 'global cap refuses everyone once reached');
await db.query(`update ai_usage set at = now() - interval '2 hours'`);
check(await takeQuota(HOST, 3, 100), 'slots free up after an hour');

// --- Invisible characters (migration 007) ------------------------------------------------
await as(HOST, `select create_room('INVS', $1)`, [player(HOST, { name: 'A​l‮ex' })]);
check((await room('INVS')).players[HOST].name === 'Alex', 'invisible characters are stripped from names');
check(await fails(P2, `select join_room('INVS', $1)`, [player(P2, { name: '​​​x' })]), 'a name that is only invisible characters is too short');
await as(P2, `select join_room('INVS', $1)`, [player(P2)]);
await as(P3, `select join_room('INVS', $1)`, [player(P3)]);
await as(HOST, `select start_game('INVS')`);
d = await room('INVS');
const invTarget = (await db.query(`select target_word from round_secrets where code = 'INVS' and round = 1`)).rows[0].target_word;
const invActive = d.activeKnowerUid;
const hidden = invTarget.slice(0, 2) + '​' + invTarget.slice(2);
check(await fails(invActive, `select submit_word('INVS', 1, 0, $1)`, [hidden]), 'target word with a zero-width space inside is still rejected');
await as(invActive, `select submit_word('INVS', 1, 0, $1)`, ['sun​shine']);
check((await room('INVS')).feed[0].text === 'sunshine', 'invisible characters are stripped from words');
for (const u of [HOST, P2, P3]) await as(u, `select leave_room('INVS', $1)`, [u]);

// --- Online play (migration 009) ------------------------------------------------------
const FIFTH = '55555555-5555-5555-5555-555555555555';
const quickMatch = async (uid, extra) => (await as(uid, `select quick_match($1) code`, [player(uid, extra)])).rows[0].code;
const pub1 = await quickMatch(HOST);
d = await room(pub1);
check(d.isPublic === true && d.hostUid === HOST && d.status === 'lobby', 'quick_match opens a public lobby with the caller as host');
check((await db.query(`select is_public from rooms where code = $1`, [pub1])).rows[0].is_public, '…flagged public on the row');
check((await quickMatch(P2)) === pub1, 'the next player is matched into the open lobby');
check((await quickMatch(P2)) === pub1, 'matching again while waiting keeps you in the same lobby');
check((await quickMatch(P3)) === pub1 && Object.keys((await room(pub1)).players).length === 3, 'a third player fills it');
const pub2 = await quickMatch(OUTSIDER);
check(pub2 !== pub1, 'a full lobby is skipped and a new one opened');
await db.query(`update rooms set data = jsonb_set(data, array['players', $2, 'lastSeenAt'], '0') where code = $1`, [pub2, OUTSIDER]);
const pub3 = await quickMatch(FIFTH);
check((await room(pub2)) === undefined && pub3 !== pub2, 'a lobby whose only player went quiet is cleared, not joined');

// Word filter
const offensive = async (t) => (await db.query(`select _is_offensive($1) x`, [t])).rows[0].x;
for (const t of ['fuck', 'FUUUCK', 'f u c k', 'f.u.c.k', 'motherfuckers', 'sh1t', 'Big Sh!t', 'b1tch']) check(await offensive(t), `filter blocks "${t}"`);
for (const t of ['Scunthorpe', 'shell', 'class', 'Niger', 'cocktail', 'grape', 'therapist', 'Dick', 'sunshine']) check(!(await offensive(t)), `filter allows "${t}"`);
check(await fails(FIFTH, `select create_room('BADN', $1)`, [player(FIFTH, { name: 'Sh1t Head' })]), 'offensive names are rejected');
check(await fails(FIFTH, `select quick_match($1)`, [player(FIFTH, { name: 'fuuuck' })]) , '…in Play online too');

// The full public lobby plays; a blocked word is refused
await as(HOST, `select start_game($1)`, [pub1]);
d = await room(pub1);
check(await fails(d.activeKnowerUid, `select submit_word($1, 1, 0, 'shit')`, [pub1]), 'offensive words are rejected');
await as(d.activeKnowerUid, `select submit_word($1, 1, 0, 'sunny')`, [pub1]);
check((await room(pub1)).feed[0].text === 'sunny', 'normal words still go through');

// Reports
check(await fails(P2, `select report_player($1, $2, 'words')`, [pub1, P2]), 'you cannot report yourself');
check(await fails(OUTSIDER, `select report_player($1, $2, 'words')`, [pub1, HOST]), 'only players in the game can report');
check(await fails(P2, `select report_player($1, $2, 'rude')`, [pub1, HOST]), 'unknown report reasons are rejected');
await as(P2, `select report_player($1, $2, 'words')`, [pub1, HOST]);
const report = (await db.query(`select * from player_reports where room_code = $1`, [pub1])).rows[0];
check(report?.reported_uid === HOST && report.reporter_uid === P2 && report.reported_name === 'P1', 'a report records who and why');
check(report?.snapshot?.feed?.[0]?.text === 'sunny' && report.snapshot.players[P3] === 'P3', '…with a snapshot of names and words');
check(await fails(P2, `select * from player_reports`) || (await as(P2, `select * from player_reports`)).rows.length === 0, 'players cannot read reports');

// Lobby heartbeat and going public
await as(P2, `select create_room('PRIV', $1)`, [player(P2)]);
await as(P3, `select join_room('PRIV', $1)`, [player(P3)]);
const staleP3 = () => db.query(`update rooms set data = jsonb_set(data, array['players', $1, 'lastSeenAt'], '0') where code = 'PRIV'`, [P3]);
await staleP3();
await as(P2, `select lobby_heartbeat('PRIV')`);
check(P3 in (await room('PRIV')).players, 'private lobbies keep quiet players');
check(await fails(P3, `select set_room_public('PRIV', true)`), 'only the host can open a lobby to the public');
await as(P2, `select set_room_public('PRIV', true)`);
check((await room('PRIV')).isPublic === true, 'the host can open a lobby to the public');
await as(P2, `select lobby_heartbeat('PRIV')`);
d = await room('PRIV');
check(!(P3 in d.players) && d.hostUid === P2, 'public lobbies drop players who went quiet');
check(d.players[P2].lastSeenAt > Date.now() - 60000, 'the heartbeat marks the caller as present');
await staleP3();
await db.query(`update rooms set data = jsonb_set(data, '{hostUid}', to_jsonb($1::text)) where code = 'PRIV'`, [P2]);
await as(P3, `select join_room('PRIV', $1)`, [player(P3)]);
await db.query(`update rooms set data = jsonb_set(data, array['players', $1, 'lastSeenAt'], '0') where code = 'PRIV'`, [P2]);
await as(P3, `select lobby_heartbeat('PRIV')`);
check((await room('PRIV')).hostUid === P3, 'the host role passes on when the host goes quiet');

// --- Game stats (migration 011) ------------------------------------------------------------
await db.exec(`delete from game_stats`);
await as(P2, `select create_room('STA1', $1)`, [player(P2)]);
await as(P3, `select join_room('STA1', $1, 'link')`, [player(P3)]);
await as(OUTSIDER, `select join_room('STA1', $1, 'code')`, [player(OUTSIDER)]);
check(await stat('games_created_private') === 1 && await stat('joins_link') === 1 && await stat('joins_code') === 1, 'stats: joins count by link or typed code');
check(await fails(FIFTH, `select join_room('STA1', $1, 'link')`, [player(FIFTH)]) && await stat('joins_link') === 1, 'stats: a rejected join (room full) is not counted');
check(await fails(P2, `select create_share_card('STA1')`), 'a game that is not over cannot be shared');
await as(P2, `select start_game('STA1')`);
await as(P3, `select end_game('STA1')`);
await as(P3, `select reset_room_to_lobby('STA1')`);
check(await stat('games_started') === 1 && await stat('games_ended_early') === 1 && await stat('rematches') === 1, 'stats: early endings and rematches are counted');
check(await fails(P2, `select * from game_stats`) || (await as(P2, `select * from game_stats`)).rows.length === 0, 'stats are unreadable to clients');
check(await fails(P2, `select _bump_stat('games_finished')`), 'clients cannot bump stats');
const statColumns = (await db.query(`select column_name from information_schema.columns where table_name = 'game_stats' order by 1`)).rows.map((r) => r.column_name).join();
check(statColumns === 'count,day,metric', 'stats hold only a day, a metric and a count');

// --- Data retention (migration 008) -------------------------------------------------------
check(await fails(HOST, `select purge_expired_data()`), 'players cannot run purge_expired_data');
await as(HOST, `select create_room('NEW1', $1)`, [player(HOST)]);
await as(P2, `select create_room('STAL', $1)`, [player(P2)]);
await db.query(`update rooms set created_at = now() - interval '25 hours' where code = 'STAL'`);
await db.query(`insert into ai_usage (uid, at) values ('x', now() - interval '2 hours')`);
await db.exec(`
  insert into auth.users (id, created_at, last_sign_in_at) values
    ('${HOST}', now() - interval '60 days', now() - interval '60 days'),
    ('${P2}',   now() - interval '60 days', now() - interval '60 days'),
    ('${P3}',   now() - interval '2 days',  now() - interval '2 days');
  insert into auth.users (id, is_anonymous, created_at) values ('${OUTSIDER}', false, now() - interval '90 days');
  insert into auth.sessions (user_id, updated_at) values ('${P2}', now() - interval '1 day');
`);
await db.query(`select purge_expired_data()`);
check((await room('STAL')) === undefined, 'rooms older than 24 hours are purged');
check((await room('NEW1')) !== undefined, 'recent rooms are kept');
check((await db.query(`select count(*)::int n from ai_usage where at < now() - interval '1 hour'`)).rows[0].n === 0, 'old AI usage rows are purged');
const users = (await db.query(`select id::text from auth.users order by id`)).rows.map((r) => r.id);
check(!users.includes(HOST), 'anonymous users idle for 30+ days are purged');
check(users.includes(P2), '…but not if their session was refreshed recently');
check(users.includes(P3), '…and not new anonymous users');
check(users.includes(OUTSIDER), '…and never non-anonymous users');

console.log(failures ? `\n${failures} failed, ${passed} passed` : `\nall ${passed} checks passed`);
process.exit(failures ? 1 : 0);
