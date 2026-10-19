import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  CATEGORIES,
  categoriesOn,
  MIN_CATEGORIES,
  NEW_CATEGORIES,
  toggleCategory,
} from '../game/categories';
import { fonts, radius, type, useStyles, useTheme, type Palette } from '../theme';
import { CategoryIcon, CategoryName } from './CategoryName';
import { Pressable } from './Pressable';
import { OUTLINE } from './ui';

const COLUMNS = 3;
const GAP = 8;

/**
 * The word categories to switch on and off, as a grid of tiles. `pick` null means every
 * category. Without `onChange` it only lists what's on (players other than the host, in the
 * lobby), as small chips.
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
  const all = on.length === CATEGORIES.length;
  // Shown after trying to switch off one too many.
  const [atMinimum, setAtMinimum] = useState(false);
  // Tiles share the row evenly, so the last row lines up with the rest.
  const [width, setWidth] = useState(0);
  const tileWidth = width ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : undefined;

  if (!onChange) {
    return (
      <View style={styles.chips} accessible accessibilityLabel={`Categories: ${all ? 'all of them' : on.join(', ')}`}>
        {all ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>All {CATEGORIES.length} categories</Text>
          </View>
        ) : (
          on.map((c) => (
            <View key={c} style={styles.chip}>
              <CategoryName category={c} style={styles.chipText} iconScale={1} />
            </View>
          ))
        )}
      </View>
    );
  }

  function toggle(category: string) {
    if (on.includes(category) && on.length <= MIN_CATEGORIES) {
      setAtMinimum(true);
      return;
    }
    setAtMinimum(false);
    onChange!(toggleCategory(pick, category));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.count, atMinimum && { color: p.danger }]} accessibilityLiveRegion="polite">
          {atMinimum ? `Keep at least ${MIN_CATEGORIES} on` : all ? 'All categories on' : `${on.length} of ${CATEGORIES.length} on`}
        </Text>
        <Pressable
          onPress={() => {
            setAtMinimum(false);
            onChange(null);
          }}
          disabled={disabled || all}
          accessibilityRole="button"
          accessibilityLabel="Turn every category on"
          hitSlop={8}
          style={[styles.allButton, (disabled || all) && styles.allButtonOff]}
        >
          <Feather name="check-square" size={14} color={p.ink} />
          <Text style={styles.allText}>All</Text>
        </Pressable>
      </View>

      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityLabel="Categories">
        {CATEGORIES.map((c) => {
          const selected = on.includes(c);
          return (
            <Pressable
              key={c}
              onPress={() => toggle(c)}
              disabled={disabled}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={`${c}${NEW_CATEGORIES.includes(c) ? ', new' : ''}`}
              style={{ width: tileWidth, flexGrow: tileWidth ? 0 : 1, flexBasis: tileWidth ? undefined : '30%' }}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.tile,
                    selected ? styles.tileOn : styles.tileOff,
                    pressed && !disabled && styles.tilePressed,
                  ]}
                >
                  <View style={[styles.tick, selected ? styles.tickOn : styles.tickOff]}>
                    {selected && <Feather name="check" size={12} color={p.blue} />}
                  </View>
                  {NEW_CATEGORIES.includes(c) && (
                    <View style={styles.newTag}>
                      <Text style={styles.newText}>New</Text>
                    </View>
                  )}
                  <CategoryIcon category={c} size={30} color={selected ? p.onBlue : p.muted} />
                  <Text
                    style={[styles.name, { color: selected ? p.onBlue : p.muted }]}
                    numberOfLines={2}
                    maxFontSizeMultiplier={1.2}
                  >
                    {c}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    count: { ...type.bodyBold, color: p.ink },
    allButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 2,
      borderColor: p.line,
      borderRadius: radius.full,
      backgroundColor: p.card,
      paddingHorizontal: 11,
      paddingVertical: 4,
    },
    allButtonOff: { opacity: 0.4 },
    allText: { fontFamily: fonts.bold, fontSize: 14, color: p.ink },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    tile: {
      height: 92,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 6,
      borderWidth: OUTLINE,
      borderColor: p.line,
      borderRadius: radius.md,
    },
    tileOn: { backgroundColor: p.blue },
    tileOff: { backgroundColor: p.card, borderStyle: 'dashed' },
    tilePressed: { transform: [{ scale: 0.96 }] },
    tick: {
      position: 'absolute',
      top: 6,
      left: 6,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tickOn: { backgroundColor: p.onBlue },
    tickOff: { borderWidth: 2, borderColor: p.muted },
    newTag: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: p.yellow,
      borderWidth: 1.5,
      borderColor: p.line,
      borderRadius: radius.full,
      paddingHorizontal: 5,
    },
    newText: { fontFamily: fonts.black, fontSize: 10, color: p.onYellow, textTransform: 'uppercase' },
    name: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 16, textAlign: 'center' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      borderWidth: 2,
      borderColor: p.line,
      borderRadius: radius.full,
      backgroundColor: p.card,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    chipText: { fontFamily: fonts.bold, fontSize: 14, color: p.ink },
  });
