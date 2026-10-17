// The word categories, as the server names them (the `words` table), with their emoji.
// Migration 023 filed the words into these 8; each is meant to narrow the Guesser's guess.

export const CATEGORIES = [
  'Animals',
  'Food & Drink',
  'Sports',
  'Music',
  'Around the House',
  'Tools & Gadgets',
  'Buildings',
  'Nature',
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
  // Before migration 023 (older games' history).
  Objects: '🧸',
  Places: '📍',
};

/** "🐾 Animals". A category the app doesn't know yet shows without an emoji. */
export function categoryLabel(category: string): string {
  const emoji = EMOJI[category];
  return emoji ? `${emoji} ${category}` : category;
}
