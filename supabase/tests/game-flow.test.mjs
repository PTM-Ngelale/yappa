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
  -- Realtime Authorization: channel joins and presence are checked against realtime.messages.
  create schema realtime;
  create table realtime.messages (id serial primary key, topic text not null, extension text not null, payload jsonb, private boolean not null default true);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
  grant usage on schema realtime to anon, authenticated, service_role;
  grant select, insert on realtime.messages to anon, authenticated;
  grant usage on all sequences in schema realtime to anon, authenticated;
  -- Supabase's default grants. New tables get none since 2026-10-30, so the migrations must
  -- grant table access themselves (migration 030); functions are still executable by default.
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
check((await db.query('select count(*)::int n from words')).rows[0].n === 438, '438 words after the 11-category deck (migration 028)');

// --- Lobby -------------------------------------------------------------------------
check(await fails(HOST, `insert into rooms (code, data) values ('ZZZZ', $1)`, [{ hostUid: HOST, players: { [HOST]: {} } }]), 'direct INSERT into rooms is rejected');
check(await fails(HOST, `select create_room('ab', $1)`, [player(HOST)]), 'create_room rejects a malformed code');
await as(HOST, `select create_room('ABCD', $1)`, [player(HOST, { role: 'guesser', isAdmin: true })]);
let d = await room();
check(d.hostUid === HOST && d.status === 'lobby' && d.players[HOST].role === 'knower' && !('isAdmin' in d.players[HOST]), 'create_room builds clean state (forged fields dropped)');
check((await as(OUTSIDER, `select create_room('ABCD', $1) r`, [player(OUTSIDER)])).rows[0].r === 'taken' && (await room()).hostUid === HOST, 'cannot create over an existing room (reported as taken)');
check(await fails(P2, `select join_room('ABCD', $1)`, [player(P3)]), 'cannot join as someone else');
await as(P2, `select join_room('ABCD', $1)`, [player(P2, { name: '  Sam  ', avatarColor: 'javascript:x' })]);
d = await room();
check(d.players[P2].name === 'Sam' && d.players[P2].avatarColor === '#9E9E9E', 'join_room trims the name and rejects a bad colour');
check(await fails(P3, `select start_game('ABCD')`), 'non-member cannot start');
await as(P3, `select join_room('ABCD', $1)`, [player(P3)]);

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
check(await fails(HOST, `select * from words`) && await fails(HOST, `select * from game_decks`), 'the word list and deck are unreadable');

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
  const meaning = (await as(first, `select meaning from round_secrets where code = 'ABCD' and round = $1`, [round])).rows[0]?.meaning;
  const wordMeaning = (await db.query(`select meaning from words where word = $1`, [target])).rows[0]?.meaning;
  check(meaning && meaning === wordMeaning && !JSON.stringify(d).includes(meaning), `round ${round}: Knowers get the word's meaning, kept out of room data`);
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
    check((await db.query(`select * from turn_clocks`)).rows.length === 1 && await fails(HOST, `select * from turn_clocks`), 'the clock table is unreadable to clients');

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
    const offensive = (await as(null, `select begin_guess('ABCD', 1, $1, $2) r`, [guesser, 'Sh1t\u200B'])).rows[0].r;
    check(offensive === 'not-allowed', 'an offensive guess is refused');
    check(await guess(1, guesser) === 'ok', 'the Guesser can guess (a refused guess takes no slot)');
    check(await guess(1, guesser) === 'cooldown', 'guesses are 3 seconds apart');
    check(await record(1, '\u202Ecl\u200Biff ', false) === true, 'a wrong guess is recorded');
    d = await room();
    check(d.status === 'playing' && sameJson(d.feed.at(-1), { kind: 'guess', text: 'cliff', by: guesser, correct: false }), 'a wrong guess shows in the feed (invisible characters stripped) and play goes on');
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
check(wordList.includes('toothbrush') && !wordList.includes('sextant') && !wordList.includes('trampolining'), 'the reviewed word list swaps obscure words for familiar ones');
const cards = (await db.query(`select category, difficulty, forbidden from words`)).rows;
check(new Set(cards.map((w) => w.category)).size === 11, 'words are filed in 11 categories');
check(cards.every((w) => w.forbidden.length === { easy: 3, medium: 4, hard: 5 }[w.difficulty]), 'off-limits lists: 3 Easy, 4 Medium, 5 Hard');
const hardBy = cards.filter((w) => w.difficulty === 'hard').reduce((m, w) => ((m[w.category] = (m[w.category] ?? 0) + 1), m), {});
check(Object.values(hardBy).length === 11 && Object.values(hardBy).every((n) => n >= 8), 'every category has at least 8 Hard words');
const meanings = (await db.query(`select word, meaning from words`)).rows;
check(meanings.every((w) => w.meaning.length > 0 && w.meaning.length <= 120 && !w.meaning.toLowerCase().includes(w.word.toLowerCase())),
  'every word has a short meaning that does not use the word itself');
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
const [FIFTH, SIXTH, SEVENTH] = ['5', '6', '7'].map((d) => `${d.repeat(8)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(4)}-${d.repeat(12)}`);
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
for (const u of [FIFTH, SIXTH]) await as(u, `select join_room('STA1', $1)`, [player(u)]);
check((await as(SEVENTH, `select join_room('STA1', $1, 'link') r`, [player(SEVENTH)])).rows[0].r === 'full' && await stat('joins_link') === 1, 'stats: a rejected join (room full) is not counted');
check(await fails(P2, `select create_share_card('STA1')`), 'a game that is not over cannot be shared');
await as(P2, `select start_game('STA1')`);
await as(P3, `select end_game('STA1')`);
await as(P3, `select reset_room_to_lobby('STA1')`);
check(await stat('games_started') === 1 && await stat('games_ended_early') === 1 && await stat('rematches') === 1, 'stats: early endings and rematches are counted');
check(await fails(P2, `select * from game_stats`) || (await as(P2, `select * from game_stats`)).rows.length === 0, 'stats are unreadable to clients');
check(await fails(P2, `select _bump_stat('games_finished')`), 'clients cannot bump stats');
const statColumns = (await db.query(`select column_name from information_schema.columns where table_name = 'game_stats' order by 1`)).rows.map((r) => r.column_name).join();
check(statColumns === 'count,day,metric', 'stats hold only a day, a metric and a count');

