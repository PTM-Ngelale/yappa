// "Sticker Party" palettes — see the Clue Line UI Redesign canvas (Direction A).
// Screens read colours through useTheme() so light and dark follow the phone's setting.

export interface Palette {
  isDark: boolean;
  /** Screen background. */
  ground: string;
  /** Raised cards, inputs and secondary buttons. */
  card: string;
  /** Main text and icons on ground and card. */
  ink: string;
  /** Secondary text on ground and card. */
  muted: string;
  /** Sticker outlines and their hard drop shadows. */
  line: string;
  coral: string;
  onCoral: string;
  blue: string;
  onBlue: string;
  yellow: string;
  onYellow: string;
  /** The secret-word card: the one inverted surface on gameplay screens. */
  hero: string;
  onHero: string;
  /** Small labels on the hero card. */
  heroAccent: string;
  /** Disabled buttons and locked inputs. */
  disabled: string;
  onDisabled: string;
  /** Faint fill for empty/dashed placeholders. */
  ghost: string;
  /** Errors and flagged links. */
  danger: string;
  /** Background behind modal cards. */
  scrim: string;
  /** Row dividers inside cards. */
  divider: string;
}

export const light: Palette = {
  isDark: false,
  ground: '#FFE14D',
  card: '#FFFFFF',
  ink: '#17122B',
  muted: '#5B5470',
  line: '#17122B',
  coral: '#FF5B4A',
  onCoral: '#17122B',
  blue: '#3B5BFF',
  onBlue: '#FFFFFF',
  yellow: '#FFE14D',
  onYellow: '#17122B',
  hero: '#17122B',
  onHero: '#FFFFFF',
  heroAccent: '#FFE14D',
  disabled: '#F4EDC4',
  onDisabled: '#5C5332',
  ghost: 'rgba(255,255,255,0.4)',
  danger: '#B42318',
  scrim: 'rgba(23,18,43,0.88)',
  divider: '#EFE9CF',
};

export const dark: Palette = {
  isDark: true,
  ground: '#17122B',
  card: '#2B2450',
  ink: '#FFF6D6',
  muted: '#C9C2E6',
  line: '#0B0818',
  coral: '#FF5B4A',
  onCoral: '#17122B',
  blue: '#4E6BFF',
  onBlue: '#FFFFFF',
  yellow: '#FFE14D',
  onYellow: '#17122B',
  hero: '#FFE14D',
  onHero: '#17122B',
  heroAccent: '#17122B',
  disabled: '#3A3360',
  onDisabled: '#B9B1DA',
  ghost: 'rgba(255,255,255,0.06)',
  danger: '#FF8A80',
  scrim: 'rgba(11,8,24,0.9)',
  divider: '#3A3360',
};
