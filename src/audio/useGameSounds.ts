import { useEffect, useRef } from 'react';
import type { RoomData } from '../supabase/room';
import { playSound } from './sounds';

/** Seconds left in a turn at which the countdown starts ticking. */
const TICK_FROM_SECONDS = 5;

/**
 * Plays sounds for game events as the room changes: a new round, a word landing in the
 * chain, your turn coming round, the last seconds ticking, and each round's result.
 * Every device derives these from the same room state, so everyone hears the same cues.
 * `secondsRemaining` is this device's turn countdown (see useTurnCountdown).
 */
export function useGameSounds(roomData: RoomData | null, uid: string | null, secondsRemaining: number) {
  const prev = useRef<{ status: string; round: number; chainLength: number; activeKnowerUid: string } | null>(null);

  const status = roomData?.status;
  const round = roomData?.round ?? 0;
  const chainLength = roomData?.chain?.length ?? 0;
  const activeKnowerUid = roomData?.activeKnowerUid ?? '';

  useEffect(() => {
    if (!roomData || !status) return;
    const before = prev.current;
    prev.current = { status, round, chainLength, activeKnowerUid };

    const newRound = status === 'playing' && (before?.status !== 'playing' || before.round !== round);
    if (newRound) {
      playSound('roundStart');
      return;
    }

    if (status === 'playing' && before) {
      if (chainLength > before.chainLength) {
        // My partner just handed me the turn — a chime says "you're up"; otherwise a pop.
        playSound(activeKnowerUid === uid && before.activeKnowerUid !== uid ? 'yourTurn' : 'pop');
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
  }, [status, round, chainLength, activeKnowerUid, uid]);

  // Countdown ticks for the final seconds of each turn.
  useEffect(() => {
    if (status === 'playing' && secondsRemaining > 0 && secondsRemaining <= TICK_FROM_SECONDS) {
      playSound('tick');
    }
  }, [status, secondsRemaining]);
}
