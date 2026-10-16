// Shared by the word scripts: where the word list and the review file live.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MIGRATIONS_DIR = path.join(root, 'supabase', 'migrations');
export const REVIEW_FILE = path.join(root, 'scripts', 'words', 'review', 'words.review.json');

/** Matches the id migration 014 gives each word: lowercase, runs of other characters as "-". */
export const slug = (word) => word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * The word list as the migrations leave it: seeded by migration 004, plus words later
 * migrations insert, minus words they delete. [{ word, category, difficulty }]
 */
export function readWordList() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
  const list = new Map();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    if (f.startsWith('004_')) {
      const seed = sql.slice(sql.indexOf('insert into words'));
      for (const m of seed.matchAll(/\('((?:[^']|'')+)', '([^']+)', '(easy|medium|hard)'\)/g)) {
        const word = m[1].replace(/''/g, "'");
        list.set(slug(word), { word, category: m[2], difficulty: m[3] });
      }
      continue;
    }
    for (const m of sql.matchAll(/insert into words \(id, word, category, difficulty\) values \('[^']+', '((?:[^']|'')+)', '((?:[^']|'')+)', '(easy|medium|hard)'\)/g)) {
      const word = m[1].replace(/''/g, "'");
      list.set(slug(word), { word, category: m[2].replace(/''/g, "'"), difficulty: m[3] });
    }
    for (const m of sql.matchAll(/delete from words where id in \(([^)]*)\)/g)) {
      for (const id of m[1].matchAll(/'([^']+)'/g)) list.delete(id[1]);
    }
  }
  return [...list.values()];
}
