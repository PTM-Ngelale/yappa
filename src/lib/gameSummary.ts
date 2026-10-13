// How a finished game reads — shared by Game End and the web share card (web/app/(card)).
// Plain TypeScript, no React Native, so the web server can import it too.

/** The one-line verdict under the final score. */
export function verdict(won: number, max: number): string {
  const share = won / max;
  if (won === max) return 'Perfect game!';
  if (share >= 0.75) return 'Brilliant teamwork';
  if (share >= 0.5) return 'Solid teamwork';
  if (share >= 0.25) return 'Good effort';
  return 'Tough crowd';
}

export type SummaryRound = {
  round: number;
  targetWord: string;
  chain: string[] | null;
  outcome: string;
};

/**
 * The round to show off: the won round with the shortest chain (the slickest link to the
 * word), earliest first on a tie. Null if no round was won.
 */
export function bestRound<T extends SummaryRound>(rounds: T[]): T | null {
  let best: T | null = null;
  for (const r of rounds) {
    if (r.outcome !== 'won') continue;
    if (!best || (r.chain?.length ?? 0) < (best.chain?.length ?? 0)) best = r;
  }
  return best;
}
