// The five word categories, as the server names them (the `words` table), with their emoji.

const EMOJI: Record<string, string> = {
  Objects: '🧸',
  Animals: '🐾',
  Places: '📍',
  'Food & Drink': '🍲',
  Sports: '⚽',
};

/** "🐾 Animals". A category the app doesn't know yet shows without an emoji. */
export function categoryLabel(category: string): string {
  const emoji = EMOJI[category];
  return emoji ? `${emoji} ${category}` : category;
}
