import type { Viewport } from 'next';
import React from 'react';
import { ClientShell } from '../components/ClientShell';
import './globals.css';

const TITLE = 'Yappa: Word Chain Party Game';
const DESCRIPTION =
  'A fast, loud word-chain party game for three friends. Chain words, lead the guesser to the secret word, beat the clock.';

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
