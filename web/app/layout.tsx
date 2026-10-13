import type { Viewport } from 'next';
import React from 'react';
import { ClientShell } from '../components/ClientShell';
import './globals.css';

const TITLE = 'Yappa: Word Chain Party Game';
const DESCRIPTION =
  'A fast, loud word-chain party game for three friends. Chain words, lead the guesser to the secret word, beat the clock.';

// Link previews (WhatsApp, X, iMessage) need an absolute image URL. Vercel sets the
// production domain at build time, and switches it if a custom domain is added later.
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://yappa-three.vercel.app';
const OG_IMAGE = `${SITE_URL}/og.png`;
const OG_IMAGE_ALT = 'Yappa: chain words, guess the secret, beat the clock.';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFE14D' },
    { media: '(prefers-color-scheme: dark)', color: '#17122B' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Written out rather than via `metadata`: the pages render in the browser only, and
          Next 15's streamed metadata never reached their HTML. */}
      <head>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta name="application-name" content="Yappa" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Yappa" />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={OG_IMAGE_ALT} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta name="twitter:image:alt" content={OG_IMAGE_ALT} />
        {/* Installable: "Add to Home Screen" opens it full screen with the Yappa icon. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Yappa" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <noscript>You need to enable JavaScript to play Yappa.</noscript>
        <div id="root">
          <ClientShell>{children}</ClientShell>
        </div>
      </body>
    </html>
  );
}
