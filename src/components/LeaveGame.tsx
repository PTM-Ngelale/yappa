// Leaving a game in progress. Yappa needs all three players, so leaving ends the game for
// everyone. The game screens get the button through context (set in app/game/round.tsx), so
// each header can show it without threading a prop through every screen.
import React, { createContext, useContext } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, type, useStyles, type Palette } from '../theme';
import { Pressable } from './Pressable';
import { IconButton, Sticker, StickerButton } from './ui';

/** Opens the "Leave the game?" dialog; null outside a game in progress. */
export const LeaveGameContext = createContext<(() => void) | null>(null);

/** The header's leave button. Renders nothing outside a game in progress. */
export function LeaveGameButton() {
  const onLeave = useContext(LeaveGameContext);
  if (!onLeave) return null;
  return <IconButton icon="x" onPress={onLeave} accessibilityLabel="Leave game" />;
}

export function LeaveGameDialog({
  visible,
  onLeave,
  onStay,
}: {
  visible: boolean;
  onLeave: () => void;
  onStay: () => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onStay} statusBarTranslucent>
      <View style={styles.scrim}>
        <Sticker radius={24} offset={6} style={styles.stretch} contentStyle={styles.card}>
          <Text style={styles.title} accessibilityRole="header">Leave the game?</Text>
          <Text style={styles.body}>Yappa needs all three players, so the game ends for everyone.</Text>
          <StickerButton label="Leave game" icon="log-out" height={56} fontSize={19} onPress={onLeave} />
          <Pressable onPress={onStay} accessibilityRole="button" style={styles.stay}>
            <Text style={styles.stayText}>Keep playing</Text>
          </Pressable>
        </Sticker>
      </View>
    </Modal>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: p.scrim, justifyContent: 'center', padding: spacing.screen },
    stretch: { alignSelf: 'stretch' },
    card: { padding: 20, gap: 12 },
    title: { fontFamily: fonts.black, fontSize: 26, color: p.ink },
    body: { ...type.body, color: p.ink },
    stay: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
    stayText: { fontFamily: fonts.bold, fontSize: 16, color: p.muted },
  });
