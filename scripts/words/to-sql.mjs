// Turns the reviewed scripts/words/review/words.review.json into the next migration, which
// sets each word's category, difficulty, off-limits words, components and variants. Run it
// only after a person has checked the file: it is what ships to players.
//
// Run: node scripts/words/to-sql.mjs
//
// Refuses (and lists why) if any entry is malformed or still has a "check" note: delete the
// note once you've fixed or accepted that word.
//
// Entries with "status": "cut" are deleted from the word list; entries with "isNew": true are
// added (they need a meaning). A "meaning" on any entry replaces the word's meaning.
import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS_DIR, REVIEW_FILE, readWordList, slug } from './shared.mjs';

const LEVELS = ['easy', 'medium', 'hard'];
/** Off-limits words per difficulty: the list is the main difficulty dial. */
const OFF_LIMITS = { easy: 3, medium: 4, hard: 5 };
const ONE_WORD = /^\p{L}+(['’-]\p{L}+)*$/u;
const PHRASE = /^\p{L}+([ '’-]\p{L}+)*$/u;
// Mirrors src/game/categories.ts.
const CATEGORIES = ['Animals', 'Food & Drink', 'Sports', 'Music', 'Around the House', 'Tools & Gadgets', 'Buildings', 'Nature'];

if (!fs.existsSync(REVIEW_FILE)) {
  console.error(`No review file at ${path.relative(process.cwd(), REVIEW_FILE)}.`);
  process.exit(1);
}
const reviewed = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
const words = new Map(readWordList().map((w) => [slug(w.word), w]));

const problems = [];
const seen = new Set();
for (const e of reviewed) {
  const where = e.word ?? e.id ?? '(no word)';
  if (seen.has(e.id)) problems.push(`${where}: listed twice`);
  seen.add(e.id);
  if (e.isNew) {
    if (words.has(e.id)) { problems.push(`${where}: marked new but already in the word list`); continue; }
    if (e.id !== slug(e.word ?? '')) problems.push(`${where}: id should be "${slug(e.word ?? '')}"`);
  } else if (!words.has(e.id) && e.status === 'cut') {
    continue; // cut by an earlier migration: already gone
  } else if (!words.has(e.id)) { problems.push(`${where}: id "${e.id}" is not in the word list`); continue; }
  if (e.status === 'cut') { if (e.isNew) problems.push(`${where}: a new word can't also be cut`); continue; }
  if (e.check) problems.push(`${where}: still has a check note ("${e.check}")`);
  if (!CATEGORIES.includes(e.category)) problems.push(`${where}: category must be one of ${CATEGORIES.join(', ')}`);
  if (!LEVELS.includes(e.difficulty)) problems.push(`${where}: difficulty must be easy, medium or hard`);
  if (e.isNew && !e.meaning?.trim()) problems.push(`${where}: a new word needs a meaning`);
  const off = e.forbidden ?? [];
  if (LEVELS.includes(e.difficulty) && off.length !== OFF_LIMITS[e.difficulty]) {
    problems.push(`${where}: ${e.difficulty} words have ${OFF_LIMITS[e.difficulty]} off-limits words, not ${off.length}`);
  }
  for (const f of off) {
    if (!ONE_WORD.test(f)) problems.push(`${where}: off-limits "${f}" is not one word`);
    if (f.toLowerCase() === e.word.toLowerCase()) problems.push(`${where}: the word itself is on its off-limits list`);
  }
  if (new Set(off.map((f) => f.toLowerCase())).size !== off.length) problems.push(`${where}: off-limits list repeats a word`);
  for (const c of e.components ?? []) if (!ONE_WORD.test(c)) problems.push(`${where}: component "${c}" is not one word`);
  for (const v of e.variants ?? []) if (!PHRASE.test(v)) problems.push(`${where}: variant "${v}" has characters other than letters`);
}

if (problems.length) {
  console.error(`Not written: ${problems.length} thing(s) to fix in the review file.\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const missing = [...words.keys()].filter((id) => !seen.has(id));
const cut = reviewed.filter((e) => e.status === 'cut' && words.has(e.id));
const added = reviewed.filter((e) => e.isNew && e.status !== 'cut');
const kept = reviewed.filter((e) => e.status !== 'cut');
const tiers = { easy: 0, medium: 0, hard: 0 };
for (const id of missing) tiers[words.get(id).difficulty]++;
for (const e of kept) tiers[e.difficulty]++;
const short = Object.entries(tiers).filter(([, n]) => n < 30);
const byCategory = {};
for (const e of kept) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;

const q = (s) => `'${s.toLowerCase().replace(/'/g, "''")}'`;
const arr = (list = []) => (list.length ? `array[${list.map(q).join(', ')}]` : `'{}'::text[]`);
const text = (s) => `'${s.replace(/'/g, "''")}'`;
const lines = [
  'alter table words add column if not exists forbidden text[] not null default \'{}\';',
  '',
  ...(cut.length ? [`delete from words where id in (${cut.map((e) => `'${e.id}'`).join(', ')});`, ''] : []),
  ...added.map((e) =>
    `insert into words (id, word, category, difficulty) values ('${e.id}', ${text(e.word)}, ${text(e.category)}, '${e.difficulty}') on conflict (word) do nothing;`),
  ...(added.length ? [''] : []),
  ...kept.map((e) =>
    `update words set category = ${text(e.category)}, difficulty = '${e.difficulty}', forbidden = ${arr(e.forbidden)}, ` +
    `components = ${arr(e.components)}, variants = ${arr(e.variants)}` +
    (e.meaning?.trim() ? `, meaning = ${text(e.meaning.trim())}` : '') +
    ` where id = '${e.id}';`),
];

const last = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_/.test(f)).sort().at(-1);
const next = String(Number(last.slice(0, 3)) + 1).padStart(3, '0');
const file = path.join(MIGRATIONS_DIR, `${next}_word_cards.sql`);
fs.writeFileSync(
  file,
  `-- Yappa: reviewed word cards (category, difficulty, off-limits words, components, variants).\n` +
    `-- Generated by scripts/words/to-sql.mjs from the hand-reviewed words.review.json.\n` +
    `-- Pool after this: ${tiers.easy} Easy, ${tiers.medium} Medium, ${tiers.hard} Hard.\n` +
    `-- By category: ${Object.entries(byCategory).map(([c, n]) => `${c} ${n}`).join(', ')}.\n\n` +
    lines.join('\n') + '\n',
);

console.log(`Wrote ${path.relative(process.cwd(), file)}: ${kept.length} words (${added.length} new), ${cut.length} cut.`);
console.log(`Pool: ${tiers.easy} Easy, ${tiers.medium} Medium, ${tiers.hard} Hard.`);
if (missing.length) {
  const names = missing.length > 12 ? `${missing.slice(0, 12).join(', ')} and ${missing.length - 12} more` : missing.join(', ');
  console.warn(`${missing.length} word(s) not in the review file keep their current card and no off-limits words: ${names}`);
}
if (short.length) console.warn(`Few words in ${short.map(([t, n]) => `${t} (${n})`).join(', ')}: Play Again will repeat words sooner.`);
