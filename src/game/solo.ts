// Solo mode: the app gives the clues, one word at a time from vague to giveaway, and the
// player guesses. The fewer clues it takes, the more the word scores. Everything runs on the
// device: the ladders ship with the app (soloLadders.ts), so there's no room and no server.
import { SOLO_LADDERS } from './soloLadders';

export interface SoloLadder {
  id: string;
  word: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Eight one-word clues, most vague first. */
  clues: string[];
  /** Other spellings and names that also count (harbour, hippo). */
  answers: string[];
}

/** Whether `pathname` is the solo screen, which never needs to sign in. */
export function isSoloPath(pathname: string): boolean {
  return pathname.startsWith('/game/solo');
}

/** Clues in every ladder. */
export const SOLO_CLUES = 8;
/** A new clue appears this often unless the player asks for one sooner. */
export const SOLO_CLUE_SECONDS = 7;
/** After the last clue, how long they have left to get it. */
export const SOLO_LAST_CHANCE_SECONDS = 10;
/** How many rounds (words) a run can have: the player picks before starting. */
export const SOLO_RUN_LENGTHS = [5, 10] as const;
export type SoloRunLength = (typeof SOLO_RUN_LENGTHS)[number];
/** Each run's words by difficulty, played easiest first. */
const SOLO_RUN_MIX: Record<SoloRunLength, Record<SoloLadder['difficulty'], number>> = {
  5: { easy: 2, medium: 2, hard: 1 },
  10: { easy: 3, medium: 4, hard: 3 },
};
/** How many recently played words a new run steers clear of. */
export const SOLO_RECENT_LIMIT = 120;

/** A word got by this clue scores in full: the first clues are too vague to guess from alone,
 * so a perfect run means every word by clue 3, not lucky guesses on clue 1. */
export const SOLO_FULL_POINTS_BY = 3;
/** Points for a word got by SOLO_FULL_POINTS_BY. */
export const SOLO_MAX_POINTS = 5;
/** Stars for a word got by each of these clues: 3 by clue 3, 2 by clue 5, 1 by the last. */
const SOLO_STARS_BY = [SOLO_FULL_POINTS_BY, 5, SOLO_CLUES];
export const SOLO_MAX_STARS = SOLO_STARS_BY.length;

/** Points for getting it on `cluesShown`: 5 up to clue 3, then 4, 3, 2, and 1 on clues 7 and 8. */
export function soloPoints(cluesShown: number): number {
  return Math.max(1, SOLO_MAX_POINTS - Math.max(0, cluesShown - SOLO_FULL_POINTS_BY));
}

/** Stars for a word got on `cluesUsed`, or 0 if they didn't get it. */
export function soloStars(cluesUsed: number | null): number {
  if (!cluesUsed) return 0;
  return SOLO_STARS_BY.filter((by) => cluesUsed <= by).length;
}

/** The most a run of `length` rounds can score. */
export function soloMaxScore(length: SoloRunLength): number {
  return length * SOLO_MAX_POINTS;
}

/** A run's score as a whole percentage of the most it could score, so 5 and 10 rounds compare. */
export function soloPercent(score: number, length: SoloRunLength): number {
  return Math.round((score / soloMaxScore(length)) * 100);
}

function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const LEVEL_RANK = { easy: 0, medium: 1, hard: 2 } as const;

/** Orders by the first entry that differs. */
function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * A new run of `length` words (10: 3 Easy, 4 Medium, 3 Hard; 5: 2, 2, 1), easiest first.
 * Each word is picked, in order of importance: from `categories` (when given), at the
 * round's difficulty or else the nearest one, a different category from the word before,
 * not one of the `recent` words, then at random. As the server's _draw_deck() does
 * (migration 027): falling back a difficulty, or outside the categories, beats a short run.
 */
export function drawSoloRun(
  length: SoloRunLength,
  recent: readonly string[] = [],
  categories?: readonly string[] | null,
): SoloLadder[] {
  const mix = SOLO_RUN_MIX[length];
  const avoid = new Set(recent);
  const run: SoloLadder[] = [];
  const used = new Set<string>();
  for (const level of ['easy', 'medium', 'hard'] as const) {
    for (let n = 0; n < mix[level]; n++) {
      const last = run[run.length - 1]?.category;
      const key = (l: SoloLadder) => [
        categories?.length && !categories.includes(l.category) ? 1 : 0,
        Math.abs(LEVEL_RANK[l.difficulty] - LEVEL_RANK[level]),
        l.category === last ? 1 : 0,
        avoid.has(l.id) ? 1 : 0,
      ];
      // Shuffled first, and the sort is stable, so ties fall at random.
      const [pick] = shuffle(SOLO_LADDERS.filter((l) => !used.has(l.id)))
        .map((l) => ({ l, k: key(l) }))
        .sort((a, b) => compareKeys(a.k, b.k))
        .map(({ l }) => l);
      run.push(pick);
      used.add(pick.id);
    }
  }
  return run;
}

// Guess matching mirrors supabase/functions/_shared/guessMatch.ts, minus the AI judge for
// synonyms and misspellings: solo works offline, so the variants list stands in for it.

const LEADING_ARTICLE = /^(a|an|the)\s+/;

/** Lowercase, strip accents and articles, and drop spaces, hyphens and punctuation. */
function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(LEADING_ARTICLE, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Every plausible singular stem of a word (berries → berry, boxes → box, houses → house). */
function stems(s: string): Set<string> {
  const out = new Set([s]);
  const add = (stem: string) => { if (stem.length >= 3) out.add(stem); };
  if (s.endsWith('ies')) add(s.slice(0, -3) + 'y');
  if (s.endsWith('es')) add(s.slice(0, -2));
  if (s.endsWith('s') && !s.endsWith('ss')) add(s.slice(0, -1));
  return out;
}

function matches(guess: string, target: string): boolean {
  const g = normalize(guess);
  const t = normalize(target);
  if (g.length === 0) return false;
  if (g === t) return true;
  const targetStems = stems(t);
  return [...stems(g)].some((stem) => targetStems.has(stem));
}

/** True for "Lighthouse", "light house", "the lighthouse", "lighthouses", and listed variants. */
export function isSoloAnswer(guess: string, ladder: SoloLadder): boolean {
  return [ladder.word, ...ladder.answers].some((answer) => matches(guess, answer));
}
