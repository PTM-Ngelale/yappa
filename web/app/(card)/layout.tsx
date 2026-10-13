// Root layout for share-card pages (/c/[id]). Plain server-rendered HTML: no game shell, and
// none of the game's own link-preview tags, so each card's preview is its own.
import type { Viewport } from 'next';
import React from 'react';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFE14D',
};

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&display=swap"
        />
      </head>
      <body style={{ margin: 0, background: '#FFE14D', color: '#17122B', fontFamily: '"Bricolage Grotesque", system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
