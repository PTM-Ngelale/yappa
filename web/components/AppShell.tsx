'use client';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// The same root layout the Android app uses: fonts, audio, sign-in and the CAPTCHA host.
import RootLayout from '../../app/_layout';
import { PageProvider, RouterBridge } from '../lib/expo-router';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <RouterBridge />
      <PageProvider value={children}>
        <RootLayout />
      </PageProvider>
    </SafeAreaProvider>
  );
}
