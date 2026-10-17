// Versus mode: two teams race on the same secret word (migration 025). The server decides
// everything; these mirror _versus_config() for the lobby and turn a versus room into the
// game one player sees.
import type { RoomData, RoundHistoryEntry, Team } from '../supabase/room';
import type { RoomPlayer } from '../store/gameStore';
import type { Palette } from '../theme';

export const TEAMS: Team[] = ['red', 'blue'];
/** Fewest and most players on a team. */
export const MIN_TEAM = 2;
export const MAX_TEAM = 3;
/** Rounds in a versus game. */
export const VERSUS_ROUNDS = 6;
/** The round clock both teams race against. */
export const VERSUS_ROUND_SECONDS = 75;

export function teamName(team: Team): string {
  return team === 'red' ? 'Red' : 'Blue';
}

export function otherTeam(team: Team): Team {
  return team === 'red' ? 'blue' : 'red';
}

/** A team's colour and the text colour on it. */
export function teamColors(p: Palette, team: Team): { bg: string; fg: string } {
  return team === 'red' ? { bg: p.coral, fg: p.onCoral } : { bg: p.blue, fg: p.onBlue };
}

/** The lobby's players on each team. */
export function teamsOf(players: RoomPlayer[]): Record<Team, RoomPlayer[]> {
  return {
    red: players.filter((pl) => pl.team === 'red'),
    blue: players.filter((pl) => pl.team === 'blue'),
  };
}

/** Why a versus lobby can't start yet, or null when it can. */
export function versusProblem(players: RoomPlayer[]): string | null {
  const teams = teamsOf(players);
  if (players.some((pl) => !pl.team)) return 'Everyone needs a team';
  const short = TEAMS.find((t) => teams[t].length < MIN_TEAM);
  if (short) return `${teamName(short)} needs ${MIN_TEAM - teams[short].length} more`;
  return null;
}

/** The team `uid` plays on in this versus game, or null. */
export function sideOf(room: RoomData | null | undefined, uid: string | null | undefined): Team | null {
  if (!room?.sides || !uid) return null;
  return TEAMS.find((t) => room.sides?.[t]?.order.includes(uid)) ?? null;
}

/** A versus round as one team saw it: their own clues, and 'lost-beaten' if the others won. */
export function historyFor(entry: RoundHistoryEntry, team: Team): RoundHistoryEntry {
  const mine = entry.sides?.[team];
  if (!mine) return entry;
  const words = mine.feed.filter((e) => e.kind === 'word').map((e) => (e.kind === 'word' ? e.text : ''));
  return {
    ...entry,
    feed: mine.feed,
    chain: words,
    wordCount: mine.wordCount,
    guesserUid: mine.guesserUid,
    outcome: entry.winner === team ? 'won' : entry.winner ? 'lost-beaten' : 'lost-timeout',
    guess: entry.winner === team ? entry.guess : null,
  };
}

/**
 * The room as `uid` plays it. In a versus game, their team's Guesser, active Knower, feed and
 * turn go where other games keep them, and each round reads from their team's side, so the
 * game screens, clocks and sounds work as they do in any game. Other games come back as is.
 */
export function viewFor(room: RoomData | null, uid: string | null | undefined): RoomData | null {
  const team = sideOf(room, uid);
  if (!room || !team) return room;
  const side = room.sides![team]!;
  const history = room.history
    ? Object.fromEntries(Object.entries(room.history).map(([k, h]) => [k, historyFor(h, team)]))
    : room.history;
  return {
    ...room,
    playerOrder: side.order,
    guesserUid: side.guesserUid,
    activeKnowerUid: side.activeKnowerUid,
    feed: side.feed,
    turnIndex: side.turnIndex,
    history,
  };
}

/** Rounds each team has won so far. */
export function versusScores(room: RoomData): Record<Team, number> {
  const scores: Record<Team, number> = { red: 0, blue: 0 };
  for (const h of Object.values(room.history ?? {})) if (h.winner) scores[h.winner] += 1;
  return scores;
}

/** How the other team is getting on this round: clues given and guesses tried. */
export function rivalProgress(room: RoomData, team: Team): { clues: number; guesses: number } {
  const feed = room.sides?.[otherTeam(team)]?.feed ?? [];
  return {
    clues: feed.filter((e) => e.kind === 'word').length,
    guesses: feed.filter((e) => e.kind === 'guess').length,
  };
}
