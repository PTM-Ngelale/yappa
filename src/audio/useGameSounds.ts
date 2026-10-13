import { useEffect, useRef } from 'react';
import type { RoomData } from '../supabase/room';
import { playSound } from './sounds';

/** Seconds left in the round at which the countdown starts ticking. */
const TICK_FROM_SECONDS = 5;

/**
 * Plays sounds for game events as the room changes: a new round, a word or guess landing in
 * the feed, your turn coming round, the round's last seconds ticking, and each round's
 * result. Every device derives these from the same room state, so everyone hears the same
 * cues. `roundSeconds` is this device's round clock (see useRoundClocks).
 */
export function useGameSounds(roomData: RoomData | null, uid: string | null, roundSeconds: number) {
  const prev = useRef<{ status: string; round: number; feedLength: number; activeKnowerUid: string } | null>(null);

  const status = roomData?.status;
  const round = roomData?.round ?? 0;
  const feed = roomData?.feed ?? [];
  const feedLength = feed.length;
  const lastKind = feed[feedLength - 1]?.kind;
  const activeKnowerUid = roomData?.activeKnowerUid ?? '';

  useEffect(() => {
    if (!roomData || !status) return;
    const before = prev.current;
    prev.current = { status, round, feedLength, activeKnowerUid };

    const newRound = status === 'playing' && (before?.status !== 'playing' || before.round !== round);
    if (newRound) {
      playSound('roundStart');
      return;
    }

    if (status === 'playing' && before) {
      if (feedLength > before.feedLength) {
        // The turn just came to me: a chime says "you're up". A wrong guess buzzes; a word pops.
        if (activeKnowerUid === uid && before.activeKnowerUid !== uid) playSound('yourTurn');
        else if (lastKind === 'guess') playSound('error');
        else playSound('pop');
      }
      return;
    }

    if (status === 'resolution' && before?.status === 'playing') {
      const entry = roomData.history?.[String(round)];
      playSound(entry?.outcome === 'won' ? 'win' : 'lose');
      return;
    }

    if (status === 'gameover' && before && before.status !== 'gameover') {
      playSound('gameOver');
    }
    // `roomData` itself is read only for the latest history entry when the status flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, round, feedLength, activeKnowerUid, uid]);

  // Countdown ticks for the round's final seconds.
  useEffect(() => {
    if (status === 'playing' && roundSeconds > 0 && roundSeconds <= TICK_FROM_SECONDS) {
      playSound('tick');
    }
  }, [status, roundSeconds]);
}
