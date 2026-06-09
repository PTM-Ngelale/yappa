import { create } from 'zustand';
import { pickAvatarColor } from '../lib/avatarColors';

interface PlayerState {
  name: string;
  uid: string | null;
  avatarColor: string;
  setName: (name: string) => void;
  setUid: (uid: string) => void;
  setAvatarColor: (color: string) => void;
}

export const usePlayerStore = create<PlayerState>()((set) => ({
  name: '',
  uid: null,
  avatarColor: pickAvatarColor(),
  setName: (name) => set({ name }),
  setUid: (uid) => set({ uid }),
  setAvatarColor: (color) => set({ avatarColor: color }),
}));
