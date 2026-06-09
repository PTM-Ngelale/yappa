import { getDatabase, ref, set, update } from 'firebase/database';
import { firebaseApp } from './config';
import type { RoomPlayer } from '../store/gameStore';
import { pickWord } from '../lib/wordList';

const db = () => getDatabase(firebaseApp);

export async function startRound(code: string, players: RoomPlayer[]): Promise<void> {
  const { word, category } = pickWord();

  // Randomly assign one player as guesser, the rest are knowers
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const guesserUid = shuffled[0].uid;
  const knowerUids = shuffled.slice(1).map((p) => p.uid);
  const activeKnowerUid = knowerUids[0];

  const updatedPlayers: Record<string, RoomPlayer> = {};
  for (const p of players) {
    updatedPlayers[p.uid] = { ...p, role: p.uid === guesserUid ? 'guesser' : 'knower' };
  }

  await update(ref(db(), `rooms/${code}`), {
    status: 'playing',
    round: 1,
    targetWord: word,
    category,
    secondsRemaining: 30,
    activeKnowerUid,
    players: updatedPlayers,
    chain: null,
    typing: null,
  });
}

export async function submitWord(
  code: string,
  currentChain: string[],
  newWord: string,
  nextKnowerUid: string,
  submitterUid: string,
): Promise<void> {
  const newChain = [...currentChain, newWord];
  await update(ref(db(), `rooms/${code}`), {
    chain: newChain,
    activeKnowerUid: nextKnowerUid,
    [`typing/${submitterUid}`]: null,
  });
}

export async function setTyping(code: string, uid: string, isTyping: boolean): Promise<void> {
  await set(ref(db(), `rooms/${code}/typing/${uid}`), isTyping || null);
}

export async function tickTimer(code: string, seconds: number): Promise<void> {
  await update(ref(db(), `rooms/${code}`), { secondsRemaining: seconds });
}

export async function endRound(code: string): Promise<void> {
  await update(ref(db(), `rooms/${code}`), { status: 'ended', secondsRemaining: 0 });
}
