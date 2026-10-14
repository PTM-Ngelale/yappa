// First-game tips (GAMEPLAY_REDESIGN.md, section 8): one per round, only during a device's
// first game, each shown once.

export type TipId = 'knower-1' | 'guesser-1' | 'knower-2';

export const TIPS: Record<TipId, string> = {
  'knower-1': 'Small words like “the” and “is” count too. Use them to build a sentence.',
  'guesser-1': 'Wrong guesses are fine. They help your Knowers steer.',
  'knower-2': 'Stuck? React to the guess. “no”, “bigger”, “close” all count.',
};

/** This round's tip for a player in `role`, given the tips already shown; null for none. */
export function pickTip(role: 'knower' | 'guesser', seen: readonly TipId[]): TipId | null {
  if (role === 'guesser') return seen.includes('guesser-1') ? null : 'guesser-1';
  if (!seen.includes('knower-1')) return 'knower-1';
  return seen.includes('knower-2') ? null : 'knower-2';
}