// --- Room codes can't be brute-forced (migration 017) -------------------------------------
const PROBER = '66666666-6666-6666-6666-666666666666';
await as(HOST, `select create_room('OPEN', $1)`, [player(HOST)]);
const errorOf = async (uid, sql, params) => { try { await as(uid, sql, params); return null; } catch (e) { return e.message; } };
const missingErr = await errorOf(PROBER, `select lobby_heartbeat('NONE')`);
const existingErr = await errorOf(PROBER, `select lobby_heartbeat('OPEN')`);
check(missingErr && missingErr.replace('NONE', 'X') === existingErr.replace('OPEN', 'X'), 'a non-member gets the same error whether or not a room exists');
check((await errorOf(PROBER, `select set_room_public('NONE', true)`)).replace('NONE', 'X') === (await errorOf(PROBER, `select set_room_public('OPEN', true)`)).replace('OPEN', 'X'), 'host checks do not reveal whether a room exists either');
check((await as(PROBER, `select join_room('NONE', $1, 'code') r`, [player(PROBER)])).rows[0].r === 'not-found', 'joining a missing room reports not-found');
for (let i = 1; i < 19; i++) await as(PROBER, `select join_room($1, $2) r`, [`NO${String(i).padStart(2, '0')}`, player(PROBER)]);
check((await as(PROBER, `select create_room('OPEN', $1) r`, [player(PROBER)])).rows[0].r === 'taken', 'creating over a live code counts as a miss');
check(await fails(PROBER, `select join_room('OPEN', $1)`, [player(PROBER)]), 'after 20 misses in an hour, joining is refused');
check(!(PROBER in (await room('OPEN')).players), '…even for a code that exists');
check(await fails(PROBER, `select create_room('PRB1', $1)`, [player(PROBER)]), '…and so is creating a room');
await db.query(`update join_failures set at = now() - interval '61 minutes' where uid = $1`, [PROBER]);
check((await as(PROBER, `select join_room('OPEN', $1) r`, [player(PROBER)])).rows[0].r === 'ok' && PROBER in (await room('OPEN')).players, 'misses older than an hour no longer count');
check(await fails(PROBER, `select * from join_failures`) || (await as(PROBER, `select * from join_failures`)).rows.length === 0, 'clients cannot read missed-code records');
await as(HOST, `select leave_room('OPEN', $1)`, [HOST]);
d = await room('OPEN');
check(d && !(HOST in d.players) && d.hostUid === PROBER, 'a host leaving a lobby that never started hands off to the player still there');
await as(PROBER, `select leave_room('OPEN', $1)`, [PROBER]);
check((await room('OPEN')) === undefined, '…and the last one out deletes it');

// --- Private room channels (migration 019) ----------------------------------------------
await as(HOST, `select create_room('CHAN', $1)`, [player(HOST)]);
await as(P2, `select join_room('CHAN', $1)`, [player(P2)]);
await db.query(`insert into realtime.messages (topic, extension) values ('room:CHAN', 'presence'), ('presence:room:CHAN', 'presence')`);
/** As `uid` on Realtime channel `topic`: can they join (read), and can they track presence (write)? */
const onChannel = async (uid, topic, sql) => {
  await db.exec(`select set_config('realtime.topic', '${topic}', false)`);
  try { return await as(uid, sql); } finally { await db.exec(`select set_config('realtime.topic', '', false)`); }
};
const canJoin = async (uid, topic) => (await onChannel(uid, topic, `select count(*)::int n from realtime.messages where topic = realtime.topic()`)).rows[0].n > 0;
const canSend = async (uid, topic, extension) => {
  try { await onChannel(uid, topic, `insert into realtime.messages (topic, extension) values (realtime.topic(), '${extension}')`); return true; } catch { return false; }
};
check(await canJoin(P2, 'presence:room:CHAN') && await canJoin(P2, 'room:CHAN'), 'a room player can join its presence and room channels');
check(!(await canJoin(OUTSIDER, 'presence:room:CHAN')) && !(await canJoin(OUTSIDER, 'room:CHAN')), 'an outsider cannot join a room’s channels');
check(await canSend(P2, 'presence:room:CHAN', 'presence'), 'a room player can track presence');
check(!(await canSend(OUTSIDER, 'presence:room:CHAN', 'presence')), 'an outsider cannot track presence in the room');
check(!(await canSend(P2, 'presence:room:CHAN', 'broadcast')) && !(await canSend(P2, 'room:CHAN', 'broadcast')), 'nobody can broadcast on room channels');
check(!(await canJoin(P2, 'presence:room:chan')) && !(await canJoin(P2, 'something-else')), 'other topics are not opened up');
await as(P2, `select leave_room('CHAN', $1)`, [P2]);
check(!(await canJoin(P2, 'presence:room:CHAN')), 'a player who left can no longer join');
await as(HOST, `select leave_room('CHAN', $1)`, [HOST]);

// --- 3 to 5 players (migration 020) ------------------------------------------------------

await as(HOST, `select create_room('FIVE', $1)`, [player(HOST)]);
for (const u of [P2, P3, OUTSIDER]) await as(u, `select join_room('FIVE', $1)`, [player(u)]);
check(await fails(HOST, `select set_room_public('FIVE', true)`), 'a lobby with 3 or more players cannot go public');
check((await as(FIFTH, `select join_room('FIVE', $1) r`, [player(FIFTH)])).rows[0].r === 'ok', 'a fifth player can join a private room');
check((await as(SIXTH, `select join_room('FIVE', $1) r`, [player(SIXTH)])).rows[0].r === 'full' && !(SIXTH in (await room('FIVE')).players), 'a sixth player is rejected');
d = await room('FIVE');
check(new Set(Object.values(d.players).map((pl) => pl.avatarColor)).size === 5, 'players who picked the same colour get different ones');
await as(HOST, `select create_room('SOLO', $1)`, [player(HOST)]);
check(await fails(HOST, `select start_game('SOLO')`), 'one player cannot start a game');
await as(HOST, `select leave_room('SOLO', $1)`, [HOST]);

