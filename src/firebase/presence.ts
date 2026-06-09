import { getDatabase, ref, update } from 'firebase/database';
import { firebaseApp } from './config';

const HEARTBEAT_INTERVAL_MS = 2000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat(roomCode: string, uid: string): void {
  stopHeartbeat();
  const db = getDatabase(firebaseApp);
  const beat = () =>
    update(ref(db, `rooms/${roomCode}/players/${uid}`), { lastSeenAt: Date.now() });
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
