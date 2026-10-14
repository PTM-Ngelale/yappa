// Drafts each word's forbidden list, compound parts, extra variants and difficulty with a
// strong model, into a review file for a person to check by hand (GAMEPLAY_REDESIGN.md,
// section 6). Not part of the app: nothing here reaches players until the reviewed file is
// turned into a migration with scripts/words/to-sql.mjs.
//
// Run:   ANTHROPIC_API_KEY=... node scripts/words/draft.mjs [--limit N] [--model ID]
// Output: scripts/words/review/words.review.json (kept out of git)
//
// Safe to stop and run again: words already in the review file are skipped, so a rerun
// only drafts the rest. Delete an entry (or the file) to draft it again.
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { REVIEW_FILE, readWordList, slug } from './shared.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const limit = Number(flag('--limit') ?? Infinity);
const model = flag('--model') ?? process.env.WORDS_MODEL ?? 'claude-opus-5-5';
const BATCH = 10;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY first.');
  process.exit(1);
}
const anthropic = new Anthropic();

const SYSTEM = `You prepare word cards for Yappa, a party game. Two players (Knowers) describe a secret word to a third (the Guesser) by taking turns adding one word at a time. Each card lists forbidden words the Knowers may not use, which makes the word harder to describe.

For each word, propose:
- difficulty: how hard the word is to describe once its most obvious associations are forbidden. This is NOT about how obscure the word is. "easy": plenty of good clues remain after the forbidden list. "medium": the obvious routes are blocked and players must get creative. "hard": the word is mostly known through a few associations, and those go on the list.
- forbidden: the words a describer would reach for first, the ones that make it too easy. Exactly 3 for easy, 4 for medium, 5 for hard. Single lowercase English words (letters only, apostrophes or hyphens inside allowed). Do not include the word itself, its plural or other forms, or its components (those are blocked separately). Prefer strong, distinct associations over near-duplicates ("tea" and "teas" is one association).
- components: if the word is a compound made of standalone English words, its parts, lowercase (lighthouse: ["light", "house"]; waterpolo: ["water", "polo"]). Otherwise []. Only real words that someone could use to give the answer away.
- variants: other ways to write the same answer beyond regular plurals and endings: alternative spellings (doughnut: "donut"), irregular plurals (mouse: "mice"), spaced or hyphenated forms ("water polo"), common short forms ("telly" for television). Lowercase. [] if none.
- note: one short sentence explaining the difficulty, for the human reviewer.

Example: lighthouse (Places) -> difficulty "medium", forbidden ["beacon", "coast", "ships", "lamp"], components ["light", "house"], variants [], note "Without beacon and ships, players must describe a tall tower by the sea that shines at night."`;

const TOOL = {
  name: 'word_cards',
  description: 'Record the drafted card for every word in the batch.',
  input_schema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            word: { type: 'string', description: 'The word exactly as given.' },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            forbidden: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
            components: { type: 'array', items: { type: 'string' } },
            variants: { type: 'array', items: { type: 'string' } },
            note: { type: 'string' },
          },
          required: ['word', 'difficulty', 'forbidden', 'components', 'variants', 'note'],
        },
      },
    },
    required: ['cards'],
  },
};

const FORBIDDEN_COUNT = { easy: 3, medium: 4, hard: 5 };
const clean = (list) => [...new Set(list.map((w) => w.trim().toLowerCase()).filter(Boolean))];

async function draftBatch(batch) {
  const listing = batch.map((w) => `- ${w.word} (${w.category})`).join('\n');
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: `Draft cards for these ${batch.length} words:\n${listing}` }],
  });
  const call = response.content.find((b) => b.type === 'tool_use');
  const cards = call?.input?.cards ?? [];
  return batch.map((w) => {
    const card = cards.find((c) => c.word?.toLowerCase() === w.word.toLowerCase());
    if (!card) return null;
    const forbidden = clean(card.forbidden);
    const problems = [];
    if (forbidden.length !== FORBIDDEN_COUNT[card.difficulty]) {
      problems.push(`${forbidden.length} forbidden words for ${card.difficulty}`);
    }
    return {
      id: slug(w.word),
      word: w.word,
      category: w.category,
      difficulty: card.difficulty,
      currentDifficulty: w.difficulty,
      forbidden,
      components: clean(card.components),
      variants: clean(card.variants),
      note: card.note,
      ...(problems.length ? { check: problems.join('; ') } : {}),
    };
  });
}

const words = readWordList();
const existing = fs.existsSync(REVIEW_FILE) ? JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8')) : [];
const done = new Set(existing.map((e) => e.id));
const todo = words.filter((w) => !done.has(slug(w.word))).slice(0, limit);
console.log(`${words.length} words, ${done.size} already drafted, drafting ${todo.length} with ${model}.`);

fs.mkdirSync(path.dirname(REVIEW_FILE), { recursive: true });
const order = new Map(words.map((w, i) => [slug(w.word), i]));
const save = () => {
  existing.sort((a, b) => order.get(a.id) - order.get(b.id));
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(existing, null, 2) + '\n');
};

for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  try {
    const cards = await draftBatch(batch);
    cards.forEach((card, j) => {
      if (card) existing.push(card);
      else console.warn(`  no card came back for ${batch[j].word}; run again to retry`);
    });
    save(); // after every batch, so a stopped run keeps its progress
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  } catch (err) {
    console.error(`  batch starting ${batch[0].word} failed: ${err.message}. Run again to retry.`);
  }
}

const flagged = existing.filter((e) => e.check);
const changed = existing.filter((e) => e.difficulty !== e.currentDifficulty);
console.log(`\nWrote ${path.relative(process.cwd(), REVIEW_FILE)}: ${existing.length} words.`);
console.log(`${changed.length} with a new difficulty proposed, ${flagged.length} with a "check" note to look at.`);
