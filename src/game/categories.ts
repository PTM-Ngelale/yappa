// The word categories, as the server names them (the `words` table), with their emoji.
// Migration 023 filed the words into the first 8 and migration 028 added 3 more; each is
// meant to narrow the Guesser's guess.

export const CATEGORIES = [
  'Animals',
  'Food & Drink',
  'Sports',
  'Music',
  'Around the House',
  'Tools & Gadgets',
  'Buildings',
  'Nature',
  // Migration 028.
  'Pop Culture',
  'Fairy Tales',
  'Video Games',
] as const;

const EMOJI: Record<string, string> = {
  Animals: '🐾',
  'Food & Drink': '🍲',
  Sports: '⚽',
  Music: '🎵',
  'Around the House': '🏠',
  'Tools & Gadgets': '🔧',
  Buildings: '🏛️',
  Nature: '🌿',
  'Pop Culture': '🍿',
  'Fairy Tales': '🧚',
  'Video Games': '🎮',
  // Before migration 023 (older games' history).
  Objects: '🧸',
  Places: '📍',
};

/** Categories that must stay on. Mirrors _category_minimum() in migration 027. */
export const MIN_CATEGORIES = 3;

/** The categories a pick leaves on, in the usual order. No pick means all of them. */
export function categoriesOn(pick?: readonly string[] | null): string[] {
  return pick?.length ? CATEGORIES.filter((c) => pick.includes(c)) : [...CATEGORIES];
}

/**
 * The pick after tapping `category`: null for "all of them", or unchanged if switching it off
 * would leave fewer than MIN_CATEGORIES.
 */
export function toggleCategory(pick: readonly string[] | null | undefined, category: string): string[] | null {
  const on = categoriesOn(pick);
  const next = on.includes(category) ? on.filter((c) => c !== category) : categoriesOn([...on, category]);
  if (next.length < MIN_CATEGORIES) return pick ? [...pick] : null;
  return next.length === CATEGORIES.length ? null : next;
}

/** "🐾 Animals". A category the app doesn't know yet shows without an emoji. */
export function categoryLabel(category: string): string {
  const emoji = EMOJI[category];
  return emoji ? `${emoji} ${category}` : category;
}
