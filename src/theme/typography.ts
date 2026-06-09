// Rubik type scale — matches Stitch Vibrant Social design system
export const typography = {
  displayLg: {
    fontFamily: 'Rubik',
    fontSize: 48,
    fontWeight: '700' as const,
    lineHeight: 56,
    letterSpacing: -0.96, // -0.02em at 48px
  },
  headlineLg: {
    fontFamily: 'Rubik',
    fontSize: 32,
    fontWeight: '600' as const,
    lineHeight: 40,
  },
  headlineLgMobile: {
    fontFamily: 'Rubik',
    fontSize: 28,
    fontWeight: '600' as const,
    lineHeight: 36,
  },
  bodyLg: {
    fontFamily: 'Rubik',
    fontSize: 20,
    fontWeight: '400' as const,
    lineHeight: 30,
  },
  bodyMd: {
    fontFamily: 'Rubik',
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  labelXl: {
    fontFamily: 'Rubik',
    fontSize: 18,
    fontWeight: '500' as const,
    lineHeight: 22,
    letterSpacing: 0.9, // 0.05em at 18px
  },
} as const;
