// Web version of PoweredBy: a plain link and <img>, so the browser picks the sharpest logo
// (srcSet) and lazy-loads it. Same look as the app's version.
import React from 'react';
import { Text, useColorScheme } from 'react-native';
import { useStyles } from '../theme';
import { LOGO_HEIGHT, LOGO_WIDTH, NANOTEK_URL, makeStyles } from './poweredByShared';

// webpack turns these into URLs (web/next.config.mjs).
const LOGO_180: string = require('../../assets/nanotek-logo-180.webp');
const LOGO_360: string = require('../../assets/nanotek-logo-360.webp');

export function PoweredBy() {
  const styles = useStyles(makeStyles);
  // The logo is dark navy: on the dark theme, draw it light so it stays visible.
  const dark = useColorScheme() === 'dark';
  return (
    <a
      href={NANOTEK_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Powered by Nanotek (opens in a new tab)"
      style={{
        display: 'flex',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 8,
        padding: '8px 12px',
        textDecoration: 'none',
      }}
    >
      <Text style={styles.label}>Powered by</Text>
      <img
        src={LOGO_360}
        srcSet={`${LOGO_180} 180w, ${LOGO_360} 360w`}
        sizes={`${LOGO_WIDTH}px`}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        alt="Nanotek"
        loading="lazy"
        decoding="async"
        style={dark ? { filter: 'brightness(0) invert(0.92)' } : undefined}
      />
    </a>
  );
}
