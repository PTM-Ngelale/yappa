import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SOLO_RECENT_LIMIT, type SoloRunLength } from '../game/solo';
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
  /** Solo: rounds in a run, as last picked. */
  soloLength: SoloRunLength;
  /** Solo: the categories to draw from, as last picked; null for all of them. */
  soloCategories: string[] | null;
  /** Solo: the best score of a finished run, by its length. */
  soloBests: Record<SoloRunLength, number>;
  /** Solo: words from recent runs, newest last, so new runs don't repeat them. */
  soloRecent: string[];
  toggleMusic: () => void;
  toggleSfx: () => void;
  markOnlineNoticeSeen: () => void;
  markDemoSeen: () => void;
  markTipSeen: (tip: TipId) => void;
  markFirstGameDone: () => void;
  setSoloLength: (length: SoloRunLength) => void;
  setSoloCategories: (categories: string[] | null) => void;
  markSoloWordsPlayed: (ids: string[]) => void;
  recordSoloScore: (length: SoloRunLength, score: number) => void;
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
      soloLength: 10,
      soloBests: { 5: 0, 10: 0 },
      soloRecent: [],
      setSoloLength: (length) => set({ soloLength: length }),
      soloCategories: null,
      setSoloCategories: (categories) => set({ soloCategories: categories }),
      markSoloWordsPlayed: (ids) =>
        set((s) => ({ soloRecent: [...s.soloRecent.filter((id) => !ids.includes(id)), ...ids].slice(-SOLO_RECENT_LIMIT) })),
      recordSoloScore: (length, score) =>
        set((s) => (score > s.soloBests[length] ? { soloBests: { ...s.soloBests, [length]: score } } : s)),
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
        soloLength: state.soloLength,
        soloCategories: state.soloCategories,
        soloBests: state.soloBests,
        soloRecent: state.soloRecent,
      }),
    }
  )
);
