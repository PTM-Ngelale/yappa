import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { pickAvatarColor } from '../lib/avatarColors';

interface PlayerState {
  name: string;
  uid: string | null;
  avatarColor: string;
  setName: (name: string) => void;
  setUid: (uid: string) => void;
  setAvatarColor: (color: string) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      name: '',
      uid: null,
      avatarColor: pickAvatarColor(),
      setName: (name) => set({ name }),
      setUid: (uid) => set({ uid }),
      setAvatarColor: (color) => set({ avatarColor: color }),
    }),
    {
      name: 'yappa-player',
      storage: createJSONStorage(() => AsyncStorage),
      // uid is deliberately excluded — it's derived fresh from the Supabase anon session
      // (already persisted separately, see src/supabase/client.ts) on every app launch.
      // Persisting a second copy here could drift from the real session if it's ever reset.
      partialize: (state) => ({ name: state.name, avatarColor: state.avatarColor }),
    }
  )
);
