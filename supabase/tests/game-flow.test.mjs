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
const fails = async (uid, sql, params) => { try { await as(uid, sql, params); return false; } catch { return true; } };
const room = async (code = 'ABCD') => (await db.query(`select data from rooms where code = $1`, [code])).rows[0]?.data;
const secretFor = async (round) =>
  (await db.query(`select target_word from round_secrets where code = 'ABCD' and round = $1`, [round])).rows[0].target_word;
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

// --- Play 9 rounds -------------------------------------------------------------------
let wins = 0;
for (let round = 1; round <= 9; round++) {
  d = await room();
  const target = await secretFor(round);
  check(d.status === 'playing' && d.round === round && !JSON.stringify(d).includes(`"${target}"`), `round ${round}: playing, target absent from room data`);
  check((await as(d.guesserUid, `select * from round_secrets where code = 'ABCD' and round = $1`, [round])).rows.length === 0, `round ${round}: the Guesser cannot read the target`);
  const first = d.activeKnowerUid;
  const second = Object.keys(d.players).find((u) => u !== first && u !== d.guesserUid);
  for (const k of [first, second]) {
    check((await as(k, `select target_word from round_secrets where code = 'ABCD' and round = $1`, [round])).rows[0]?.target_word === target, `round ${round}: a Knower can read the target`);
  }

  if (round === 1) {
    check(await fails(second, `select submit_word('ABCD', 1, 'sun')`), 'the waiting Knower cannot submit');
    check(await fails(d.guesserUid, `select submit_word('ABCD', 1, 'sun')`), 'the Guesser cannot submit words');
    check(await fails(first, `select submit_word('ABCD', 1, $1)`, [target.toLowerCase() + 's']), 'a Knower cannot submit the target (or its plural)');
    check(await fails(first, `select submit_word('ABCD', 1, 'two words')`), 'multi-word submissions are rejected');
    check(await fails(first, `select submit_word('ABCD', 2, 'sun')`), 'wrong-round submissions are rejected');
    await as(first, `select set_typing('ABCD', true)`);
    await as(second, `select set_typing('ABCD', true)`);
    const t = (await room()).typing;
    check(t[first] === true && !(second in t), 'only the active Knower can set typing');
    await as(HOST, `select tick_timer('ABCD', 1)`);
    await as(HOST, `select tick_timer('ABCD', 1)`);
    check((await room()).secondsRemaining === 28, 'the host tick decrements the timer');
    await as(P2, `select tick_timer('ABCD', 1)`).catch(() => {});
    check((await room()).secondsRemaining === 28, 'a non-host cannot tick the timer');
    check(await fails(first, `select mark_guess_pending('ABCD', 1)`), 'only the Guesser can mark a guess pending');
  }

  const i0 = (await as(first, `select submit_word('ABCD', $1, 'sun') i`, [round])).rows[0].i;
  d = await room();
  check(i0 === 0 && d.activeKnowerUid === second && d.secondsRemaining === 30 && !(first in (d.typing ?? {})), `round ${round}: word lands, turn passes, timer resets`);
  check(await fails(first, `select submit_word('ABCD', $1, 'again')`, [round]), `round ${round}: no going twice in a row`);
  const i1 = (await as(second, `select submit_word('ABCD', $1, 'light') i`, [round])).rows[0].i;
  check(i1 === 1 && JSON.stringify((await room()).chain) === '["sun","light"]', `round ${round}: chain appended server-side`);

  await as(null, `select record_link_check('ABCD', $1, 1, 'light', false)`, [round]);
  await as(null, `select record_link_check('ABCD', $1, 1, 'stale', true)`, [round]);
  check((await room()).linkChecks['1'] === 'invalid', `round ${round}: link verdict recorded, stale verdict ignored`);

  if (round % 3 === 0) {
    await as(HOST, `select resolve_round_timeout('ABCD', $1)`, [round]);
  } else {
    await as(d.guesserUid, `select mark_guess_pending('ABCD', $1)`, [round]);
    check((await room()).guessPending === true, `round ${round}: guess marked pending`);
    const correct = round % 3 === 1;
    const r = await as(null, `select resolve_round_guess('ABCD', $1, $2, $3) ok`, [round, correct ? target : 'wrong', correct]);
    check(r.rows[0].ok === true, `round ${round}: guess recorded`);
    if (correct) wins++;
    const again = await as(null, `select resolve_round_guess('ABCD', $1, 'late', true) ok`, [round]);
    check(again.rows[0].ok === false, `round ${round}: a second resolution is a no-op`);
  }
  const h = (await room()).history[String(round)];
  check(h.targetWord === target && JSON.stringify(h.chain) === '["sun","light"]' && h.linkChecks['1'] === 'invalid', `round ${round}: history has target, chain and link checks`);
  check(round % 3 === 0 ? h.outcome === 'lost-timeout' && h.guess === null : h.guess === (round % 3 === 1 ? target : 'wrong'), `round ${round}: outcome and guess recorded`);
  check(await fails(first, `select submit_word('ABCD', $1, 'late')`, [round]), `round ${round}: no words after resolution`);
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
check(await fails(OUTSIDER, `select end_game('ABCD')`), 'a non-member cannot end a game');

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
await as(P2, `select end_game('ABCD')`);
check((await room()).status === 'gameover', 'any player can end the game (disconnect overlay)');

for (const u of [P2, P3, OUTSIDER]) await as(u, `select leave_room('ABCD', $1)`, [u]);
check((await room()) === undefined, 'the last player out deletes the room');
check((await db.query(`select count(*)::int n from round_secrets where code = 'ABCD'`)).rows[0].n === 0, '…along with its round secrets');

console.log(failures ? `\n${failures} failed, ${passed} passed` : `\nall ${passed} checks passed`);
process.exit(failures ? 1 : 0);
