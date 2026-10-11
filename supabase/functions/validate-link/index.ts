// Judges whether chain[index] forms a valid compound word / common two-word phrase with
// chain[index - 1], and records the verdict in the room's linkChecks. Runs after the word
// is already in the chain (see src/supabase/round.ts checkLink) — never blocks submission.
//
// The words are read from the room server-side, and the verdict is written here via
// record_link_check() (service role only) — the client only says which link to check, so
// it can neither forge a verdict nor use this function to send arbitrary text to the AI.
//
// Deploy: `supabase functions deploy validate-link`
// Requires the ANTHROPIC_API_KEY secret: `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { judgeLink } from "../_shared/judges.ts";
import { json, takeAiQuota } from "../_shared/quota.ts";

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);

  let code: unknown, index: unknown;
  try {
    ({ code, index } = await req.json());
  } catch {
    return json({ error: "invalid-json" }, 400);
  }
  if (typeof code !== "string" || typeof index !== "number" || !Number.isInteger(index)) {
    return json({ error: "missing-input" }, 400);
  }

  const { data: room } = await admin.from("rooms").select("data").eq("code", code).maybeSingle();
  const data = room?.data as
    | {
      status: string;
      round: number;
      chain: string[] | null;
      players: Record<string, unknown>;
      linkChecks?: Record<string, "valid" | "invalid"> | null;
    }
    | undefined;
  if (!data || !(user.id in data.players)) return json({ error: "not-a-member" }, 403);
  const chain = data.chain ?? [];
  if (data.status !== "playing" || index < 1 || index >= chain.length) {
    return json({ error: "no-such-link" }, 409);
  }
  // Each link is judged once — repeat calls can't run up the AI bill.
  const existing = data.linkChecks?.[String(index)];
  if (existing) return json({ valid: existing === "valid", cached: true });

  // Over the AI quota: no verdict, so no flag — links are advisory and never affect score.
  if (!(await takeAiQuota(admin, user.id))) return json({ error: "rate-limited" }, 429);

  const previousWord = chain[index - 1];
  const newWord = chain[index];

  let valid: boolean;
  try {
    valid = await judgeLink(anthropic, previousWord, newWord, { timeout: 10000, maxRetries: 1 });
  } catch (err) {
    console.error(err);
    // Fail open — an infra/API error should never falsely flag a link. Record nothing.
    return json({ valid: true, reason: "validation-error" });
  }

  const { error } = await admin.rpc("record_link_check", {
    p_code: code,
    p_round: data.round,
    p_index: index,
    p_word: newWord,
    p_valid: valid,
  });
  if (error) console.error(error);
  return json({ valid });
});
