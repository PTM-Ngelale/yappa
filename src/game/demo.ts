// The spec's lighthouse example (GAMEPLAY_REDESIGN.md, section 3), shown on How to Play and
// played out by the demo: Tomi (coral) and Ade (green) describe, Kemi guesses.
import type { FeedEntry } from '../supabase/room';
import type { RoomPlayer } from '../store/gameStore';

export const EXAMPLE_WORD = 'Lighthouse';
export const EXAMPLE_CATEGORY = 'Places';

export const EXAMPLE_PLAYERS: Record<string, RoomPlayer> = {
  k: { uid: 'k', name: 'Kemi', avatarColor: '#3B5BFF', role: 'guesser', lastSeenAt: 0 },
  t: { uid: 't', name: 'Tomi', avatarColor: '#FF5B4A', role: 'knower', lastSeenAt: 0 },
  a: { uid: 'a', name: 'Ade', avatarColor: '#2E9E6B', role: 'knower', lastSeenAt: 0 },
};

export const EXAMPLE_FEED: FeedEntry[] = [
  { kind: 'word', text: 'Tall', by: 't' },
  { kind: 'word', text: 'thing', by: 'a' },
  { kind: 'word', text: 'near', by: 't' },
  { kind: 'word', text: 'rocks', by: 'a' },
  { kind: 'guess', text: 'cliff', by: 'k', correct: false },
  { kind: 'word', text: 'no', by: 't' },
  { kind: 'word', text: 'it', by: 'a' },
  { kind: 'word', text: 'spins', by: 't' },
  { kind: 'guess', text: 'lighthouse', by: 'k', correct: true },
];