const tiers = (words) => words.map((w) => w.difficulty[0]).join('');
check(tiers((await db.query(`select _draw_deck(null, 8) d`)).rows[0].d) === 'eeemmmhh', 'an 8-round deck is 3 Easy, 3 Medium, 2 Hard');
check(tiers((await db.query(`select _draw_deck(null, 10) d`)).rows[0].d) === 'eeeemmmhhh', 'a 10-round deck is 4 Easy, 3 Medium, 3 Hard');

await as(HOST, `select start_game('FIVE')`);
d = await room('FIVE');
check(d.status === 'playing' && d.maxRounds === 10 && d.playerOrder.length === 5, 'five players play 10 rounds');
check(tiers((await db.query(`select words from game_decks where code = 'FIVE'`)).rows[0].words) === 'eeeemmmhhh', 'the five-player deck has 10 words, easiest first');
const knowersOf = (r) => r.playerOrder.filter((u) => u !== r.guesserUid);
let fiveWins = 0;
for (let round = 1; round <= 10; round++) {
  d = await room('FIVE');
  const ks = knowersOf(d);
  check(d.round === round && ks.length === 4 && d.activeKnowerUid === ks[(round - 1) % 4], `five players, round ${round}: four Knowers, the first one moves on each round`);
  check(Object.values(d.players).filter((pl) => pl.role === 'knower').length === 4, `five players, round ${round}: everyone but the Guesser is a Knower`);
  if (round === 1) {
    const seen = [d.activeKnowerUid];
    for (const [i, w] of ['tall', 'bright', 'shore', 'ships', 'beam'].entries()) {
      await as((await room('FIVE')).activeKnowerUid, `select submit_word('FIVE', 1, $1, $2)`, [i, w]);
      seen.push((await room('FIVE')).activeKnowerUid);
    }
    check(seen.join() === [0, 1, 2, 3, 0, 1].map((i) => ks[i]).join(), 'turns go round all four Knowers in play order');
    for (const k of ks) await as(k, `select set_typing('FIVE', true)`);
    check(Object.keys((await room('FIVE')).typing).join() === ks[1], 'with four Knowers, only the active one can set typing');
    check(await fails(ks[3], `select submit_word('FIVE', 1, 5, 'rocks')`), 'a Knower whose turn it is not cannot submit');
    await db.query(`update turn_clocks set started_at = started_at - interval '13 seconds' where code = 'FIVE'`);
    check((await as(ks[0], `select skip_turn('FIVE', 1, 5) ok`)).rows[0].ok === true, 'a turn that runs out is skipped');
    d = await room('FIVE');
    check(d.activeKnowerUid === ks[2] && d.feed.at(-1).kind === 'skip' && d.feed.at(-1).by === ks[1], '…and passes to the next Knower');
  }
  const right = round % 4 !== 0;
  if (right) {
    check((await as(null, `select begin_guess('FIVE', $1, $2) r`, [round, d.guesserUid])).rows[0].r === 'ok', `five players, round ${round}: the Guesser guesses`);
    const target = (await db.query(`select target_word from round_secrets where code = 'FIVE' and round = $1`, [round])).rows[0].target_word;
    await as(null, `select record_guess('FIVE', $1, $2, true)`, [round, target]);
    fiveWins++;
  } else {
    await db.query(`update turn_clocks set started_at = started_at - interval '70 seconds', round_started_at = round_started_at - interval '70 seconds' where code = 'FIVE'`);
    await as(ks[0], `select expire_round('FIVE', $1)`, [round]);
  }
  check((await room('FIVE')).status === 'resolution', `five players, round ${round}: the round ends`);
  await as(HOST, `select advance_round('FIVE', $1)`, [round]);
}
d = await room('FIVE');
check(d.status === 'gameover' && Object.keys(d.history).length === 10, 'the five-player game ends after 10 rounds');
check(Object.values(d.history).filter((h) => h.outcome === 'won').length === fiveWins, `five players: score adds up (${fiveWins})`);
const fiveGuesses = Object.values(d.history).reduce((m, h) => ((m[h.guesserUid] = (m[h.guesserUid] ?? 0) + 1), m), {});
check(Object.keys(fiveGuesses).length === 5 && Object.values(fiveGuesses).every((n) => n === 2), 'five players: everyone guesses twice');

// Play Again with four: 8 rounds
await as(FIFTH, `select leave_room('FIVE', $1)`, [FIFTH]);
await as(P2, `select reset_room_to_lobby('FIVE')`);
await as(HOST, `select start_game('FIVE')`);
d = await room('FIVE');
check(d.maxRounds === 8 && d.playerOrder.length === 4 && tiers((await db.query(`select words from game_decks where code = 'FIVE'`)).rows[0].words) === 'eeemmmhh', 'four players play 8 rounds (3 Easy, 3 Medium, 2 Hard)');
check(knowersOf(d).length === 3 && d.activeKnowerUid === knowersOf(d)[0], 'four players: three Knowers, the first in play order starts');
check(d.mode === 'team' && d.clueBudget === null, 'a game of 3 or more is a team game with no clue budget');
await as(HOST, `select end_game('FIVE')`);
for (const u of [HOST, P2, P3, OUTSIDER]) await as(u, `select leave_room('FIVE', $1)`, [u]);

