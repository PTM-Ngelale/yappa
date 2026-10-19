import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { categoryIcon } from '../game/categories';

/** A category's icon on its own. Renders nothing for a category the app doesn't know yet. */
export function CategoryIcon({ category, size, color }: { category: string; size: number; color: string }) {
  const name = categoryIcon(category);
  return name ? <MaterialCommunityIcons name={name} size={size} color={color} /> : null;
}

/**
 * A category's icon followed by its name, the icon sized and coloured to match `style`'s
 * text. Extra Text props (numberOfLines, adjustsFontSizeToFit) go to the name.
 */
export function CategoryName({
  category,
  style,
  containerStyle,
  iconScale = 0.9,
  ...textProps
}: {
  category: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  /** Icon size as a share of the text's font size. */
  iconScale?: number;
} & Omit<TextProps, 'style' | 'children'>) {
  const flat = StyleSheet.flatten(style) ?? {};
  const size = Math.round((flat.fontSize ?? 16) * iconScale);
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: Math.round(size * 0.3), maxWidth: '100%' }, containerStyle]}
      accessible
      accessibilityLabel={category}
    >
      <CategoryIcon category={category} size={size} color={(flat.color as string) ?? '#000'} />
      <Text style={[style, { flexShrink: 1 }]} {...textProps}>
        {category}
      </Text>
    </View>
  );
}
