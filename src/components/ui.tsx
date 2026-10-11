// Building blocks for the "Sticker Party" look: thick outlines with a hard, unblurred drop
// shadow. React Native's own shadows are always blurred (and Android's elevation can't be
// offset), so the shadow is a second shape drawn behind the face, shifted down-right.
import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import type { SoundName } from '../audio/sounds';
import { fonts, radius as radii, type, useTheme } from '../theme';
import { Pressable } from './Pressable';

export const OUTLINE = 3;

type IconName = React.ComponentProps<typeof Feather>['name'];

/** A full-height screen on the theme's ground colour. */
export function Screen({
  children,
  style,
  edges,
  ground,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
  /** Overrides the background (e.g. the coral Round Intro). */
  ground?: string;
}) {
  const p = useTheme();
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: ground ?? p.ground }, style]}>
      {children}
    </SafeAreaView>
  );
}

/** An outlined card with a hard drop shadow. */
export function Sticker({
  children,
  style,
  contentStyle,
  bg,
  shadow,
  radius = radii.lg,
  offset = 4,
}: {
  children?: React.ReactNode;
  /** Outer box — margins, flex, alignment. */
  style?: StyleProp<ViewStyle>;
  /** The card face — padding, layout of children. */
  contentStyle?: StyleProp<ViewStyle>;
  bg?: string;
  /** Shadow colour; defaults to the outline colour. */
  shadow?: string;
  radius?: number;
  offset?: number;
}) {
  const p = useTheme();
  return (
    <View style={[{ paddingRight: offset, paddingBottom: offset }, style]}>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { top: offset, left: offset, borderRadius: radius, backgroundColor: shadow ?? p.line },
        ]}
      />
      <View
        style={[
          { flexGrow: 1, backgroundColor: bg ?? p.card, borderRadius: radius, borderWidth: OUTLINE, borderColor: p.line },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

type Variant = 'coral' | 'card' | 'yellow' | 'blue';

/** The main tappable button: the face sinks into its shadow while pressed. */
export function StickerButton({
  label,
  onPress,
  variant = 'coral',
  disabled = false,
  loading = false,
  icon,
  height = 60,
  fontSize = 21,
  accessibilityLabel,
  sound,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  height?: number;
  fontSize?: number;
  accessibilityLabel?: string;
  sound?: SoundName | false;
  style?: StyleProp<ViewStyle>;
}) {
  const p = useTheme();
  const colours: Record<Variant, [string, string]> = {
    coral: [p.coral, p.onCoral],
    card: [p.card, p.ink],
    yellow: [p.yellow, p.onYellow],
    blue: [p.blue, p.onBlue],
  };
  const [bg, fg] = disabled ? [p.disabled, p.onDisabled] : colours[variant];
  const offset = 4;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      sound={sound}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, busy: loading }}
      style={style}
    >
      {({ pressed }) => (
        <View style={{ paddingRight: offset, paddingBottom: offset }}>
          {!disabled && (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { top: offset, left: offset, borderRadius: radii.lg, backgroundColor: p.line },
              ]}
            />
          )}
          <View
            style={{
              height,
              borderRadius: radii.lg,
              borderWidth: OUTLINE,
              borderColor: p.line,
              backgroundColor: bg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              paddingHorizontal: 18,
              transform: pressed && !disabled ? [{ translateX: offset - 1 }, { translateY: offset - 1 }] : [],
            }}
          >
            {loading ? (
              <ActivityIndicator color={fg} />
            ) : (
              <>
                {icon && <Feather name={icon} size={fontSize + 1} color={fg} />}
                <Text style={{ fontFamily: fonts.black, fontSize, color: fg }} numberOfLines={1}>
                  {label}
                </Text>
              </>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** A square 44px icon button (back, mute toggles). */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  checked,
  muted = false,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'switch';
  checked?: boolean;
  /** Draws the "off" state (used by the mute toggles). */
  muted?: boolean;
}) {
  const p = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      // Size to the button, not the slot it sits in — otherwise the shadow stretches.
      style={{ alignSelf: 'flex-start' }}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={checked === undefined ? undefined : { checked }}
    >
      {({ pressed }) => (
        <View style={{ paddingRight: 3, paddingBottom: 3 }}>
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { top: 3, left: 3, borderRadius: 14, backgroundColor: p.line }]}
          />
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              borderWidth: OUTLINE,
              borderColor: p.line,
              backgroundColor: muted ? p.disabled : p.card,
              alignItems: 'center',
              justifyContent: 'center',
              transform: pressed ? [{ translateX: 2 }, { translateY: 2 }] : [],
            }}
          >
            <Feather name={icon} size={19} color={muted ? p.onDisabled : p.ink} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** A rounded label: round number, role, category. */
export function Pill({
  label,
  bg,
  fg,
  size = 15,
  style,
}: {
  label: string;
  bg?: string;
  fg?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const p = useTheme();
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: bg ?? p.card,
          borderWidth: OUTLINE,
          borderColor: p.line,
          borderRadius: radii.full,
          paddingHorizontal: 13,
          paddingVertical: 4,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: fonts.black, fontSize: size, color: fg ?? p.ink }}>{label}</Text>
    </View>
  );
}

/** Small uppercase section label. */
export function Eyebrow({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const p = useTheme();
  return <Text style={[type.eyebrow, { color: p.ink }, style]}>{children}</Text>;
}

/** A circular player avatar with their initial. */
export function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const p = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: OUTLINE,
        borderColor: p.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.black, fontSize: size * 0.4, color: '#FFFFFF' }}>
        {(name.trim().charAt(0) || '?').toUpperCase()}
      </Text>
    </View>
  );
}
