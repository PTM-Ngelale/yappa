import { getDatabase, onValue, ref, set, update } from 'firebase/database';
import { firebaseApp } from './config';
import type { RoomPlayer } from '../store/gameStore';

const db = () => getDatabase(firebaseApp);

export interface RoomData {
  hostUid: string;
  status: 'lobby' | 'playing' | 'ended';
  round: number;
  chain: string[] | null;
  targetWord: string;
  category: string;
  secondsRemaining: number;
  activeKnowerUid: string;
  players: Record<string, RoomPlayer>;
  typing?: Record<string, boolean>;
  createdAt: number;
}

export async function createRoom(code: string, hostPlayer: RoomPlayer): Promise<void> {
  await set(ref(db(), `rooms/${code}`), {
    hostUid: hostPlayer.uid,
    status: 'lobby',
    round: 1,
    chain: null,
    targetWord: '',
    category: '',
    secondsRemaining: 30,
    activeKnowerUid: '',
    players: { [hostPlayer.uid]: hostPlayer },
    createdAt: Date.now(),
  });
}

export async function joinRoom(code: string, player: RoomPlayer): Promise<void> {
  await update(ref(db(), `rooms/${code}/players/${player.uid}`), player);
}

export function listenToRoom(
  code: string,
  onData: (data: RoomData | null) => void
): () => void {
  const unsubscribe = onValue(ref(db(), `rooms/${code}`), (snap) => {
    onData(snap.exists() ? (snap.val() as RoomData) : null);
  });
  return unsubscribe;
}

export async function updateRoomField(
  code: string,
  updates: Partial<RoomData>
): Promise<void> {
  await update(ref(db(), `rooms/${code}`), updates);
}
