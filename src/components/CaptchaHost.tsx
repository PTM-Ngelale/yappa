// Cloudflare Turnstile for Supabase's anonymous sign-in. Turnstile has no React Native SDK,
// so a WebView loads docs/captcha.html (GitHub Pages — its hostname is the one the widget
// allows) and posts the token back. The WebView stays invisible unless Turnstile wants the
// player to tap, which is rare; usually this finishes in a second or two with nothing shown.
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { fonts, spacing, type, useStyles, type Palette } from '../theme';
import { Sticker } from './ui';

const CAPTCHA_URL = 'https://ptm-ngelale.github.io/yappa/captcha.html';
const TIMEOUT_MS = 30000;

type Pending = { id: number; resolve: (token: string) => void; reject: (e: Error) => void };

let pending: Pending | null = null;
let nextId = 1;
let notifyHost: ((p: Pending | null) => void) | null = null;

/**
 * Gets a Turnstile token from <CaptchaHost /> (mounted in app/_layout.tsx). If the host hasn't
 * mounted yet (the app signs in while fonts are still loading) the request waits for it.
 * Rejects if the check fails or takes longer than 30s, and always on web (no WebView there).
 */
export function requestCaptchaToken(): Promise<string> {
  if (Platform.OS === 'web') return Promise.reject(new Error('captcha not supported on web'));
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

export function CaptchaHost() {
  const styles = useStyles(makeStyles);
  const [request, setRequest] = useState<Pending | null>(null);
  const [interactive, setInteractive] = useState(false);

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

  if (!request || Platform.OS === 'web') return null;

  function onMessage(e: WebViewMessageEvent) {
    if (!request) return;
    let msg: { type?: string; token?: string; code?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'interactive') setInteractive(true);
    else if (msg.type === 'token' && msg.token) finish(request.id, msg.token);
    else if (msg.type === 'error') finish(request.id, new Error(`captcha failed (${msg.code ?? 'unknown'})`));
  }

  // One WebView for the whole check; only its container's style changes, so showing it for
  // a tap doesn't reload the page.
  return (
    <View
      style={interactive ? styles.overlay : styles.hidden}
      pointerEvents={interactive ? 'auto' : 'none'}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
    >
      <Sticker radius={24} offset={6} style={styles.cardWrap} contentStyle={styles.card}>
        {interactive && (
          <>
            <Text style={styles.title} accessibilityRole="header">Quick check</Text>
            <Text style={styles.body}>Tap the box so we know you’re a real player.</Text>
          </>
        )}
        <WebView
          key={request.id}
          source={{ uri: CAPTCHA_URL }}
          onMessage={onMessage}
          onError={(e) => finish(request.id, new Error(`captcha page failed to load (${e.nativeEvent.description})`))}
          onHttpError={(e) => finish(request.id, new Error(`captcha page failed to load (HTTP ${e.nativeEvent.statusCode})`))}
          style={styles.webview}
          originWhitelist={['https://*']}
          javaScriptEnabled
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          backgroundColor="transparent"
        />
      </Sticker>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    // Laid out (so the page runs) but invisible and untouchable.
    hidden: { position: 'absolute', left: 0, top: 0, width: 320, height: 90, opacity: 0 },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: p.scrim,
      justifyContent: 'center',
      padding: spacing.screen,
    },
    cardWrap: { alignSelf: 'stretch' },
    card: { padding: 18, gap: 8 },
    title: { fontFamily: fonts.black, fontSize: 24, color: p.ink },
    body: { ...type.body, color: p.ink },
    webview: { height: 80, backgroundColor: 'transparent' },
  });
