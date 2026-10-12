import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SettingsState {
  musicOn: boolean;
  sfxOn: boolean;
  /** Seen the "Playing online" notice before the first Play online. */
  onlineNoticeSeen: boolean;
  toggleMusic: () => void;
  toggleSfx: () => void;
  markOnlineNoticeSeen: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      musicOn: true,
      sfxOn: true,
      onlineNoticeSeen: false,
      toggleMusic: () => set((s) => ({ musicOn: !s.musicOn })),
      toggleSfx: () => set((s) => ({ sfxOn: !s.sfxOn })),
      markOnlineNoticeSeen: () => set({ onlineNoticeSeen: true }),
    }),
    {
      name: 'yappa-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        musicOn: state.musicOn,
        sfxOn: state.sfxOn,
        onlineNoticeSeen: state.onlineNoticeSeen,
      }),
    }
  )
);