// --- Duo mode (migration 021) ----------------------------------------------------------
await as(HOST, `select create_room('PAIR', $1)`, [player(HOST)]);
await as(P2, `select join_room('PAIR', $1)`, [player(P2)]);
await as(HOST, `select start_game('PAIR')`);
d = await room('PAIR');
check(d.status === 'playing' && d.mode === 'duo' && d.clueBudget === 8 && d.maxRounds === 6, 'two players play duo: 6 rounds, 8 clues a round');
check(tiers((await db.query(`select words from game_decks where code = 'PAIR'`)).rows[0].words) === 'eemmhh', 'the duo deck is 2 Easy, 2 Medium, 2 Hard');
const ageDuo = (secs) => db.query(`update turn_clocks set started_at = started_at - make_interval(secs => $1), round_started_at = round_started_at - make_interval(secs => $1) where code = 'PAIR'`, [secs]);
const duoClues = ['tall', 'white', 'tower', 'shore', 'glow', 'beam', 'ships', 'rocks'];
const duoGuessers = {};
for (let round = 1; round <= 6; round++) {
  d = await room('PAIR');
  const knower = d.playerOrder.find((u) => u !== d.guesserUid);
  duoGuessers[d.guesserUid] = (duoGuessers[d.guesserUid] ?? 0) + 1;
  check(d.round === round && d.activeKnowerUid === knower, `duo, round ${round}: the other player describes`);
  if (round === 1) {
    for (const [i, w] of duoClues.entries()) {
      await as(knower, `select submit_word('PAIR', 1, $1, $2)`, [i, w]);
      if (i === 0) check((await room('PAIR')).activeKnowerUid === knower, 'in duo the Knower keeps the turn');
      if (i === 2) {
        await ageDuo(15);
        check((await as(d.guesserUid, `select skip_turn('PAIR', 1, 3) ok`)).rows[0].ok === false, 'in duo a slow clue is never skipped');
      }
    }
    check((await room('PAIR')).feed.length === 8, 'in duo the Knower can give 8 clues');
    check(await fails(knower, `select submit_word('PAIR', 1, 8, 'sea')`), 'a ninth clue is refused');
    check((await room('PAIR')).status === 'playing', 'out of clues, the round goes on for the Guesser');
  } else {
    await as(knower, `select submit_word('PAIR', $1, 0, 'clue')`, [round]);
  }
  const target = (await db.query(`select target_word from round_secrets where code = 'PAIR' and round = $1`, [round])).rows[0].target_word;
  check((await as(null, `select begin_guess('PAIR', $1, $2) r`, [round, d.guesserUid])).rows[0].r === 'ok', `duo, round ${round}: the Guesser guesses`);
  await as(null, `select record_guess('PAIR', $1, $2, true)`, [round, target]);
  await as(HOST, `select advance_round('PAIR', $1)`, [round]);
}
d = await room('PAIR');
check(d.status === 'gameover' && Object.values(d.history).every((h) => h.outcome === 'won'), 'the duo game ends after 6 rounds');
check(d.history['1'].wordCount === 8 && d.history['2'].wordCount === 1, 'duo history counts the clues each round used');
check(Object.keys(duoGuessers).length === 2 && Object.values(duoGuessers).every((n) => n === 3), 'in duo each player guesses 3 times');
await as(HOST, `select leave_room('PAIR', $1)`, [HOST]);
await as(P2, `select leave_room('PAIR', $1)`, [P2]);

// Public rooms still seat 3
await as(SIXTH, `select create_room('PUB3', $1)`, [player(SIXTH)]);
await as(SIXTH, `select set_room_public('PUB3', true)`);
await as(P2, `select join_room('PUB3', $1)`, [player(P2)]);
await as(P3, `select join_room('PUB3', $1)`, [player(P3)]);
check((await as(OUTSIDER, `select join_room('PUB3', $1) r`, [player(OUTSIDER)])).rows[0].r === 'full', 'a public room is full at 3');
for (const u of [P2, P3, SIXTH]) await as(u, `select leave_room('PUB3', $1)`, [u]);

// --- Clocks by player count (migration 022) ----------------------------------------------
await as(HOST, `select create_room('CLOK', $1)`, [player(HOST)]);
for (const u of [P2, P3, OUTSIDER, FIFTH]) await as(u, `select join_room('CLOK', $1)`, [player(u)]);
const clocks = async () => ((r) => `${r.turnMs}/${r.roundMs}`)(await room('CLOK'));
const replay = async () => {
  await as(HOST, `select end_game('CLOK')`);
  await as(HOST, `select reset_room_to_lobby('CLOK')`);
};
const ageClock = (cols, secs) =>
  db.query(`update turn_clocks set ${cols.map((c) => `${c} = ${c} - make_interval(secs => $1)`).join(', ')} where code = 'CLOK'`, [secs]);

await as(HOST, `select start_game('CLOK', true)`);
check((await clocks()) === '15000/90000', 'five players: 15 second turns, a 90 second round');
await replay();
await as(FIFTH, `select leave_room('CLOK', $1)`, [FIFTH]);
await as(HOST, `select start_game('CLOK', true)`);
d = await room('CLOK');
check((await clocks()) === '15000/75000', 'four players: 15 second turns, a 75 second round');
await as(d.activeKnowerUid, `select submit_word('CLOK', 1, 0, 'zorp')`);
await ageClock(['started_at', 'round_started_at'], 12);
check((await as(d.guesserUid, `select skip_turn('CLOK', 1, 1) ok`)).rows[0].ok === false, 'a turn is not over at 12 seconds');
await ageClock(['started_at', 'round_started_at'], 3.5);
check((await as(d.guesserUid, `select skip_turn('CLOK', 1, 1) ok`)).rows[0].ok === true, '…but is at 15');
await ageClock(['round_started_at'], 50);
check((await as(d.guesserUid, `select expire_round('CLOK', 1) ok`)).rows[0].ok === false, 'a four-player round is not over at 65 seconds');
await ageClock(['round_started_at'], 13);
check((await as(d.guesserUid, `select expire_round('CLOK', 1) ok`)).rows[0].ok === true, '…but is at 78 (75 plus the role card)');
await replay();
await as(HOST, `select start_game('CLOK')`);
check((await clocks()) === 'undefined/undefined', 'a game started by an older app records no clocks (the old 10 and 60 seconds)');
await replay();
await as(OUTSIDER, `select leave_room('CLOK', $1)`, [OUTSIDER]);
await as(HOST, `select start_game('CLOK', true)`);
check((await clocks()) === '15000/60000', 'three players: 15 second turns, a 60 second round');
await replay();
await as(P3, `select leave_room('CLOK', $1)`, [P3]);
await as(HOST, `select start_game('CLOK', true)`);
check((await room('CLOK')).mode === 'duo' && (await clocks()) === '15000/60000', 'duo keeps its 60 second round');
await as(HOST, `select end_game('CLOK')`);
for (const u of [P2, HOST]) await as(u, `select leave_room('CLOK', $1)`, [u]);

