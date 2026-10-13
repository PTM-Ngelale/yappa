// Share cards (migration 012), read on the server for the /c/[id] page and its image.
import { bestRound, verdict, type SummaryRound } from '../../src/lib/gameSummary';

export type CardRound = SummaryRound & { category: string };
export type Card = { id: string; maxRounds: number; rounds: CardRound[] };

/** Card ids are 8 letters and digits (create_share_card). */
const CARD_ID = /^[A-Za-z0-9]{8}$/;

/** The card, or null if there's no such card. Cards never change, so they're cached. */
export async function getCard(id: string): Promise<Card | null> {
  if (!CARD_ID.test(id)) return null;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/rest/v1/rpc/get_share_card`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: id }),
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const card = (await res.json()) as Card | null;
  return card && Array.isArray(card.rounds) ? card : null;
}

/** What a card shows: score, verdict and the round to show off. */
export function summarise(card: Card) {
  const won = card.rounds.filter((r) => r.outcome === 'won').length;
  const played = card.rounds.length;
  const finished = played >= card.maxRounds;
  return {
    won,
    played,
    finished,
    // An unfinished game is scored out of the rounds actually played.
    outOf: finished ? card.maxRounds : played,
    verdict: verdict(won, finished ? card.maxRounds : played),
    best: bestRound(card.rounds),
  };
}

/** The site's public address, for absolute links in previews. */
export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://yappa-three.vercel.app';
