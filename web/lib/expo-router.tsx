'use client';
// Stands in for `expo-router` in the Next.js build (aliased in next.config.mjs), so the
// shared screens in ../app keep calling router.push / useLocalSearchParams / <Redirect>
// exactly as they do on Android. Only what the app actually uses is implemented.
import {
  useParams,
  usePathname as useNextPathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import React, { createContext, useContext, useEffect } from 'react';

type Href = string | { pathname: string; params?: Record<string, string | undefined> };

function toUrl(href: Href): string {
  if (typeof href === 'string') return href;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(href.params ?? {})) {
    if (value != null && value !== '') query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${href.pathname}?${qs}` : href.pathname;
}

type NextRouter = ReturnType<typeof useRouter>;
let nextRouter: NextRouter | null = null;

/** Mounted once in the root layout: hands Next's router to the module-level `router`. */
export function RouterBridge() {
  nextRouter = useRouter();
  return null;
}

export const router = {
  push(href: Href) {
    nextRouter?.push(toUrl(href));
  },
  replace(href: Href) {
    nextRouter?.replace(toUrl(href));
  },
  back() {
    nextRouter?.back();
  },
  canGoBack(): boolean {
    // Next keeps its own index in history.state; anything after the first entry can go back.
    return typeof window !== 'undefined' && window.history.length > 1;
  },
};

/** Path params (/join/[code]) merged with the query string (/?room=ABCD), like expo-router. */
export function useLocalSearchParams<T extends Record<string, string | undefined>>(): Partial<T> {
  const params = useParams() ?? {};
  const search = useSearchParams();
  const merged: Record<string, string> = {};
  search?.forEach((value, key) => {
    merged[key] = value;
  });
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first != null) merged[key] = first;
  }
  return merged as Partial<T>;
}

export function usePathname(): string {
  return useNextPathname() ?? '/';
}

export function Redirect({ href }: { href: Href }) {
  useEffect(() => {
    router.replace(href);
  }, [href]);
  return null;
}

// The Expo root layout renders <Stack />; in Next the current page is passed in instead.
const PageContext = createContext<React.ReactNode>(null);
export const PageProvider = PageContext.Provider;

export function Stack(_props: { screenOptions?: unknown }) {
  return <>{useContext(PageContext)}</>;
}

export type ErrorBoundaryProps = { error: Error; retry: () => Promise<void> };
