import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORIES, categoriesOn } from '../game/categories';
import { fonts, spacing, type, useStyles, useTheme, type Palette } from '../theme';
import { CategoryIcon, CategoryName } from './CategoryName';
import { CategoryPicker } from './CategoryPicker';
import { Pressable } from './Pressable';
import { IconButton, Screen, Sticker, StickerButton } from './ui';

/**
 * The categories, summed up in one row (all of them, or which ones), with a button that opens
 * the full-screen picker.
 */
export function CategorySummary({
  pick,
  onPress,
  disabled = false,
}: {
  pick: readonly string[] | null | undefined;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const p = useTheme();
  const on = categoriesOn(pick);
  // With most of them on, naming the few that are off is shorter.
  const off = CATEGORIES.filter((c) => !on.includes(c));
  const all = on.length === CATEGORIES.length;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Categories: ${all ? `all ${CATEGORIES.length}` : on.join(', ')}. Change categories`}
    >
      <Sticker radius={20} offset={4} contentStyle={styles.summary}>
        <View style={styles.summaryText}>
          <Text style={styles.summaryTitle}>{all ? `All ${CATEGORIES.length} categories` : `${on.length} of ${CATEGORIES.length} categories`}</Text>
          {all ? (
            <View style={styles.summaryIcons}>
              {on.map((c) => (
                <CategoryIcon key={c} category={c} size={17} color={p.muted} />
              ))}
            </View>
          ) : (
            <View style={styles.summaryNames}>
              {off.length < on.length && <Text style={styles.summaryList}>Without</Text>}
              {(off.length < on.length ? off : on).map((c) => (
                <CategoryName key={c} category={c} style={styles.summaryList} iconScale={1.1} />
              ))}
            </View>
          )}
        </View>
        <View style={[styles.change, disabled && styles.changeOff]}>
          <Text style={styles.changeText}>Change</Text>
          <Feather name="chevron-right" size={18} color={p.ink} />
        </View>
      </Sticker>
    </Pressable>
  );
}

/**
 * Picking categories, on a screen of its own. Changes are kept only when they tap Done;
 * the X (or Android back) leaves without them. `onDone` may be async (the lobby saves to the
 * server): the screen waits for it and stays open, showing `error`, if it fails.
 */
export function CategoryScreen({
  visible,
  pick,
  onDone,
  onClose,
  note,
  error,
}: {
  visible: boolean;
  pick: readonly string[] | null | undefined;
  onDone: (pick: string[] | null) => void | Promise<boolean>;
  onClose: () => void;
  /** A line under the title: who sees the pick, or what it's for. */
  note?: string;
  error?: string;
}) {
  const styles = useStyles(makeStyles);
  const [draft, setDraft] = useState<string[] | null>(pick ? [...pick] : null);
  const [saving, setSaving] = useState(false);

  // Each time it opens, start from what's saved.
  useEffect(() => {
    if (visible) setDraft(pick ? [...pick] : null);
    // Only on opening: a change made elsewhere while it's open shouldn't wipe their picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function done() {
    setSaving(true);
    try {
      const ok = await onDone(draft);
      if (ok !== false) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Screen>
        <View style={styles.column}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">Categories</Text>
          <IconButton icon="x" onPress={onClose} accessibilityLabel="Close without saving" />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <CategoryPicker pick={draft} onChange={setDraft} disabled={saving} />
        </ScrollView>
        <View style={styles.footer}>
          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          ) : null}
          <StickerButton label="Done" icon="check" variant="blue" loading={saving} onPress={done} />
        </View>
        </View>
      </Screen>
    </Modal>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    summary: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
    summaryText: { flex: 1, gap: 2 },
    summaryTitle: { fontFamily: fonts.black, fontSize: 18, color: p.ink },
    summaryList: { ...type.small, color: p.muted },
    summaryIcons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2 },
    summaryNames: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
    change: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    changeOff: { opacity: 0.4 },
    changeText: { fontFamily: fonts.bold, fontSize: 15, color: p.ink },
    // On a wide browser window, keep to the app's column rather than the whole window.
    column: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.screen,
      paddingTop: 12,
      paddingBottom: 4,
    },
    title: { fontFamily: fonts.black, fontSize: 30, color: p.ink },
    body: { paddingHorizontal: spacing.screen, paddingTop: 8, paddingBottom: 16, gap: 14 },
    note: { ...type.body, color: p.ink },
    footer: { paddingHorizontal: spacing.screen, paddingTop: 10, paddingBottom: 14, gap: 8 },
    error: { ...type.bodyBold, color: p.danger, textAlign: 'center' },
  });
