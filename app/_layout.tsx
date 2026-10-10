import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  useFonts,
} from '@expo-google-fonts/rubik';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import '../global.css';
import { initAudio, setMusicTrack } from '../src/audio/sounds';
import { SUPABASE_CONFIGURED } from '../src/supabase/config';
import { colors } from '../src/theme';
import { usePlayerStore } from '../src/store/playerStore';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
  });

  const setUid = usePlayerStore((s) => s.setUid);
  const pathname = usePathname();

  useEffect(() => {
    initAudio();
  }, []);

  // Calm music in the menus, upbeat music once a game is under way.
  useEffect(() => {
    setMusicTrack(pathname.startsWith('/game') ? 'game' : 'menu');
  }, [pathname]);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    import('../src/supabase/auth').then(({ signInAnon }) =>
      signInAnon().then(setUid).catch(console.error)
    );
  }, [setUid]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
