import React from 'react';
import { Image, Linking, Text, useColorScheme } from 'react-native';
import { useStyles, useTheme } from '../theme';
import { Pressable } from './Pressable';
import { LOGO_HEIGHT, LOGO_WIDTH, NANOTEK_URL, makeStyles } from './poweredByShared';

// The web version (PoweredBy.web.tsx) uses a plain <img> instead.
const LOGO = require('../../assets/nanotek-logo-360.webp');

/** A small "Powered by Nanotek" credit that opens the Nanotek site. */
export function PoweredBy() {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  // The logo is dark navy: on the dark theme it's drawn in the ink colour so it stays visible.
  const dark = useColorScheme() === 'dark';
  return (
    <Pressable
      onPress={() => Linking.openURL(NANOTEK_URL)}
      accessibilityRole="link"
      accessibilityLabel="Powered by Nanotek, opens in your browser"
      style={styles.credit}
    >
      <Text style={styles.label}>Powered by</Text>
      <Image
        source={LOGO}
        style={{ width: LOGO_WIDTH, height: LOGO_HEIGHT }}
        tintColor={dark ? p.ink : undefined}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </Pressable>
  );
}
