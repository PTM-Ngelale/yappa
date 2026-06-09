import { getAuth, signInAnonymously } from 'firebase/auth';
import { firebaseApp } from './config';

export const firebaseAuth = getAuth(firebaseApp);

export async function signInAnon(): Promise<string> {
  if (firebaseAuth.currentUser) return firebaseAuth.currentUser.uid;
  const cred = await signInAnonymously(firebaseAuth);
  return cred.user.uid;
}
