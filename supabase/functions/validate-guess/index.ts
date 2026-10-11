// Judges the Guesser's guess and records the round's outcome. The target word never
// reaches the Guesser's device (see migration 004), so this function looks it up itself,
// decides, and writes the result via resolve_round_guess() — callable only with the
// service role, so a client can't declare its own guess correct.
//
// Correct if it matches the target after normalisation (spacing, hyphens, plurals — see
// _shared/guessMatch.ts) or, failing that, if the AI judges it a close synonym, spelling
// variant or clear misspelling, per the spec. An AI error or timeout counts as wrong.
//
// Deploy: `supabase functions deploy validate-guess`
// Requires the ANTHROPIC_API_KEY secret (shared with validate-link). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isLocalMatch } from "../_shared/guessMatch.ts";
import { judgeGuess } from "../_shared/judges.ts";
import { json, takeAiQuota } from "../_shared/quota.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Keeps the round from hanging on a slow AI call; the host's timer holds ~8s for us. */
const AI_TIMEOUT_MS = 5000;

/** The AI's verdict, or false on any error/timeout — never hang or crash the round. */
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
  // Who is asking — verified from their own JWT, never from the request body.
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
  const trimmed = guess.trim().slice(0, 60);
  if (trimmed.length === 0) return json({ error: "empty-guess" }, 400);

  const { data: room, error: roomError } = await admin
    .from("rooms").select("data").eq("code", code).maybeSingle();
  if (roomError) return json({ error: "lookup-failed" }, 500);
  const data = room?.data as
    | { status: string; round: number; guesserUid: string; category: string }
    | undefined;
  if (!data) return json({ error: "room-not-found" }, 404);
  if (data.guesserUid !== user.id) return json({ error: "not-the-guesser" }, 403);
  if (data.status !== "playing" || data.round !== round) {
    return json({ error: "round-over" }, 409);
  }

  const { data: secret, error: secretError } = await admin
    .from("round_secrets").select("target_word")
    .eq("code", code).eq("round", round).maybeSingle();
  if (secretError || !secret) return json({ error: "lookup-failed" }, 500);
  const target = secret.target_word as string;

  // Over the AI quota, only exact/formatting matches count — the round still resolves.
  const correct = isLocalMatch(trimmed, target) ||
    ((await takeAiQuota(admin, user.id)) && (await aiJudge(trimmed, target, data.category)));

  const { data: resolved, error: resolveError } = await admin.rpc("resolve_round_guess", {
    p_code: code,
    p_round: round,
    p_guess: trimmed,
    p_correct: correct,
  });
  if (resolveError) {
    console.error(resolveError);
    return json({ error: "resolve-failed" }, 500);
  }
  // resolved === false: the timer beat us to it; the round already shows as timed out.
  return json({ correct, resolved: resolved === true });
});
