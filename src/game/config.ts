// Gameplay timings and limits, in one place (GAMEPLAY_REDESIGN.md, section 3).
// The server is the authority: these must match _game_config() in
// supabase/migrations/013_describe_together.sql, which decides when a turn or round is over.
// Tuning after playtests: shorten ROUND_SECONDS (e.g. 45) if rounds feel too forgiving;
// lengthen TURN_SECONDS (12 to 15) if they feel too frantic.

/** Each Knower turn. When it runs out the turn passes to the next Knower. */
export const TURN_SECONDS = 10;
/** The whole round. When it runs out the round is lost. */
export const ROUND_SECONDS = 60;
/** The Guesser's wait between guesses. */
export const GUESS_COOLDOWN_SECONDS = 3;
/** Longest word a Knower can add. */
export const MAX_WORD_LENGTH = 24;

/** One word: letters, with apostrophes or hyphens inside (don't, x-ray). Mirrors submit_word(). */
export const ONE_WORD = /^\p{L}+(['’-]\p{L}+)*$/u;
