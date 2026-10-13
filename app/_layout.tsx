import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import '../global.css';
import { CaptchaHost } from '../src/components/CaptchaHost';
import { initAudio, setMusicTrack } from '../src/audio/sounds';
import { SUPABASE_CONFIGURED } from '../src/supabase/config';
import { useTheme } from '../src/theme';
import { usePlayerStore } from '../src/store/playerStore';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  const p = useTheme();

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

  // On web, font loading gives up after ~6s on a slow connection; carry on with the fallback
  // fonts rather than spinning forever. (Native loads them from the app bundle.)
  if (!fontsLoaded && !(Platform.OS === 'web' && fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.ground }}>
        <ActivityIndicator color={p.ink} size="large" />
      </View>
    );
  }

  return (
    <>
      {/* "auto" = dark icons on the light theme's yellow, light icons in dark mode. */}
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: p.ground } }} />
      <CaptchaHost />
    </>
  );
}
