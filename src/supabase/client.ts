import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // Browsers slow timers in background tabs and in windows hidden behind others, which
    // delays the realtime heartbeat until the server drops the connection — the player then
    // shows as disconnected. A Web Worker's timers keep the heartbeat on time.
    realtime: {
      worker: Platform.OS === 'web' && typeof Worker !== 'undefined',
    },
  },
);
