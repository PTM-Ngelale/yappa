import { supabase } from './client';

// Every move goes through a server function that checks the caller and the move
// (migrations 005 and 013), so clients can't race or cheat each other.

/**
 * Host call, once, when leaving the lobby: the server shuffles play order, draws a word per
 * round and sets the clocks for the player count (p_timed; older apps leave it out and get
 * the old 10 and 60 seconds, see migration 022).
 */
export async function startGame(code: string): Promise<void> {
  const { error } = await supabase.rpc('start_game', { p_code: code, p_timed: true });
  if (error) throw error;
}

/** The round's secret word and what it means (migration 016); the meaning may be empty. */
export type SecretWord = { word: string; meaning: string };

/**
 * The current round's target word, or null if the caller is this round's Guesser (RLS
 * returns no row) or the round hasn't been set up yet.
 */
export async function fetchTargetWord(code: string, round: number): Promise<SecretWord | null> {
  const { data, error } = await supabase
    .from('round_secrets')
    .select('target_word, meaning')
    .eq('code', code)
    .eq('round', round)
    .maybeSingle();
  if (error) throw error;
  if (!data?.target_word) return null;
  return { word: data.target_word as string, meaning: (data.meaning as string | null) ?? '' };
}

/** Why the server turned a word down, in words a player can act on. */
export type WordRejection = 'not-your-turn' | 'turn-over' | 'paused' | 'target' | 'repeat' | 'shape' | 'blocked' | 'out-of-clues';

/** Maps submit_word()'s error to a WordRejection, or null if it wasn't a rule (a network error). */
export function wordRejection(error: unknown): WordRejection | null {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? '');
  if (message.includes('not your turn') || message.includes('round is not in play')) return 'not-your-turn';
  if (message.includes('turn is over')) return 'turn-over';
  if (message.includes('game is paused')) return 'paused';
  if (message.includes('that is the target word')) return 'target';
  if (message.includes('same as the last word')) return 'repeat';
  if (message.includes('one word')) return 'shape';
  if (message.includes('word not allowed')) return 'blocked';
  if (message.includes('out of clues')) return 'out-of-clues';
  return null;
}

/**
 * Active Knower adds a word. `turnIndex` is the turn they're answering: if it has moved on
 * (the turn ran out), the server turns the word down instead of putting it in the wrong turn.
 * Resolves to the next turn's index; throws if the word was refused (see wordRejection).
 */
export async function submitWord(code: string, round: number, turnIndex: number, word: string): Promise<number> {
  const { data, error } = await supabase.rpc('submit_word', {
    p_code: code,
    p_round: round,
    p_turn_index: turnIndex,
    p_word: word,
  });
  if (error) throw error;
  return data as number;
}

/**
 * The turn clock ran out: pass the turn to the next Knower. Any device may call it; the
 * server only acts once its own clock agrees, and only once per turn. Resolves to whether
 * this call did the skip.
 */
export async function skipTurn(code: string, round: number, turnIndex: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('skip_turn', { p_code: code, p_round: round, p_turn_index: turnIndex });
  if (error) throw error;
  return data === true;
}

/**
 * The round clock ran out: the round is lost. Any device may call it; false means the server
 * isn't ready yet (its clock hasn't quite run out, or a guess is still being judged), so
 * call again shortly.
 */
export async function expireRound(code: string, round: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('expire_round', { p_code: code, p_round: round });
  if (error) throw error;
  return data === true;
}

export async function setTyping(code: string, isTyping: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_typing', { p_code: code, p_typing: isTyping });
  if (error) throw error;
}

/** What happened to a guess. */
export type GuessResult =
  | { status: 'correct' }
  | { status: 'wrong' }
  /** Sent too soon after the last guess. */
  | { status: 'cooldown' }
  /** The round ended (time ran out) before it was judged, or the game is paused. */
  | { status: 'closed' }
  /** Not sent to the judge: not a word ('invalid') or a blocked one ('not-allowed'). */
  | { status: 'rejected'; reason: 'invalid' | 'not-allowed' };

/**
 * Sends a guess. The validate-guess edge function judges it against the hidden target
 * (formatting differences instantly, synonyms and misspellings via AI) and records it: a
 * correct guess wins the round, a wrong one goes into the feed. Throws if it couldn't be
 * sent at all, so the Guesser can try again.
 */
export async function submitGuess(code: string, round: number, guess: string): Promise<GuessResult> {
  const { data, error } = await supabase.functions.invoke('validate-guess', {
    body: { code, round, guess },
  });
  if (error) {
    const reason = await functionErrorReason(error);
    if (reason === 'cooldown') return { status: 'cooldown' };
    if (reason === 'round-over' || reason === 'paused') return { status: 'closed' };
    if (reason === 'invalid-guess') return { status: 'rejected', reason: 'invalid' };
    if (reason === 'not-allowed') return { status: 'rejected', reason: 'not-allowed' };
    throw new Error(`validate-guess failed: ${reason}`);
  }
  if (typeof data?.correct !== 'boolean') throw new Error('validate-guess returned no verdict');
  if (data.resolved === false) return { status: 'closed' };
  return { status: data.correct ? 'correct' : 'wrong' };
}

/** The `error` code an edge function put in its JSON body, falling back to the HTTP status. */
async function functionErrorReason(error: unknown): Promise<string> {
  const response = (error as { context?: Response }).context;
  if (!response || typeof response.json !== 'function') return String(error);
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** Where the server's clocks stand (migration 013), for a device catching up. Null outside play. */
export type ClockState = {
  round: number;
  turnIndex: number;
  turnElapsedMs: number;
  roundElapsedMs: number;
  held: boolean;
};

export async function clockState(code: string): Promise<ClockState | null> {
  const { data, error } = await supabase.rpc('clock_state', { p_code: code });
  if (error) throw error;
  return (data as ClockState | null) ?? null;
}

/** Someone has dropped: stop both clocks. Each device calls it; only the first counts. */
export async function pauseTurnClock(code: string): Promise<void> {
  const { error } = await supabase.rpc('pause_turn_clock', { p_code: code });
  if (error) throw error;
}

/** They're back: start both clocks again, shifted on by the time paused. */
export async function resumeTurnClock(code: string): Promise<void> {
  const { error } = await supabase.rpc('resume_turn_clock', { p_code: code });
  if (error) throw error;
}

/** Host call from Round Resolution's "Next Round": next round, or Game End after the last. */
export async function advanceRound(code: string, fromRound: number): Promise<void> {
  const { error } = await supabase.rpc('advance_round', { p_code: code, p_from_round: fromRound });
  if (error) throw error;
}
