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
  // Supabase (Auth → Attack Protection). If the check can't run, try without one: that still
  // works while protection is off, and fails with a clear error once it's on.
  let captchaToken: string | undefined;
  try {
    captchaToken = await requestCaptchaToken();
  } catch (e) {
    console.warn('Captcha check failed:', e);
  }

  const { data, error } = await supabase.auth.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined
  );
  if (error) throw error;
  return data.user!.id;
}
