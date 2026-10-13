// Web version of CaptchaHost: Cloudflare Turnstile runs directly in the page, so there's no
// WebView or docs/captcha.html here. Same API as CaptchaHost.tsx. The widget only allows the
// hostnames listed for it in Cloudflare, so the web app's domain (and localhost, to test)
// must be added there.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, type, useStyles, type Palette } from '../theme';
import { Sticker } from './ui';

const SITE_KEY = '0x4AAAAAAFUXaXeARxw6jnqw';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 30000;

type Turnstile = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

type Pending = { id: number; resolve: (token: string) => void; reject: (e: Error) => void };

let pending: Pending | null = null;
let nextId = 1;
let notifyHost: ((p: Pending | null) => void) | null = null;

/** Gets a Turnstile token from <CaptchaHost /> (mounted in app/_layout.tsx). */
export function requestCaptchaToken(): Promise<string> {
  if (pending) pending.reject(new Error('superseded'));
  return new Promise<string>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => finish(id, new Error('captcha timed out')), TIMEOUT_MS);
    pending = {
      id,
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
          'before-interactive-callback': () => setInteractive(true),
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

  if (!request) return null;

  return (
    <View
      style={interactive ? styles.overlay : styles.hidden}
      pointerEvents={interactive ? 'auto' : 'none'}
      aria-hidden={!interactive}
    >
      <Sticker radius={24} offset={6} style={styles.cardWrap} contentStyle={styles.card}>
        {interactive && (
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
