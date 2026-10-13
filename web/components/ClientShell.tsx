'use client';
import dynamic from 'next/dynamic';
import React from 'react';

// The game is React Native code (react-native-web): it needs the browser, so it isn't
// server-rendered. The page shell, title and metadata still are.
const AppShell = dynamic(() => import('./AppShell'), { ssr: false });

export function ClientShell({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
