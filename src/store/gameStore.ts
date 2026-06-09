import { create } from 'zustand';

export type Role = 'knower' | 'guesser';

export interface RoomPlayer {
  uid: string;
  name: string;
  avatarColor: string;
  role: Role;
  lastSeenAt: number;
}

interface GameState {
  roomCode: string | null;
  players: RoomPlayer[];
  round: number;
  chain: string[];
  targetWord: string | null;
  category: string | null;
  secondsRemaining: number;
  isHost: boolean;
  activeKnowerUid: string | null;

  setRoomCode: (code: string) => void;
  setPlayers: (players: RoomPlayer[]) => void;
  setIsHost: (isHost: boolean) => void;
  setRound: (round: number) => void;
  setChain: (chain: string[]) => void;
  appendWord: (word: string) => void;
  setTargetWord: (word: string) => void;
  setCategory: (category: string) => void;
  setSecondsRemaining: (seconds: number) => void;
  setActiveKnowerUid: (uid: string | null) => void;
  reset: () => void;
}

const initialState = {
  roomCode: null,
  players: [],
  round: 1,
  chain: [],
  targetWord: null,
  category: null,
  secondsRemaining: 30,
  isHost: false,
  activeKnowerUid: null,
};

export const useGameStore = create<GameState>()((set) => ({
  ...initialState,
  setRoomCode: (roomCode) => set({ roomCode }),
  setPlayers: (players) => set({ players }),
  setIsHost: (isHost) => set({ isHost }),
  setRound: (round) => set({ round }),
  setChain: (chain) => set({ chain }),
  appendWord: (word) => set((s) => ({ chain: [...s.chain, word] })),
  setTargetWord: (targetWord) => set({ targetWord }),
  setCategory: (category) => set({ category }),
  setSecondsRemaining: (secondsRemaining) => set({ secondsRemaining }),
  setActiveKnowerUid: (activeKnowerUid) => set({ activeKnowerUid }),
  reset: () => set(initialState),
}));
