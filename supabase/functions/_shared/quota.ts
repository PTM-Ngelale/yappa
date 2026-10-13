// Caps how many AI calls the edge functions make — see take_ai_quota() in migration 007.
// A normal game uses roughly 1 guess judgement per round plus 1 link check per chain word,
// so a player in a busy game makes well under 100 calls an hour.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Per player, per rolling hour. */
export const AI_CALLS_PER_USER_HOURLY = 300;
/** Everyone combined, per rolling hour — the cost circuit breaker. */
export const AI_CALLS_GLOBAL_HOURLY = 5000;

/** True if this player may make one more AI call now (and records it). False on any error. */
export async function takeAiQuota(admin: SupabaseClient, uid: string): Promise<boolean> {
  const { data, error } = await admin.rpc("take_ai_quota", {
    p_uid: uid,
    p_per_user_hourly: AI_CALLS_PER_USER_HOURLY,
    p_global_hourly: AI_CALLS_GLOBAL_HOURLY,
  });
  if (error) {
    console.error(error);
    return false;
  }
  return data === true;
}

/**
 * Lets the web version call these functions from the browser. Any origin is fine: callers
 * authenticate with their JWT in the Authorization header, not cookies. Native apps ignore it.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** The browser's CORS preflight: answer it before the auth check, which would reject it. */
export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: CORS_HEADERS }) : null;
}

/** JSON response with headers that stop it being cached or content-sniffed. */
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
