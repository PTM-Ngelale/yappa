// Bricolage Grotesque, loaded in app/_layout.tsx. Each weight is its own family name —
// static custom fonts ignore fontWeight, so pick the weight by family instead.
export const fonts = {
  medium: 'BricolageGrotesque_500Medium',
  bold: 'BricolageGrotesque_700Bold',
  black: 'BricolageGrotesque_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: fonts.black, fontSize: 52, lineHeight: 56, letterSpacing: -1.5 },
  title: { fontFamily: fonts.black, fontSize: 30, lineHeight: 34, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.black, fontSize: 22, lineHeight: 26 },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
  bodyBold: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: 'uppercase' as const },
} as const;
