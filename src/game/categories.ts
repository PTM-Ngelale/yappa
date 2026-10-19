// The word categories, as the server names them (the `words` table), with their icons.
// Migration 023 filed the words into the first 8 and migration 028 added 3 more; each is
// meant to narrow the Guesser's guess.
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type React from 'react';

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

export type CategoryIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Material Design icons (bundled in @expo/vector-icons), so they look the same on every phone. */
const ICONS: Record<string, CategoryIconName> = {
  Animals: 'paw',
  'Food & Drink': 'silverware-fork-knife',
  Sports: 'soccer',
  Music: 'music',
  'Around the House': 'sofa',
  'Tools & Gadgets': 'hammer-wrench',
  Buildings: 'office-building',
  Nature: 'pine-tree',
  'Pop Culture': 'popcorn',
  'Fairy Tales': 'castle',
  'Video Games': 'gamepad-variant',
  // Before migration 023 (older games' history).
  Objects: 'cube-outline',
  Places: 'map-marker',
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

/** Categories to mark as new in the picker. Empty this once they're old news. */
export const NEW_CATEGORIES: readonly string[] = ['Pop Culture', 'Fairy Tales', 'Video Games'];

/** The category's icon, or null for one the app doesn't know yet. */
export function categoryIcon(category: string): CategoryIconName | null {
  return ICONS[category] ?? null;
}
