import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './palette';

export { fonts, type } from './fonts';
export { spacing, radius } from './spacing';
export type { Palette } from './palette';

/** The palette for the phone's current light/dark setting. */
export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Builds a component's styles from the current palette, rebuilt only when it changes. */
export function useStyles<T>(make: (p: Palette) => T): T {
  const p = useTheme();
  // `make` is a module-level function in every caller, so the palette is the only input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => make(p), [p]);
}
