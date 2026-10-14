// Judges one of the Guesser's guesses and records it. The target word never reaches the
// Guesser's device (see migration 004), so this function looks it up itself, decides, and
// writes the result via record_guess(), which only the service role can call, so a client
// can't declare its own guess correct.
//
// The Guesser may guess as often as they like, 3 seconds apart (migration 013): begin_guess()
// enforces that and holds the round clock while the guess is judged. A correct guess wins the
// round; a wrong one goes into the description feed for everyone to see, and play carries on.
//
// Correct if it matches the target after normalisation (spacing, hyphens, plurals; see
// _shared/guessMatch.ts) or, failing that, if the AI judges it a close synonym, spelling
// variant or clear misspelling. An AI error or timeout counts as wrong.
//
// Deploy: `supabase functions deploy validate-guess`
// Requires the ANTHROPIC_API_KEY secret. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isLocalMatch } from "../_shared/guessMatch.ts";
import { GUESS_PATTERN, judgeGuess } from "../_shared/judges.ts";
import { json, preflight, takeAiQuota } from "../_shared/quota.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Keeps the round from hanging on a slow AI call; the round clock waits up to 8s for us. */
const AI_TIMEOUT_MS = 5000;

/** Why begin_guess() refused, as an HTTP status. */
const REFUSED: Record<string, number> = {
  "not-the-guesser": 403,
  "round-over": 409,
  paused: 409,
  cooldown: 429,
  "not-allowed": 422,
};

/** Zero-width, bidi-override and control characters: the same set _strip_invisible() drops. */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** The guess as it will show in the feed: no invisible characters, straight apostrophes, single spaces. */
function cleanGuess(guess: string): string {
  return guess.replace(INVISIBLE, "").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
}

/** The AI's verdict, or false on any error/timeout: never hang or crash the round. */
async function aiJudge(guess: string, target: string, category: string): Promise<boolean> {
  try {
    return await judgeGuess(anthropic, guess, target, category, {
      timeout: AI_TIMEOUT_MS,
      maxRetries: 0,
    });
  } catch (err) {
    console.error(err);
    return false;
  }
}

Deno.serve(async (req) => {
  const options = preflight(req);
  if (options) return options;

  // Who is asking: verified from their own JWT, never from the request body.
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);

  let code: unknown, round: unknown, guess: unknown;
  try {
    ({ code, round, guess } = await req.json());
  } catch {
    return json({ error: "invalid-json" }, 400);
  }
  if (typeof code !== "string" || typeof round !== "number" || typeof guess !== "string") {
    return json({ error: "missing-input" }, 400);
  }
  const trimmed = cleanGuess(guess);
  if (trimmed.length === 0) return json({ error: "empty-guess" }, 400);
  // Words only (letters, digits, spaces, apostrophes, hyphens; up to 40): it goes into
  // everyone's feed, so nothing else gets in.
  if (!GUESS_PATTERN.test(trimmed)) return json({ error: "invalid-guess" }, 400);

  // The Guesser's next guess slot: checks it's them, the round is on, the guess isn't a
  // blocked word, and 3s have passed.
  const { data: slot, error: slotError } = await admin.rpc("begin_guess", {
    p_code: code,
    p_round: round,
    p_uid: user.id,
    p_guess: trimmed,
  });
  if (slotError) {
    console.error(slotError);
    return json({ error: "lookup-failed" }, 500);
  }
  if (slot !== "ok") return json({ error: slot }, REFUSED[slot as string] ?? 409);

  const [{ data: room }, { data: secret, error: secretError }] = await Promise.all([
    admin.from("rooms").select("data").eq("code", code).maybeSingle(),
    admin.from("round_secrets").select("target_word").eq("code", code).eq("round", round).maybeSingle(),
  ]);
  if (secretError || !secret) return json({ error: "lookup-failed" }, 500);
  const target = secret.target_word as string;
  const category = (room?.data as { category?: string } | undefined)?.category ?? "";

  // Over the AI quota, only exact/formatting matches count; the guess is still recorded.
  const correct = isLocalMatch(trimmed, target) ||
    ((await takeAiQuota(admin, user.id)) && (await aiJudge(trimmed, target, category)));

  const { data: recorded, error: recordError } = await admin.rpc("record_guess", {
    p_code: code,
    p_round: round,
    p_guess: trimmed,
    p_correct: correct,
  });
  if (recordError) {
    console.error(recordError);
    return json({ error: "record-failed" }, 500);
  }
  // recorded === false: the round clock beat us to it; the round already shows as lost.
  return json({ correct, resolved: recorded === true });
});
