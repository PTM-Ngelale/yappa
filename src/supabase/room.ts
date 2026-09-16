import { supabase } from './client';
import type { RoomPlayer } from '../store/gameStore';

export const MAX_ROUNDS = 9;

export type RoundOutcome = 'won' | 'lost-guess' | 'lost-timeout';

export interface RoundHistoryEntry {
  round: number;
  category: string;
  targetWord: string;
  chain: string[];
  guesserUid: string;
  outcome: RoundOutcome;
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
  targetWord: string;
  category: string;
  secondsRemaining: number;
  activeKnowerUid: string;
  guesserUid: string;
  players: Record<string, RoomPlayer>;
  typing?: Record<string, boolean> | null;
  /** AI link-validation results for the current round's chain, keyed by chain index — see checkLink(). */
  linkChecks?: Record<number, 'valid' | 'invalid'> | null;
  /** The full 9-word sequence for this game, drawn once at game start (see generateGame()). */
  gameWords: { word: string; category: string }[] | null;
  /** Keyed by round number (string) — one entry per completed round. */
  history?: Record<string, RoundHistoryEntry> | null;
  createdAt: number;
}

export interface PatchOp {
  path: string[];
  value: unknown;
}

/**
 * Applies one or more path-scoped patches to a room's JSON state in a single round-trip —
 * the Postgres equivalent of Firebase's `update(ref, { 'a/b/c': value })`.
 */
export async function patchRoom(code: string, ops: PatchOp[]): Promise<void> {
  const { error } = await supabase.rpc('patch_room', { p_code: code, p_ops: ops });
  if (error) throw error;
}

export async function createRoom(code: string, hostPlayer: RoomPlayer): Promise<void> {
  const data: RoomData = {
    hostUid: hostPlayer.uid,
    status: 'lobby',
    round: 1,
    maxRounds: MAX_ROUNDS,
    playerOrder: null,
    chain: null,
    targetWord: '',
    category: '',
    secondsRemaining: 30,
    activeKnowerUid: '',
    guesserUid: '',
    players: { [hostPlayer.uid]: hostPlayer },
    linkChecks: {},
    gameWords: null,
    history: {},
    createdAt: Date.now(),
  };
  const { error } = await supabase.from('rooms').insert({ code, data });
  if (error) throw error;
}

/**
 * Adds `player` to the room via the join_room() SECURITY DEFINER RPC (see
 * migration 002) rather than the generic patchRoom() — the joiner isn't a
 * room member yet, so the membership-gated update RLS policy would otherwise
 * reject a plain patch. The RPC also rejects a full room, an already-started
 * game, or a mismatched uid, surfacing as a real thrown error instead of a
 * silent no-op.
 */
export async function joinRoom(code: string, player: RoomPlayer): Promise<void> {
  const { error } = await supabase.rpc('join_room', { p_code: code, p_player: player });
  if (error) throw error;
}

/**
 * Removes a player from the room (e.g. leaving the lobby or backing out from
 * Game End) via the leave_room() SECURITY DEFINER RPC (see migration 003) —
 * the mirror image of joinRoom()'s join_room(). Removing the caller's own key
 * from `players` via the generic patchRoom() path used to fail the update
 * policy's WITH CHECK; this dedicated RPC does the read-and-remove atomically
 * server-side instead.
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

export async function updateRoomField(
  code: string,
  updates: Partial<RoomData>
): Promise<void> {
  await patchRoom(
    code,
    Object.entries(updates).map(([key, value]) => ({ path: [key], value: value ?? null }))
  );
}

/** Resets a finished room back to the lobby so the same code can be replayed. */
export async function resetRoomToLobby(code: string): Promise<void> {
  await updateRoomField(code, {
    status: 'lobby',
    round: 1,
    playerOrder: null,
    chain: null,
    targetWord: '',
    category: '',
    secondsRemaining: 30,
    activeKnowerUid: '',
    guesserUid: '',
    typing: {},
    linkChecks: {},
    gameWords: null,
    history: {},
  });
}
