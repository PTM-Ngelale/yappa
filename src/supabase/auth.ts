import { supabase } from './client';

export async function signInAnon(): Promise<string> {
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

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user!.id;
}
