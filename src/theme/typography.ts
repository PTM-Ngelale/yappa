// Rubik type scale — matches Stitch Vibrant Social design system
//
// fontFamily names the exact loaded static font (see app/_layout.tsx's useFonts) rather than a
// base "Rubik" + fontWeight — non-variable custom fonts commonly ignore fontWeight entirely
// unless the family name itself is the weighted one, silently falling back to the system font.
export const typography = {
  displayLg: {
    fontFamily: 'Rubik_700Bold',
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: -0.96, // -0.02em at 48px
  },
  headlineLg: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 32,
    lineHeight: 40,
  },
  headlineLgMobile: {
    fontFamily: 'Rubik_600SemiBold',
    fontSize: 28,
    lineHeight: 36,
  },
  bodyLg: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 20,
    lineHeight: 30,
  },
  bodyMd: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  labelXl: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: 0.9, // 0.05em at 18px
  },
} as const;
