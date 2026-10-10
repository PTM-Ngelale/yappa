import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SettingsState {
  musicOn: boolean;
  sfxOn: boolean;
  toggleMusic: () => void;
  toggleSfx: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      musicOn: true,
      sfxOn: true,
      toggleMusic: () => set((s) => ({ musicOn: !s.musicOn })),
      toggleSfx: () => set((s) => ({ sfxOn: !s.sfxOn })),
    }),
    {
      name: 'yappa-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ musicOn: state.musicOn, sfxOn: state.sfxOn }),
    }
  )
);
