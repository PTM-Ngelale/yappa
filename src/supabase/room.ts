import { supabase } from './client';
import type { RoomPlayer } from '../store/gameStore';

export type RoundOutcome = 'won' | 'lost-guess' | 'lost-timeout';

export interface RoundHistoryEntry {
  round: number;
  category: string;
  targetWord: string;
  chain: string[];
  guesserUid: string;
  outcome: RoundOutcome;
  /** What the Guesser typed — null when the round timed out. Older rounds may lack it. */
  guess?: string | null;
  /** AI link-validation results, keyed by chain index — see checkLink(). Advisory only, never affects score. */
  linkChecks?: Record<number, 'valid' | 'invalid'>;
}

export interface RoomData {
  hostUid: string;
  status: 'lobby' | 'playing' | 'resolution' | 'gameover';
  round: number;
  maxRounds: number;
  /** Fixed player rotation order, shuffled once at game start; drives role assignment every round. */
  playerOrder: string[] | null;
  chain: string[] | null;
  /** Visible to everyone, including the Guesser. The target word itself is in round_secrets. */
  category: string;
  secondsRemaining: number;
  activeKnowerUid: string;
  guesserUid: string;
  players: Record<string, RoomPlayer>;
  typing?: Record<string, boolean> | null;
  /** AI link-validation results for the current round's chain, keyed by chain index — see checkLink(). */
  linkChecks?: Record<number, 'valid' | 'invalid'> | null;
  /**
   * True while the Guesser's locked-in guess is judged (see submitGuess()). The host's
   * timer won't expire the round while this is set, so a guess made at 1s isn't lost to latency.
   */
  guessPending?: boolean | null;
  /** Keyed by round number (string) — one entry per completed round. */
  history?: Record<string, RoundHistoryEntry> | null;
  createdAt: number;
}

// Clients can read rooms but never write them directly — every change goes through a
// narrow server function that checks the caller and the move (see migration 005).

/** Creates the room with the caller as host; the server builds the initial state. */
export async function createRoom(code: string, hostPlayer: RoomPlayer): Promise<void> {
  const { error } = await supabase.rpc('create_room', { p_code: code, p_player: hostPlayer });
  if (error) throw error;
}

/**
 * Adds the caller to the room via join_room() (migrations 002/005). Rejects a full room,
 * an already-started game, or a mismatched uid with a real thrown error.
 */
export async function joinRoom(code: string, player: RoomPlayer): Promise<void> {
  const { error } = await supabase.rpc('join_room', { p_code: code, p_player: player });
  if (error) throw error;
}

/**
 * Removes a player from the room (e.g. leaving the lobby or backing out from
 * Game End) via the leave_room() SECURITY DEFINER RPC (see migration 003) —
 * the mirror image of joinRoom()'s join_room().
 */
export async function leaveRoom(code: string, uid: string): Promise<void> {
  const { error } = await supabase.rpc('leave_room', { p_code: code, p_uid: uid });
  if (error) throw error;
}

export function listenToRoom(
  code: string,
  onData: (data: RoomData | null) => void
): () => void {
  let cancelled = false;

  supabase
    .from('rooms')
    .select('data')
    .eq('code', code)
    .maybeSingle()
    .then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error(error);
        return;
      }
      onData(data ? (data.data as RoomData) : null);
    });

  // Supabase reuses an existing channel object for a topic that's already registered,
  // which throws if we then try to add a postgres_changes listener post-subscribe(). Drop
  // any stale channel for this room first (e.g. a previous screen's listener still mounted).
  const topic = `room:${code}`;
  const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
  if (stale) supabase.removeChannel(stale);

  const channel = supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
      (payload) => {
        const row = payload.new as { data: RoomData } | undefined;
        onData(row ? row.data : null);
      }
    )
    .subscribe();

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}

/** Disconnect overlay's "End game now" (or its countdown expiring) — ends the game for everyone. */
export async function endGame(code: string): Promise<void> {
  const { error } = await supabase.rpc('end_game', { p_code: code });
  if (error) throw error;
}

/** Resets a finished room back to the lobby so the same code can be replayed. */
export async function resetRoomToLobby(code: string): Promise<void> {
  const { error } = await supabase.rpc('reset_room_to_lobby', { p_code: code });
  if (error) throw error;
}
