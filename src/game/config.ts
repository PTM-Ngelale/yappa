// Gameplay timings and limits, in one place (GAMEPLAY_REDESIGN.md, section 3).
// The server is the authority: these must match _game_config() in
// supabase/migrations/022_clocks_by_player_count.sql, which decides when a turn or round is over.
// Tuning after playtests: shorten the round if rounds feel too forgiving; shorten
// TURN_SECONDS if turns feel too slow.
import type { RoomData } from '../supabase/room';

/** Each Knower turn. When it runs out the turn passes to the next Knower. */
export const TURN_SECONDS = 15;
/** The whole round with 3 players (and in duo). When it runs out the round is lost. */
export const ROUND_SECONDS = 60;
/** What each player past 3 adds to the round: 75 seconds with 4, 90 with 5. */
export const ROUND_SECONDS_PER_EXTRA_PLAYER = 15;
/** The Guesser's wait between guesses. */
export const GUESS_COOLDOWN_SECONDS = 3;
/** Duo: clues the Knower gets each round (no turn clock). Mirrors duoClues in migration 021. */
export const DUO_CLUES = 8;
/** Longest word a Knower can add. */
export const MAX_WORD_LENGTH = 24;

/** The round clock for a game of this many players. Mirrors _clocks_for() in migration 022. */
export function roundSecondsFor(players: number): number {
  return ROUND_SECONDS + ROUND_SECONDS_PER_EXTRA_PLAYER * Math.max(players - 3, 0);
}

/**
 * The clocks a game runs on, recorded on the room when it starts. A game started by an
 * older app records none and keeps the old 10 second turns and 60 second rounds.
 */
export function roomClocks(room: Pick<RoomData, 'turnMs' | 'roundMs'> | null | undefined): {
  turnSeconds: number;
  roundSeconds: number;
} {
  return {
    turnSeconds: room?.turnMs ? room.turnMs / 1000 : 10,
    roundSeconds: room?.roundMs ? room.roundMs / 1000 : 60,
  };
}

/** One word: letters, with apostrophes or hyphens inside (don't, x-ray). Mirrors submit_word(). */
export const ONE_WORD = /^\p{L}+(['’-]\p{L}+)*$/u;
