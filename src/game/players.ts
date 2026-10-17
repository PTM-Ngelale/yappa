// Player counts and turn order. The server decides both (migrations 020 and 021:
// _player_limits(), _rounds_for(), _next_knower()); these mirror it for the screens.

/** Fewest players a game can start with: 2 play duo (one Knower, a clue budget). */
export const MIN_PLAYERS = 2;
/** Fewest players for a team game, where the Knowers take turns. */
export const TEAM_PLAYERS = 3;
/** Most players a private room seats. */
export const MAX_PLAYERS = 5;
/** Play online matches this many strangers, then starts. */
export const PUBLIC_PLAYERS = 3;

/** Rounds in a game of `players`: everyone guesses 3 times with 3 players, twice with more. */
export function roundsFor(players: number): number {
  return players <= 3 ? players * 3 : players * 2;
}

type TurnState = { playerOrder?: string[] | null; guesserUid: string };

/** This round's Knowers, in the order they take turns. */
export function knowerOrder(room: TurnState): string[] {
  return (room.playerOrder ?? []).filter((u) => u !== room.guesserUid);
}

/** The Knower who goes after `uid` (wraps round; with a single Knower, `uid` again). */
export function nextKnower(room: TurnState, uid: string): string {
  const knowers = knowerOrder(room);
  const i = knowers.indexOf(uid);
  return knowers.length ? knowers[(i + 1) % knowers.length] : uid;
}

/** "Ade", "Ade and Tomi", "Ade, Tomi and Kemi". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
