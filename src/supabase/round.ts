import type { RoomPlayer } from '../store/gameStore';
import { generateGame } from '../lib/wordList';
import { supabase } from './client';
import { MAX_ROUNDS, patchRoom, type PatchOp, type RoundOutcome } from './room';

interface RoundRoles {
  guesserUid: string;
  activeKnowerUid: string;
}

/**
 * Guesser rotates through the fixed player order (each player guesses maxRounds/3 times).
 * The two Knowers alternate who goes first by round parity, per the locked spec rule.
 */
function computeRoundRoles(playerOrder: string[], round: number): RoundRoles {
  const guesserIndex = (round - 1) % playerOrder.length;
  const guesserUid = playerOrder[guesserIndex];
  const [knowerAUid, knowerBUid] = playerOrder.filter((uid) => uid !== guesserUid);
  const activeKnowerUid = round % 2 === 1 ? knowerAUid : knowerBUid;
  return { guesserUid, activeKnowerUid };
}

function buildRoundOps(
  playerOrder: string[],
  round: number,
  players: Record<string, RoomPlayer>,
  word: string,
  category: string,
): PatchOp[] {
  const roles = computeRoundRoles(playerOrder, round);

  const updatedPlayers: Record<string, RoomPlayer> = {};
  for (const uid of Object.keys(players)) {
    updatedPlayers[uid] = {
      ...players[uid],
      role: uid === roles.guesserUid ? 'guesser' : 'knower',
    };
  }

  return [
    { path: ['status'], value: 'playing' },
    { path: ['round'], value: round },
    { path: ['targetWord'], value: word },
    { path: ['category'], value: category },
    { path: ['secondsRemaining'], value: 30 },
    { path: ['activeKnowerUid'], value: roles.activeKnowerUid },
    { path: ['guesserUid'], value: roles.guesserUid },
    { path: ['players'], value: updatedPlayers },
    { path: ['chain'], value: null },
    { path: ['typing'], value: {} },
    { path: ['linkChecks'], value: {} },
  ];
}

/** Host call, once, when leaving the lobby — shuffles play order and draws the game's 9 words. */
export async function startGame(code: string, players: RoomPlayer[]): Promise<void> {
  const gameWords = generateGame(); // 3 Easy + 4 Medium + 2 Hard, spanning ≥3 categories
  const playerOrder = [...players].map((p) => p.uid).sort(() => Math.random() - 0.5);
  const playersByUid = Object.fromEntries(players.map((p) => [p.uid, p]));
  const first = gameWords[0];

  await patchRoom(code, [
    ...buildRoundOps(playerOrder, 1, playersByUid, first.word, first.category),
    { path: ['maxRounds'], value: MAX_ROUNDS },
    { path: ['playerOrder'], value: playerOrder },
    { path: ['gameWords'], value: gameWords.map(({ word, category }) => ({ word, category })) },
    { path: ['history'], value: {} },
  ]);
}

/**
 * The 30-second timer is per-turn, not per-round — it resets here every time a word lands
 * and the active Knower changes, rather than counting down once across the whole round.
 */
export async function submitWord(
  code: string,
  currentChain: string[],
  newWord: string,
  nextKnowerUid: string,
  submitterUid: string,
): Promise<void> {
  const newChain = [...currentChain, newWord];
  await patchRoom(code, [
    { path: ['chain'], value: newChain },
    { path: ['activeKnowerUid'], value: nextKnowerUid },
    { path: ['secondsRemaining'], value: 30 },
    { path: ['typing', submitterUid], value: null },
  ]);
}

export async function setTyping(code: string, uid: string, isTyping: boolean): Promise<void> {
  await patchRoom(code, [{ path: ['typing', uid], value: isTyping || null }]);
}

/**
 * Fire-and-forget AI check of whether `newWord` validly chains off `previousWord`.
 * Runs after the word is already in the chain — never blocks or delays submission.
 * Result lands in room.linkChecks[index] for Round Resolution to display; any
 * failure (network, edge function error) is swallowed so it can never affect
 * gameplay — silence just means no flag is shown.
 */
export async function checkLink(
  code: string,
  previousWord: string,
  newWord: string,
  index: number,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('validate-link', {
    body: { previousWord, newWord },
  });
  if (error || !data) return;
  await patchRoom(code, [
    { path: ['linkChecks', String(index)], value: data.valid ? 'valid' : 'invalid' },
  ]);
}

export async function tickTimer(code: string, seconds: number): Promise<void> {
  await patchRoom(code, [{ path: ['secondsRemaining'], value: seconds }]);
}

/** Called when a round ends (correct guess or timer expiry) — records history and shows Resolution. */
export async function resolveRound(
  code: string,
  round: number,
  category: string,
  targetWord: string,
  chain: string[],
  guesserUid: string,
  outcome: RoundOutcome,
  linkChecks?: Record<number, 'valid' | 'invalid'> | null,
): Promise<void> {
  await patchRoom(code, [
    { path: ['status'], value: 'resolution' },
    {
      path: ['history', String(round)],
      value: { round, category, targetWord, chain, guesserUid, outcome, linkChecks: linkChecks ?? {} },
    },
  ]);
}

/** Host call from Round Resolution's "Next Round" — advances to the next round or ends the game. */
export async function advanceRound(
  code: string,
  round: number,
  maxRounds: number,
  playerOrder: string[],
  players: Record<string, RoomPlayer>,
  gameWords: { word: string; category: string }[],
): Promise<void> {
  if (round >= maxRounds) {
    await patchRoom(code, [{ path: ['status'], value: 'gameover' }]);
    return;
  }
  const next = gameWords[round]; // gameWords is 0-indexed; index `round` is the (round+1)-th word
  await patchRoom(code, buildRoundOps(playerOrder, round + 1, players, next.word, next.category));
}
