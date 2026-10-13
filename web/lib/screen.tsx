'use client';
import dynamic from 'next/dynamic';
import type React from 'react';

/** A shared screen from ../app, loaded in the browser only (it's react-native-web code). */
export function clientScreen(load: () => Promise<{ default: React.ComponentType }>) {
  return dynamic(load, { ssr: false });
}
