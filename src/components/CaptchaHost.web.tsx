// Web version of CaptchaHost: Cloudflare Turnstile runs directly in the page, so there's no
// WebView or docs/captcha.html here. Same API as CaptchaHost.tsx. The widget only allows the
// hostnames listed for it in Cloudflare, so the web app's domain (and localhost, to test)
// must be added there.
import { usePathname } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { isSoloPath } from '../game/solo';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, type, useStyles, type Palette } from '../theme';
import { Sticker } from './ui';

const SITE_KEY = '0x4AAAAAAFUXaXeARxw6jnqw';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Turnstile usually answers in a second or two; sign-in retries a check that doesn't (see
// auth.ts). Once the player is shown the box to tap, give them longer.
const TIMEOUT_MS = 20000;
const INTERACTIVE_TIMEOUT_MS = 120000;

type Turnstile = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

type Pending = {
  id: number;
  resolve: (token: string) => void;
  reject: (e: Error) => void;
  /** Restarts the timeout with more time, for a player who has the box to tap. */
  wait: (ms: number) => void;
};

let pending: Pending | null = null;
let nextId = 1;
let notifyHost: ((p: Pending | null) => void) | null = null;

/** Gets a Turnstile token from <CaptchaHost /> (mounted in app/_layout.tsx). */
export function requestCaptchaToken(): Promise<string> {
  if (pending) pending.reject(new Error('superseded'));
  return new Promise<string>((resolve, reject) => {
    const id = nextId++;
    let timer: ReturnType<typeof setTimeout>;
    const wait = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(id, new Error('captcha timed out')), ms);
    };
    wait(TIMEOUT_MS);
    pending = {
      id,
      wait,
      resolve: (token) => {
        clearTimeout(timer);
        resolve(token);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    };
    notifyHost?.(pending);
  });
}

function finish(id: number, result: string | Error) {
  if (!pending || pending.id !== id) return;
  const p = pending;
  pending = null;
  notifyHost?.(null);
  if (typeof result === 'string') p.resolve(result);
  else p.reject(result);
}

let scriptLoad: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  scriptLoad ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('script-not-loaded'));
    script.onerror = () => {
      scriptLoad = null; // let the next attempt try again
      reject(new Error('script-not-loaded'));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

export function CaptchaHost() {
  const styles = useStyles(makeStyles);
  const [request, setRequest] = useState<Pending | null>(null);
  const [interactive, setInteractive] = useState(false);
  const widgetRef = useRef<View>(null);

  useEffect(() => {
    notifyHost = (p) => {
      setRequest(p);
      setInteractive(false);
    };
    if (pending) notifyHost(pending); // a request made before this mounted
    return () => {
      notifyHost = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    const id = request.id;
    let widgetId: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        // On web a View's ref is its DOM element.
        const el = widgetRef.current as unknown as HTMLElement | null;
        if (cancelled || !el) return;
        widgetId = turnstile.render(el, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only',
          // The normal widget is a fixed 300px, wider than the card on small phones.
          size: window.innerWidth < 380 ? 'compact' : 'normal',
          'before-interactive-callback': () => {
            setInteractive(true);
            if (pending?.id === id) pending.wait(INTERACTIVE_TIMEOUT_MS);
          },
          callback: (token: string) => finish(id, token),
          'error-callback': (code: string) => {
            finish(id, new Error(`captcha failed (${code})`));
            return true;
          },
          'expired-callback': () => finish(id, new Error('captcha failed (expired)')),
          'timeout-callback': () => finish(id, new Error('captcha failed (timeout)')),
        });
      })
      .catch((e: Error) => finish(id, new Error(`captcha failed (${e.message})`)));
    return () => {
      cancelled = true;
      if (widgetId) window.turnstile?.remove(widgetId);
    };
  }, [request]);

  // Solo never signs in, so the box stays out of its way (its clue clock would run on behind
  // it). The check waits for them back on Home; if it times out first, Create, Join and Play
  // online ask again.
  // usePathname() first, on every render: hooks can't sit behind the && short-circuit.
  const pathname = usePathname();
  const shown = interactive && !isSoloPath(pathname);

  if (!request) return null;

  return (
    <View
      style={shown ? styles.overlay : styles.hidden}
      pointerEvents={shown ? 'auto' : 'none'}
      aria-hidden={!shown}
    >
      <Sticker radius={24} offset={6} style={styles.cardWrap} contentStyle={styles.card}>
        {shown && (
          <>
            <Text style={styles.title} accessibilityRole="header">Quick check</Text>
            <Text style={styles.body}>Tap the box so we know you’re a real player.</Text>
          </>
        )}
        <View ref={widgetRef} style={styles.widget} />
      </Sticker>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    // Laid out (so the widget runs) but invisible and untouchable.
    hidden: { position: 'absolute', left: 0, top: 0, width: 320, height: 90, opacity: 0 },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: p.scrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.screen,
    },
    cardWrap: { alignSelf: 'stretch', maxWidth: 420, width: '100%', marginHorizontal: 'auto' },
    card: { padding: 18, gap: 8 },
    title: { fontFamily: fonts.black, fontSize: 24, color: p.ink },
    body: { ...type.body, color: p.ink },
    widget: { minHeight: 70, alignItems: 'center', justifyContent: 'center' },
  });
