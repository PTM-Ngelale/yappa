import { requestCaptchaToken } from '../components/CaptchaHost';
import { supabase } from './client';

// The app signs in on launch and again on Create / Join / Play online; share one attempt so
// they can't race into two anonymous accounts (or two captcha checks).
let inFlight: Promise<string> | null = null;

export function signInAnon(): Promise<string> {
  inFlight ??= doSignIn().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSignIn(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    // Unused anonymous accounts are deleted after 30 days (migration 008), but the stored
    // session doesn't know that. Ask the server; if the account is gone, start a new one.
    // On a network error keep the stored session — the player may just be offline.
    const { error } = await supabase.auth.getUser();
    if (!error) return session.user.id;
    if (error.status !== 401 && error.status !== 403 && error.status !== 404) return session.user.id;
    await supabase.auth.signOut({ scope: 'local' });
  }

  // New anonymous accounts need a Cloudflare Turnstile token once CAPTCHA protection is on in
  // Supabase (Auth → Attack Protection). The check sometimes hangs or fails on a slow first
  // load, so a failed check, or a token Supabase rejects, gets a fresh check (new page, new
  // token) up to CAPTCHA_ATTEMPTS times. If no check works, try without a token: that still
  // works while protection is off, and fails with a clear error once it's on.
  let captchaProblem = 'no token';
  for (let attempt = 1; attempt <= CAPTCHA_ATTEMPTS; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    let captchaToken: string | undefined;
    try {
      captchaToken = await requestCaptchaToken();
    } catch (e) {
      captchaProblem = e instanceof Error ? e.message : String(e);
      console.warn(`Captcha check failed (attempt ${attempt} of ${CAPTCHA_ATTEMPTS}):`, e);
      if (captchaProblem === 'superseded') throw e;
      if (attempt < CAPTCHA_ATTEMPTS) continue;
    }

    const { data, error } = await supabase.auth.signInAnonymously(
      captchaToken ? { options: { captchaToken } } : undefined
    );
    if (!error) return data.user!.id;
    if (error.code !== 'captcha_failed' && !/captcha/i.test(error.message)) throw error;
    // Name the actual cause so the player (and we) can see it on screen.
    captchaProblem = captchaToken ? `captcha rejected: ${error.message}` : `captcha: ${captchaProblem}`;
    if (!captchaToken || attempt === CAPTCHA_ATTEMPTS) throw new Error(captchaProblem);
    console.warn(`Captcha token rejected (attempt ${attempt} of ${CAPTCHA_ATTEMPTS}):`, error.message);
  }
  throw new Error(captchaProblem); // not reached: the last attempt returns or throws
}

const CAPTCHA_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
