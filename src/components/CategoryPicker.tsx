import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CATEGORIES, categoriesOn, categoryLabel, MIN_CATEGORIES, toggleCategory } from '../game/categories';
import { fonts, radius, type, useStyles, useTheme, type Palette } from '../theme';
import { Pressable } from './Pressable';

/**
 * The word categories as chips to switch on and off. `pick` null means every category.
 * Without `onChange` it only shows the pick (players other than the host, in the lobby).
 */
export function CategoryPicker({
  pick,
  onChange,
  disabled = false,
}: {
  pick: readonly string[] | null | undefined;
  onChange?: (pick: string[] | null) => void;
  disabled?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const on = categoriesOn(pick);
  // Shown after trying to switch off one too many.
  const [atMinimum, setAtMinimum] = useState(false);

  function toggle(category: string) {
    if (!onChange) return;
    if (on.includes(category) && on.length <= MIN_CATEGORIES) {
      setAtMinimum(true);
      return;
    }
    setAtMinimum(false);
    onChange(toggleCategory(pick, category));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.chips} accessibilityLabel={onChange ? 'Categories' : `Categories: ${on.join(', ')}`}>
        {CATEGORIES.map((c) => {
          const selected = on.includes(c);
          const chip = (
            <View style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}>
              <Feather name={selected ? 'check' : 'plus'} size={14} color={selected ? p.onBlue : p.muted} />
              <Text style={[styles.chipText, { color: selected ? p.onBlue : p.muted }]}>{categoryLabel(c)}</Text>
            </View>
          );
          if (!onChange) return selected ? <View key={c}>{chip}</View> : null;
          return (
            <Pressable
              key={c}
              onPress={() => toggle(c)}
              disabled={disabled}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={c}
            >
              {chip}
            </Pressable>
          );
        })}
      </View>
      {onChange && (
        <View style={styles.footer}>
          <Text style={[styles.note, atMinimum && { color: p.danger }]} accessibilityLiveRegion="polite">
            {atMinimum
              ? `Keep at least ${MIN_CATEGORIES} on`
              : on.length === CATEGORIES.length
                ? 'All categories on'
                : `${on.length} of ${CATEGORIES.length} on`}
          </Text>
          {on.length < CATEGORIES.length && (
            <Pressable
              onPress={() => {
                setAtMinimum(false);
                onChange(null);
              }}
              disabled={disabled}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.all}>Turn all on</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 2.5,
      borderColor: p.line,
      borderRadius: radius.full,
      paddingLeft: 10,
      paddingRight: 13,
      paddingVertical: 6,
    },
    chipOn: { backgroundColor: p.blue },
    chipOff: { backgroundColor: p.card, borderStyle: 'dashed' },
    chipText: { fontFamily: fonts.bold, fontSize: 15 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    note: { ...type.small, color: p.muted },
    all: { fontFamily: fonts.bold, fontSize: 14, color: p.ink, textDecorationLine: 'underline' },
  });
