import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { TipId } from '../game/tips';

interface SettingsState {
  musicOn: boolean;
  sfxOn: boolean;
  /** Seen the "Playing online" notice before the first Play online. */
  onlineNoticeSeen: boolean;
  /** Seen (or skipped) the demo shown on first launch. */
  demoSeen: boolean;
  /** First-game tips already shown on this device. */
  tipsSeen: TipId[];
  /** Finished a first game: no more first-game tips. */
  firstGameDone: boolean;
  toggleMusic: () => void;
  toggleSfx: () => void;
  markOnlineNoticeSeen: () => void;
  markDemoSeen: () => void;
  markTipSeen: (tip: TipId) => void;
  markFirstGameDone: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      musicOn: true,
      sfxOn: true,
      onlineNoticeSeen: false,
      demoSeen: false,
      tipsSeen: [],
      firstGameDone: false,
      toggleMusic: () => set((s) => ({ musicOn: !s.musicOn })),
      toggleSfx: () => set((s) => ({ sfxOn: !s.sfxOn })),
      markOnlineNoticeSeen: () => set({ onlineNoticeSeen: true }),
      markDemoSeen: () => set({ demoSeen: true }),
      markTipSeen: (tip) => set((s) => (s.tipsSeen.includes(tip) ? s : { tipsSeen: [...s.tipsSeen, tip] })),
      markFirstGameDone: () => set({ firstGameDone: true }),
    }),
    {
      name: 'yappa-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        musicOn: state.musicOn,
        sfxOn: state.sfxOn,
        onlineNoticeSeen: state.onlineNoticeSeen,
        demoSeen: state.demoSeen,
        tipsSeen: state.tipsSeen,
        firstGameDone: state.firstGameDone,
      }),
    }
  )
);
