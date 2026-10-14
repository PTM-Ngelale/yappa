// Shared by the word scripts: where the word list and the review file live.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATIONS_DIR = path.join(root, 'supabase', 'migrations');
export const REVIEW_FILE = path.join(root, 'scripts', 'words', 'review', 'words.review.json');

/** Matches the id migration 014 gives each word: lowercase, runs of other characters as "-". */
export const slug = (word) => word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The word list as seeded by migration 004: [{ word, category, difficulty }]. */
export function readWordList() {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '004_hidden_target.sql'), 'utf8');
  const seed = sql.slice(sql.indexOf('insert into words'));
  return [...seed.matchAll(/\('((?:[^']|'')+)', '([^']+)', '(easy|medium|hard)'\)/g)].map((m) => ({
    word: m[1].replace(/''/g, "'"),
    category: m[2],
    difficulty: m[3],
  }));
}