// --- Categories and off-limits words (migrations 023 and 024) ------------------------------
let spread = true;
for (let i = 0; i < 20; i++) {
  for (const n of [9, 10]) {
    const cats = (await db.query(`select _draw_deck(null, $1) d`, [n])).rows[0].d.map((w) => w.category);
    const most = Math.max(...Object.values(cats.reduce((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {})));
    if (cats.length !== n || cats.some((c, j) => j > 0 && c === cats[j - 1]) || new Set(cats).size !== n || most > 1) spread = false;
  }
}
// 11 categories since migration 028, so a 9 or 10 word deck needn't repeat one.
check(spread, 'decks of 9 and 10 spread over the categories, never the same one twice');
const newCats = (await db.query(`select array_agg(distinct category) a from words where category in ('Pop Culture', 'Fairy Tales', 'Video Games')`)).rows[0].a;
check(newCats?.length === 3, 'Pop Culture, Fairy Tales and Video Games are in the word list');
const popDeck = (await db.query(`select _draw_deck(null, 10, array['Pop Culture', 'Fairy Tales', 'Video Games']) d`)).rows[0].d;
check(popDeck.length === 10 && tiers(popDeck) === 'eeeemmmhhh', 'the new categories alone make a full deck');

const fails2 = async (uid, sql, params) => {
  try { await as(uid, sql, params); return ''; } catch (e) { return e.message; }
};
await as(HOST, `select create_room('OFFL', $1)`, [player(HOST)]);
for (const u of [P2, P3]) await as(u, `select join_room('OFFL', $1)`, [player(u)]);
await as(HOST, `select start_game('OFFL', true)`);
d = await room('OFFL');
check(d.offLimits === true, 'a game started by a newer app has off-limits words');
const offCard = (await db.query(`select w.difficulty, s.forbidden from round_secrets s join words w on w.id = s.word_id where s.code = 'OFFL' and s.round = 1`)).rows[0];
check(offCard.forbidden.length === 3, 'round 1 (Easy) has 3 off-limits words');
const knowerSees = (await as(d.activeKnowerUid, `select forbidden from round_secrets where code = 'OFFL' and round = 1`)).rows[0]?.forbidden;
check(knowerSees?.join() === offCard.forbidden.join(), 'Knowers can read the off-limits words');
check((await as(d.guesserUid, `select forbidden from round_secrets where code = 'OFFL' and round = 1`)).rows.length === 0, 'the Guesser cannot');
const off = offCard.forbidden[0];
check((await fails2(d.activeKnowerUid, `select submit_word('OFFL', 1, 0, $1)`, [off])).includes('word not allowed: off limits'), 'an off-limits word is turned down');
check((await fails2(d.activeKnowerUid, `select submit_word('OFFL', 1, 0, $1)`, [`${off}s`])).includes('off limits'), '…and so is a simple form of it');
// Round 1's word, swapped for one with parts and a variant spelling.
await db.query(`update round_secrets set target_word = 'Bicycle', word_id = 'bicycle' where code = 'OFFL' and round = 1`);
check((await fails2(d.activeKnowerUid, `select submit_word('OFFL', 1, 0, 'bikes')`)).includes('that is the target word'), "the word's own spellings count as the word (bikes for Bicycle)");
await db.query(`update round_secrets set target_word = 'Lighthouse', word_id = 'lighthouse' where code = 'OFFL' and round = 1`);
check((await fails2(d.activeKnowerUid, `select submit_word('OFFL', 1, 0, 'house')`)).includes('that is the target word'), "…and so do its parts (house for Lighthouse)");
await db.query(`update round_secrets set target_word = 'Bowling', word_id = 'bowling' where code = 'OFFL' and round = 1`);
check((await fails2(d.activeKnowerUid, `select submit_word('OFFL', 1, 0, 'bowl')`)).includes('that is the target word'), '…and simple forms match both ways (bowl for Bowling)');
check((await fails2(d.activeKnowerUid, `select submit_word('OFFL', 1, 0, 'zorp')`)) === '', 'an ordinary clue still goes in');
await as(null, `select begin_guess('OFFL', 1, $1)`, [d.guesserUid]);
await as(null, `select record_guess('OFFL', 1, 'Bowling', true)`);
d = await room('OFFL');
check(d.history['1'].forbidden.join() === offCard.forbidden.join(), "the round's history keeps its off-limits words for the result screen");
await as(HOST, `select end_game('OFFL')`);
await as(HOST, `select reset_room_to_lobby('OFFL')`);
await as(HOST, `select start_game('OFFL')`);
d = await room('OFFL');
const oldOff = (await db.query(`select forbidden from round_secrets where code = 'OFFL' and round = 1`)).rows[0].forbidden;
check(!('offLimits' in d) && oldOff.length === 0, 'a game started by an older app has no off-limits words');
const realOff = (await db.query(`select w.forbidden from round_secrets s join words w on w.id = s.word_id where s.code = 'OFFL' and s.round = 1`)).rows[0].forbidden;
check((await fails2(d.activeKnowerUid, `select submit_word('OFFL', 1, 0, $1)`, [realOff[0]])) === '', '…so its Knowers can use them');
await as(HOST, `select end_game('OFFL')`);
for (const u of [P2, P3, HOST]) await as(u, `select leave_room('OFFL', $1)`, [u]);

// --- Versus mode (migration 025) ------------------------------------------------------------
const vJoin = async (uid, versus = true) =>
  (await as(uid, `select join_room('VERS', $1, 'code', $2) r`, [player(uid), versus])).rows[0].r;
const oldJoin = async (uid) => (await as(uid, `select join_room('VERS', $1, 'code') r`, [player(uid)])).rows[0].r;
const teamsOf = (r) => Object.values(r.players).reduce((m, pl) => ((m[pl.team] = [...(m[pl.team] ?? []), pl.uid]), m), {});
await as(HOST, `select create_room('VERS', $1)`, [player(HOST)]);
await vJoin(P2);
await oldJoin(P3);
check((await fails2(HOST, `select set_versus('VERS', true)`)).includes('update the app'), 'versus cannot be switched on while someone has an older app');
await as(P3, `select leave_room('VERS', $1)`, [P3]);
check(await fails(P2, `select set_versus('VERS', true)`), 'only the host can switch versus on');
await as(HOST, `select set_versus('VERS', true)`);
d = await room('VERS');
check(d.versus === true && d.players[HOST].team && d.players[P2].team && d.players[HOST].team !== d.players[P2].team, 'switching versus on deals the players into two teams');
check((await oldJoin(P3)) === 'full' && !(P3 in (await room('VERS')).players), 'an older app cannot join a versus lobby');
for (const u of [P3, OUTSIDER, FIFTH, SIXTH]) check((await vJoin(u)) === 'ok', 'a newer app joins the versus lobby');
d = await room('VERS');
check(Object.keys(d.players).length === 6 && teamsOf(d).red.length === 3 && teamsOf(d).blue.length === 3, 'a versus room seats 6, newcomers joining the smaller team');
check((await vJoin(SEVENTH)) === 'full', 'a seventh player is turned away');
check(await fails(HOST, `select set_versus('VERS', false)`), 'versus cannot be switched off with 6 players');
check(await fails(HOST, `select set_room_public('VERS', true)`), 'a versus lobby cannot go public');
check((await fails2(P2, `select set_team('VERS', $1, $2)`, [P2, d.players[P2].team === 'red' ? 'blue' : 'red'])).includes('team is full'), 'a full team takes nobody else');
const p2Team = d.players[P2].team;
await vJoin(P2); // joining again (a reconnect) keeps the team
check((await room('VERS')).players[P2].team === p2Team, 'a player joining again keeps their team');
await as(SIXTH, `select leave_room('VERS', $1)`, [SIXTH]);
d = await room('VERS');
let [bigTeam, smallTeam] = teamsOf(d).red.length === 3 ? ['red', 'blue'] : ['blue', 'red'];
const mover = teamsOf(d)[bigTeam].find((u) => u !== HOST);
const bystander = teamsOf(d)[smallTeam].find((u) => u !== HOST);
check(await fails(bystander, `select set_team('VERS', $1, $2)`, [mover, smallTeam]), 'a player cannot move someone else');
await as(mover, `select set_team('VERS', $1, $2)`, [mover, smallTeam]);
check((await room('VERS')).players[mover].team === smallTeam, 'a player can switch to a team with room');
await as(HOST, `select set_team('VERS', $1, $2)`, [mover, bigTeam]);
check((await room('VERS')).players[mover].team === bigTeam, 'the host can move anyone');
await as(HOST, `select shuffle_teams('VERS')`);
d = await room('VERS');
check([2, 3].includes(teamsOf(d).red?.length) && teamsOf(d).red.length + teamsOf(d).blue.length === 5, 'shuffling deals 5 players into teams of 2 and 3');
check((await fails2(HOST, `select start_game('VERS')`)).includes('update the app'), 'an older app cannot start a versus game');
const vAge = (sql, secs) => db.query(sql.replace('$c', `'VERS'`), [secs]);
const ageVRound = (secs) => vAge(`update turn_clocks set round_started_at = round_started_at - make_interval(secs => $1) where code = $c`, secs);
const ageVTurn = (team, secs) => db.query(`update side_clocks set started_at = started_at - make_interval(secs => $1) where code = 'VERS' and side = $2`, [secs, team]);
const vSecret = async (r) => (await db.query(`select target_word from round_secrets where code = 'VERS' and round = $1`, [r])).rows[0].target_word;
const vGuess = async (r, uid) => (await as(null, `select begin_guess('VERS', $1, $2) r`, [r, uid])).rows[0].r;
const vRecord = async (r, text, correct, uid) => (await as(null, `select record_guess('VERS', $1, $2, $3, $4) ok`, [r, text, correct, uid])).rows[0].ok;

await as(HOST, `select start_game('VERS', true)`);
d = await room('VERS');
[bigTeam, smallTeam] = d.sides.red.order.length === 3 ? ['red', 'blue'] : ['blue', 'red'];
check(d.status === 'playing' && d.mode === 'versus' && d.maxRounds === 6 && d.roundMs === 75000 && d.turnMs === 15000 && d.offLimits === true, 'a versus game: 6 rounds, 15 second turns, a 75 second round, off-limits words');
check(tiers((await db.query(`select words from game_decks where code = 'VERS'`)).rows[0].words) === 'eemmhh', 'the versus deck is 2 Easy, 2 Medium, 2 Hard');
check(d.sides[bigTeam].order.length === 3 && d.sides[smallTeam].order.length === 2 && d.guesserUid === '' && d.activeKnowerUid === '', 'each team has its own order; the shared round fields stay empty');
const vGuessed = {};
let vWins = { red: 0, blue: 0 };
for (let round = 1; round <= 6; round++) {
  d = await room('VERS');
  const big = d.sides[bigTeam];
  const small = d.sides[smallTeam];
  vGuessed[big.guesserUid] = (vGuessed[big.guesserUid] ?? 0) + 1;
  vGuessed[small.guesserUid] = (vGuessed[small.guesserUid] ?? 0) + 1;
  const target = await vSecret(round);
  check(d.round === round && d.players[big.guesserUid].role === 'guesser' && d.players[small.guesserUid].role === 'guesser', `versus, round ${round}: one Guesser on each team`);
  check(!JSON.stringify(d).includes(`"${target}"`), `versus, round ${round}: the word is not in room data`);
  let readable = true;
  for (const u of [...big.order, ...small.order]) {
    const rows = (await as(u, `select target_word from round_secrets where code = 'VERS' and round = $1`, [round])).rows;
    const isGuesser = u === big.guesserUid || u === small.guesserUid;
    if (isGuesser ? rows.length !== 0 : rows[0]?.target_word !== target) readable = false;
  }
  check(readable, `versus, round ${round}: both teams' Knowers can read the word, neither Guesser can`);

  if (round === 1) {
    const bigKnowers = big.order.filter((u) => u !== big.guesserUid);
    const smallKnower = small.order.find((u) => u !== small.guesserUid);
    check(big.activeKnowerUid === bigKnowers[0] && small.activeKnowerUid === smallKnower, 'each team starts with its first Knower');
    await ageVTurn(smallTeam, 5);
    const smallClock = (await db.query(`select started_at from side_clocks where code = 'VERS' and side = $1`, [smallTeam])).rows[0].started_at;
    check((await as(bigKnowers[0], `select submit_word('VERS', 1, 0, 'tall') i`)).rows[0].i === 1, 'a Knower adds a word to their team');
    d = await room('VERS');
    check(d.sides[bigTeam].feed.length === 1 && d.sides[smallTeam].feed.length === 0 && d.feed.length === 0, "…into their own team's feed only");
    check(d.sides[bigTeam].activeKnowerUid === bigKnowers[1] && d.sides[bigTeam].turnIndex === 1, '…and the turn passes to their teammate');
    check((await db.query(`select started_at from side_clocks where code = 'VERS' and side = $1`, [smallTeam])).rows[0].started_at.getTime() === smallClock.getTime(), "the other team's turn clock carries on");
    check(await fails(bigKnowers[0], `select submit_word('VERS', 1, 1, 'white')`), 'a Knower cannot go twice in a row on a team of 3');
    check(await fails(small.guesserUid, `select submit_word('VERS', 1, 0, 'white')`), 'a Guesser cannot add a word');
    for (const [i, w] of ['water', 'tower', 'shore'].entries()) await as(smallKnower, `select submit_word('VERS', 1, $1, $2)`, [i, w]);
    d = await room('VERS');
    check(d.sides[smallTeam].feed.length === 3 && d.sides[smallTeam].activeKnowerUid === smallKnower, 'on a team of 2 the Knower keeps the turn');
    await as(bigKnowers[1], `select set_typing('VERS', true)`);
    await as(bigKnowers[0], `select set_typing('VERS', true)`);
    await as(smallKnower, `select set_typing('VERS', true)`);
    check(Object.keys((await room('VERS')).typing).sort().join() === [bigKnowers[1], smallKnower].sort().join(), "each team's active Knower can show they're typing");
    const state = (await as(smallKnower, `select clock_state('VERS') s`)).rows[0].s;
    check(state.turnIndex === 3 && (await as(bigKnowers[0], `select clock_state('VERS') s`)).rows[0].s.turnIndex === 1, "clock_state gives each player their own team's turn");
    await ageVTurn(bigTeam, 16);
    await ageVTurn(smallTeam, 30);
    check((await as(smallKnower, `select skip_turn('VERS', 1, 3) ok`)).rows[0].ok === false, 'a lone Knower is never skipped');
    check((await as(big.guesserUid, `select skip_turn('VERS', 1, 1) ok`)).rows[0].ok === true, "a slow Knower's turn is skipped");
    d = await room('VERS');
    check(d.sides[bigTeam].activeKnowerUid === bigKnowers[0] && d.sides[bigTeam].feed.at(-1).kind === 'skip' && d.sides[smallTeam].turnIndex === 3, "…on their own team only");

    // Pausing holds both teams' turn clocks.
    const before = (await db.query(`select started_at from side_clocks where code = 'VERS' and side = $1`, [bigTeam])).rows[0].started_at.getTime();
    await as(HOST, `select pause_turn_clock('VERS')`);
    await vAge(`update turn_clocks set hold_started_at = hold_started_at - make_interval(secs => $1) where code = $c`, 5);
    await as(HOST, `select resume_turn_clock('VERS')`);
    const after = (await db.query(`select started_at from side_clocks where code = 'VERS' and side = $1`, [bigTeam])).rows[0].started_at.getTime();
    check(Math.abs(after - before - 5000) < 1000, "a pause moves each team's turn clock on");

    check((await vGuess(1, small.guesserUid)) === 'ok', 'the first Guesser guesses');
    check((await vRecord(1, 'Cliff', false, small.guesserUid)) === true, '…wrong');
    d = await room('VERS');
    check(d.status === 'playing' && d.sides[smallTeam].feed.at(-1).kind === 'guess' && d.sides[smallTeam].feed.at(-1).by === small.guesserUid && d.sides[bigTeam].feed.every((e) => e.kind !== 'guess'), "a wrong guess goes into the guessing team's feed");
    check((await vGuess(1, small.guesserUid)) === 'cooldown', 'a Guesser waits 3 seconds between guesses');
    check((await vGuess(1, big.guesserUid)) === 'ok', "…but the other team's Guesser has their own wait");
    check((await vGuess(1, HOST === big.guesserUid || HOST === small.guesserUid ? bigKnowers[0] : HOST)) === 'not-the-guesser', 'a Knower cannot guess');
    check((await as(null, `select record_guess('VERS', 1, 'x', true) ok`)).rows[0].ok === false && (await room('VERS')).status === 'playing', "a guess that doesn't say whose it is counts for nobody");
    check((await vRecord(1, target, true, big.guesserUid)) === true, 'the other Guesser gets it');
    d = await room('VERS');
    const h = d.history['1'];
    check(d.status === 'resolution' && h.outcome === 'won' && h.winner === bigTeam && h.guesserUid === big.guesserUid && h.guess === target, 'the first team to get it wins the round');
    check(h.sides[smallTeam].feed.length === 4 && h.sides[bigTeam].wordCount === 1 && h.wordCount === 1 && h.chain.join() === 'tall', "the round's history keeps both teams' clues");
    check((await vRecord(1, target, true, small.guesserUid)) === false && (await room('VERS')).history['1'].winner === bigTeam, 'a correct guess that comes too late changes nothing');
    vWins[bigTeam]++;
  } else if (round === 2) {
    await ageVRound(70);
    check((await as(big.guesserUid, `select expire_round('VERS', 2) ok`)).rows[0].ok === false, 'a versus round is not over at 70 seconds');
    await vGuess(2, small.guesserUid);
    await ageVRound(10);
    check((await as(big.guesserUid, `select expire_round('VERS', 2) ok`)).rows[0].ok === false, "…and waits for a guess that's still being judged");
    await db.query(`update side_clocks set guess_pending_at = null where code = 'VERS'`);
    check((await as(big.guesserUid, `select expire_round('VERS', 2) ok`)).rows[0].ok === true, '…then ends at 75 seconds');
    d = await room('VERS');
    check(d.history['2'].outcome === 'lost-timeout' && d.history['2'].winner === null && d.history['2'].guesserUid === '', 'a round that runs out goes to nobody');
  } else {
    const winner = round % 2 ? smallTeam : bigTeam;
    await vGuess(round, d.sides[winner].guesserUid);
    await vRecord(round, target, true, d.sides[winner].guesserUid);
    vWins[winner]++;
  }
  check((await room('VERS')).status === 'resolution', `versus, round ${round}: the round ends`);
  await as(HOST, `select advance_round('VERS', $1)`, [round]);
}
d = await room('VERS');
const tally = Object.values(d.history).reduce((m, h) => (h.winner ? ((m[h.winner] = (m[h.winner] ?? 0) + 1), m) : m), {});
check(d.status === 'gameover' && Object.keys(d.history).length === 6, 'the versus game ends after 6 rounds');
check(tally.red === (vWins.red || undefined) && tally.blue === (vWins.blue || undefined), `versus: the history adds up (${vWins.red} to ${vWins.blue})`);
check(
  Object.entries(vGuessed).every(([u, n]) => n === (d.sides[bigTeam].order.includes(u) ? 2 : 3)) && Object.keys(vGuessed).length === 5,
  'versus: on a team of 3 everyone guesses twice, on a team of 2 three times',
);

await as(P2, `select reset_room_to_lobby('VERS')`);
d = await room('VERS');
check(d.status === 'lobby' && d.versus === true && !('sides' in d) && Object.values(d.players).every((pl) => pl.team), 'Play Again keeps versus and the teams');
await as(HOST, `select set_versus('VERS', false)`);
await as(HOST, `select start_game('VERS', true)`);
d = await room('VERS');
check(d.mode === 'team' && d.maxRounds === 10 && !d.sides, 'with versus off the room plays a normal game');
const knower = d.activeKnowerUid;
check((await as(knower, `select target_word from round_secrets where code = 'VERS' and round = 1`)).rows.length === 1, '…whose Knowers can read the word');
check((await as(knower, `select submit_word('VERS', 1, 0, 'zorp') i`)).rows[0].i === 1, '…and add words as usual');
await as(HOST, `select end_game('VERS')`);
for (const u of Object.keys(d.players)) await as(u, `select leave_room('VERS', $1)`, [u]);

// --- Data retention (migration 008) -------------------------------------------------------
// --- Picking categories (migration 027) -----------------------------------------------------
const PICK = ['Animals', 'Music', 'Nature'];
const deckCats = async (code) =>
  (await db.query(`select words from game_decks where code = $1`, [code])).rows[0].words.map((w) => w.category);
await as(HOST, `select create_room('CATS', $1)`, [player(HOST)]);
for (const u of [P2, P3]) await as(u, `select join_room('CATS', $1)`, [player(u)]);
check(await fails(P2, `select set_categories('CATS', $1)`, [PICK]), 'only the host picks categories');
check((await fails2(HOST, `select set_categories('CATS', $1)`, [['Animals', 'Music']])).includes('at least 3'), 'at least 3 categories stay on');
check((await fails2(HOST, `select set_categories('CATS', $1)`, [[...PICK, 'Spaceships']])).includes('unknown category'), 'an unknown category is turned down');
await as(HOST, `select set_categories('CATS', $1)`, [['Nature', 'Animals', 'Music', 'Music']]);
check((await room('CATS')).categories?.join() === PICK.join(), 'the pick is stored on the room, sorted, without repeats');
await as(HOST, `select start_game('CATS', true)`);
check((await deckCats('CATS')).every((c) => PICK.includes(c)), "the deck draws only from the room's categories");
check(await fails(HOST, `select set_categories('CATS', null)`), 'categories cannot change once the game has started');
await as(HOST, `select end_game('CATS')`);
await as(HOST, `select reset_room_to_lobby('CATS')`);
check((await room('CATS')).categories?.join() === PICK.join(), 'a rematch keeps the pick');
await as(HOST, `select set_categories('CATS', null)`);
check(!('categories' in (await room('CATS'))), 'null puts every category back');
const ALL = (await db.query(`select array_agg(distinct category) a from words`)).rows[0].a;
await as(HOST, `select set_categories('CATS', $1)`, [PICK]);
await as(HOST, `select set_categories('CATS', $1)`, [ALL]);
check(!('categories' in (await room('CATS'))), '…and so does picking every one');
for (const u of [P2, P3, HOST]) await as(u, `select leave_room('CATS', $1)`, [u]);
await as(HOST, `select create_room('CATP', $1)`, [player(HOST)]);
await as(HOST, `select set_room_public('CATP', true)`);
check((await fails2(HOST, `select set_categories('CATP', $1)`, [PICK])).includes('every category'), 'online rooms play every category');
await as(HOST, `select leave_room('CATP', $1)`, [HOST]);
const narrow = (await db.query(`select _draw_deck(null, 10, $1) d`, [PICK])).rows[0].d;
check(narrow.length === 10 && tiers(narrow) === 'eeeemmmhhh' && narrow.every((w) => PICK.includes(w.category)), 'a 3-category deck keeps its Easy/Medium/Hard mix');
const tools = (await db.query(`select _draw_deck(null, 30, array['Tools & Gadgets']) d`)).rows[0].d;
check(tools.length === 30 && tools.filter((w) => w.category === 'Tools & Gadgets').length === 28, 'a category that runs out is topped up from others rather than a short deck');

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

// --- Table grants (migration 030) ----------------------------------------------------
const rejects = async (run) => { try { await run(); return false; } catch { return true; } };
check((await as(P2, `select count(*)::int n from rooms`)).rows[0].n >= 0, 'players can read rooms (RLS picks the rows)');
check(await rejects(() => as(P2, `truncate rooms`)), 'players cannot truncate rooms');
check(await rejects(() => as(P2, `select count(*) from words`)), 'players cannot read the word list directly');
check(await rejects(() => asAnon(`select count(*) from rooms`)), 'visitors who are not signed in cannot read rooms');
check(await rejects(() => asAnon(`select _used_word_memory()`)), 'visitors cannot call the settings helpers');
check((await as(null, `select count(*)::int n from round_secrets`)).rows[0].n >= 0, 'the service role reads round secrets');

console.log(failures ? `\n${failures} failed, ${passed} passed` : `\nall ${passed} checks passed`);
process.exit(failures ? 1 : 0);
