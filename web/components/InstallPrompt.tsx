'use client';
// Asks a phone visitor to add Yarnz to their home screen when they open a link to it.
// Android browsers hand us an offer to do it (captured early in app/(game)/layout.tsx), so it
// takes one tap; iPhones can't be asked directly, so we show where Add to Home Screen is.
// Never shown on computers, once installed, or mid-game (only on the Home screen), and "Not
// now" keeps it away for a week.
import { usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';

type InstallOffer = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global {
  interface Window {
    __installPrompt?: InstallOffer | null;
  }
}

const DISMISSED_KEY = 'clueline.installDismissedAt';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
/** Gives the game a moment to appear first, and Android its install offer time to arrive. */
const SHOW_AFTER_MS = 2500;

type Kind = 'offer' | 'ios' | 'in-app-ios' | 'android-menu';

function installed(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return !!at && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** What this phone can do, or null on a computer. */
function phoneKind(): Exclude<Kind, 'offer'> | null {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return /FBAN|FBAV|Instagram|Snapchat|Line\/|GSA\//.test(ua) ? 'in-app-ios' : 'ios';
  if (/Android/.test(ua)) return 'android-menu';
  return null;
}

export function InstallPrompt() {
  const pathname = usePathname();
  const [kind, setKind] = useState<Kind | null>(null);
  const [offer, setOffer] = useState<InstallOffer | null>(null);

  useEffect(() => {
    if (pathname !== '/' || installed() || snoozed()) return;
    const phone = phoneKind();
    if (!phone) return;
    const takeOffer = () => {
      if (!window.__installPrompt) return;
      setOffer(window.__installPrompt);
      setKind('offer');
    };
    window.addEventListener('yarnz:installable', takeOffer);
    // No install offer by now (iPhone, an in-app browser, Firefox): show the steps instead.
    const timer = setTimeout(() => {
      if (window.__installPrompt) takeOffer();
      else setKind((k) => k ?? phone);
    }, SHOW_AFTER_MS);
    const onInstalled = () => setKind(null);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('yarnz:installable', takeOffer);
      window.removeEventListener('appinstalled', onInstalled);
    };
    // Once per page load, on Home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!kind || pathname !== '/') return null;

  const close = () => {
    setKind(null);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Private browsing: it'll ask again next time, which is fine.
    }
  };
  const install = async () => {
    if (!offer) return;
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    window.__installPrompt = null;
    if (outcome === 'accepted') setKind(null);
    else close();
  };

  return (
    <div className="install-scrim" onClick={close}>
      <div
        className="install-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        onClick={(e) => e.stopPropagation()}
      >
        <img src="/icons/icon-192.png" alt="" className="install-icon" />
        <h2 id="install-title" className="install-title">
          Add Yarnz to your home screen?
        </h2>
        <p className="install-text">
          Then it’s one tap away, like an app, and opens full screen. It’s free and takes a second.
        </p>
        {kind === 'ios' && (
          <p className="install-steps">
            Tap <strong>Share</strong> <ShareIcon /> at the bottom of the screen, then <strong>Add to Home Screen</strong>.
          </p>
        )}
        {kind === 'in-app-ios' && (
          <p className="install-steps">
            Open this page in <strong>Safari</strong> first, then tap <strong>Share</strong> <ShareIcon /> and{' '}
            <strong>Add to Home Screen</strong>.
          </p>
        )}
        {kind === 'android-menu' && (
          <p className="install-steps">
            Tap the <strong>⋮</strong> menu, then <strong>Add to Home screen</strong> (some phones call it{' '}
            <strong>Install app</strong>). In WhatsApp or Instagram, open the page in Chrome first.
          </p>
        )}
        {kind === 'offer' ? (
          <>
            <button type="button" className="install-button" onClick={install}>
              Add to Home Screen
            </button>
            <button type="button" className="install-later" onClick={close}>
              Not now
            </button>
          </>
        ) : (
          <button type="button" className="install-button" onClick={close}>
            Got it
          </button>
        )}
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg className="install-share" viewBox="0 0 24 24" aria-label="Share icon" role="img">
      <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
