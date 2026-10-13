// Shared by PoweredBy.tsx (app) and PoweredBy.web.tsx (web).
import { StyleSheet } from 'react-native';
import { fonts, type Palette } from '../theme';

export const NANOTEK_URL = 'https://nanotekai.vercel.app/';
/** The logo is 360x76; shown at about half size so it stays sharp on 2x screens. */
export const LOGO_WIDTH = 85;
export const LOGO_HEIGHT = Math.round((LOGO_WIDTH * 76) / 360);

export const makeStyles = (p: Palette) =>
  StyleSheet.create({
    credit: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    label: { fontFamily: fonts.bold, fontSize: 13, color: p.muted },
  });
