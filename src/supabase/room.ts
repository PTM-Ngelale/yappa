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
  /** Open to Play online — strangers can be matched in, and it starts itself when full. */
  isPublic?: boolean;
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
 * an already-started game, or a mismatched uid with a real thrown error. `source` says
 * whether they came by invite link or typed the code — counted in game_stats (migration 011).
 */
export async function joinRoom(code: string, player: RoomPlayer, source: 'link' | 'code'): Promise<void> {
  const { error } = await supabase.rpc('join_room', { p_code: code, p_player: player, p_source: source });
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
  // A read and the live updates race: on a slow connection the read can land after a newer
  // update (e.g. the game starting) and roll the screen back to stale state. If a live
  // update arrived after the read was sent, the read is out of date — drop it.
  let liveUpdates = 0;
  const read = () => {
    const sentAfter = liveUpdates;
    supabase
      .from('rooms')
      .select('data')
      .eq('code', code)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || liveUpdates !== sentAfter) return;
        if (error) {
          console.error(error);
          return;
        }
        onData(data ? (data.data as RoomData) : null);
      });
  };
  read();

  // Supabase reuses an existing channel object for a topic that's already registered,
  // which throws if we then try to add a postgres_changes listener post-subscribe(). Drop
  // any stale channel for this room first (e.g. a previous screen's listener still mounted).
  const topic = `room:${code}`;
  const stale = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
  if (stale) supabase.removeChannel(stale);

  let joined = false;
  const channel = supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
      (payload) => {
        if (cancelled) return;
        liveUpdates += 1;
        const row = payload.new as { data?: RoomData } | undefined;
        onData(row?.data ?? null);
      }
    )
    // Each rejoin after the first (a reconnect, e.g. coming back from the background): read
    // the room again, since updates sent while the socket was down never arrive.
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (joined) read();
      joined = true;
    });

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}

/** "Play online": joins the oldest open public lobby, or opens a new one. Returns its code. */
export async function quickMatch(player: RoomPlayer): Promise<string> {
  const { data, error } = await supabase.rpc('quick_match', { p_player: player });
  if (error) throw error;
  return data as string;
}

/** Host only, in the lobby: let Play online fill the empty seats (or stop it). */
export async function setRoomPublic(code: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_room_public', { p_code: code, p_public: isPublic });
  if (error) throw error;
}

/** Sent every 15s from the lobby so public lobbies can clear out players who've left. */
export async function lobbyHeartbeat(code: string): Promise<void> {
  const { error } = await supabase.rpc('lobby_heartbeat', { p_code: code });
  if (error) throw error;
}

export type ReportReason = 'name' | 'words' | 'cheating' | 'other';

/** Records a report, with a snapshot of the game, for the developer to review. */
export async function reportPlayer(code: string, reportedUid: string, reason: ReportReason): Promise<void> {
  const { error } = await supabase.rpc('report_player', {
    p_code: code,
    p_reported_uid: reportedUid,
    p_reason: reason,
  });
  if (error) throw error;
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
