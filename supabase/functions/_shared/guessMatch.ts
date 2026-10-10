/**
 * Cheap deterministic guess matching — catches formatting differences so most correct
 * guesses skip the AI call. Anything this rejects goes to the AI judge in validate-guess,
 * which handles synonyms and misspellings. Lives server-side because the Guesser's client
 * never knows the target word.
 */

const LEADING_ARTICLE = /^(a|an|the)\s+/;

/** Lowercase, strip accents/articles, and drop spaces, hyphens and punctuation. */
function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(LEADING_ARTICLE, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Every plausible singular stem of a word. English plurals are ambiguous ("houses" drops -s,
 * "buses" drops -es), so rather than guess one rule we keep all candidates and compare sets.
 */
function stems(s: string): Set<string> {
  const out = new Set([s]);
  const add = (stem: string) => { if (stem.length >= 3) out.add(stem); };
  if (s.endsWith('ies')) add(s.slice(0, -3) + 'y'); // berries → berry
  if (s.endsWith('es')) add(s.slice(0, -2)); // boxes → box
  if (s.endsWith('s') && !s.endsWith('ss')) add(s.slice(0, -1)); // houses → house
  return out;
}

/** True for "Lighthouse" vs "light house", "light-house", "the lighthouse", "lighthouses". */
export function isLocalMatch(guess: string, target: string): boolean {
  const g = normalize(guess);
  const t = normalize(target);
  if (g.length === 0) return false;
  if (g === t) return true;
  const targetStems = stems(t);
  return [...stems(g)].some((stem) => targetStems.has(stem));
}
