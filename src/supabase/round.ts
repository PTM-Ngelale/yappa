import { supabase } from './client';

// Round lifecycle (start, advance, resolve) runs server-side — see migration 004. The
// target word lives in round_secrets, which only that round's Knowers can read, so the
// Guesser's device never receives it.

/** Host call, once, when leaving the lobby — the server shuffles play order and draws the 9 words. */
export async function startGame(code: string): Promise<void> {
  const { error } = await supabase.rpc('start_game', { p_code: code });
  if (error) throw error;
}

/**
 * The current round's target word, or null if the caller is this round's Guesser (RLS
 * returns no row) or the round hasn't been set up yet.
 */
export async function fetchTargetWord(code: string, round: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('round_secrets')
    .select('target_word')
    .eq('code', code)
    .eq('round', round)
    .maybeSingle();
  if (error) throw error;
  return (data?.target_word as string | undefined) ?? null;
}

/**
 * Active Knower adds a word. The server appends it, hands the turn to the other Knower and
 * resets the per-turn 30s timer — it also rejects the move if it isn't the caller's turn or
 * the word is the target. Resolves to the word's index in the chain.
 */
export async function submitWord(code: string, round: number, word: string): Promise<number> {
  const { data, error } = await supabase.rpc('submit_word', {
    p_code: code,
    p_round: round,
    p_word: word,
  });
  if (error) throw error;
  return data as number;
}

export async function setTyping(code: string, isTyping: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_typing', { p_code: code, p_typing: isTyping });
  if (error) throw error;
}

/**
 * Fire-and-forget AI check of whether chain[index] validly chains off chain[index - 1].
 * Runs after the word is already in the chain — never blocks or delays submission. The
 * validate-link edge function reads the words and writes room.linkChecks[index] itself,
 * for Round Resolution to display; any failure just means no flag is shown.
 */
export async function checkLink(code: string, index: number): Promise<void> {
  await supabase.functions.invoke('validate-link', { body: { code, index } });
}

/**
 * Locks in the Guesser's guess. The validate-guess edge function judges it against the
 * hidden target (formatting differences instantly, synonyms/misspellings via AI) and
 * records the round's outcome itself. Resolves to whether the guess was correct, or null if
 * the round had already ended (the timer won the race); throws
 * if it couldn't be submitted, so the caller can let the Guesser retry.
 */
export async function submitGuess(code: string, round: number, guess: string): Promise<boolean | null> {
  // Holds the host's timer at zero while the guess is judged — see RoomData.guessPending.
  // Set from here rather than the edge function so it lands before any cold-start delay.
  const { error: pendingError } = await supabase.rpc('mark_guess_pending', {
    p_code: code,
    p_round: round,
  });
  if (pendingError) console.error(pendingError);

  const { data, error } = await supabase.functions.invoke('validate-guess', {
    body: { code, round, guess },
  });
  if (error) {
    const reason = await functionErrorReason(error);
    // The timer ended the round while the guess was in flight — not a failure; the room
    // update moving everyone to Resolution is already on its way.
    if (reason === 'round-over') return null;
    throw new Error(`validate-guess failed: ${reason}`);
  }
  if (typeof data?.correct !== 'boolean') throw new Error('validate-guess returned no verdict');
  return data.correct;
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

/**
 * How long the current turn has run, by the server's clock (migration 010) — null outside
 * play. Lets a device that loads the room mid-turn pick the countdown up where it is.
 */
export async function turnElapsedMs(code: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('turn_elapsed_ms', { p_code: code });
  if (error) throw error;
  return data as number | null;
}

/** Someone has dropped — stop the server's turn clock. Each device calls it; only the first counts. */
export async function pauseTurnClock(code: string): Promise<void> {
  const { error } = await supabase.rpc('pause_turn_clock', { p_code: code });
  if (error) throw error;
}

/** They're back — start the server's turn clock again. */
export async function resumeTurnClock(code: string): Promise<void> {
  const { error } = await supabase.rpc('resume_turn_clock', { p_code: code });
  if (error) throw error;
}

/** Host call when the turn timer hits zero — the server reveals the word into history. */
export async function resolveRoundTimeout(code: string, round: number): Promise<void> {
  const { error } = await supabase.rpc('resolve_round_timeout', { p_code: code, p_round: round });
  if (error) throw error;
}

/** Host call from Round Resolution's "Next Round" — next round, or Game End after the last. */
export async function advanceRound(code: string, fromRound: number): Promise<void> {
  const { error } = await supabase.rpc('advance_round', { p_code: code, p_from_round: fromRound });
  if (error) throw error;
}
