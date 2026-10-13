import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RoomData } from '../supabase/room';
import { pauseTurnClock, resumeTurnClock, turnElapsedMs } from '../supabase/round';
import { ROUND_INTRO_MS } from '../screens/RoundIntroScreen';

/** Seconds per turn — the value the server resets the timer to (_setup_round, submit_word). */
export const TURN_SECONDS = 30;

type Clock = { key: string; turnMs: number; deadline: number };

/**
 * Seconds left in the current turn, counted on this device. A turn starts when a round
 * starts or a word lands in the chain, and every device sees that same room update, so
 * they all count down together without the host writing the timer to the database every
 * second (each write went to every player over Realtime). Only the host's expiry is
 * written, via resolve_round_timeout.
 *
 * The server keeps the same clock (migration 010), so a device that loads the room
 * mid-turn — a reload, a rejoin — or comes back from the background asks it how far in the
 * turn is rather than starting again at 30. While `held` (a player has dropped) the count
 * stands still here and on the server.
 */
export function useTurnCountdown(code: string | null | undefined, roomData: RoomData | null, held: boolean): number {
  const chainLength = roomData?.chain?.length ?? 0;
  const turnKey = roomData?.status === 'playing' ? `${roomData.round}:${chainLength}` : null;
  // The first turn also covers the role reveal every device shows as a round starts.
  const turnMs = TURN_SECONDS * 1000 + (chainLength === 0 ? ROUND_INTRO_MS : 0);

  const [clock, setClock] = useState<Clock | null>(null);
  const [heldSince, setHeldSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const resync = () => {
    const c = clockRef.current;
    if (c) syncRef.current(c.key, c.turnMs);
  };

  // Ask the server how long this turn has run, and move the deadline to match.
  const syncRef = useRef<(key: string, turnMs: number) => void>(() => {});
  syncRef.current = (key, ms) => {
    if (!code) return;
    const asked = Date.now();
    turnElapsedMs(code)
      .then((elapsed) => {
        if (elapsed === null) return;
        // The server measured `elapsed` roughly halfway through the round trip.
        const deadline = (asked + Date.now()) / 2 - elapsed + ms;
        setClock((c) => (c && c.key === key ? { ...c, deadline } : c));
      })
      .catch(console.error);
  };

  const sawTurn = useRef(false);
  useEffect(() => {
    if (turnKey === null) {
      setClock(null);
      return;
    }
    setClock({ key: turnKey, turnMs, deadline: Date.now() + turnMs });
    setHeldSince((h) => (h === null ? null : Date.now()));
    // A turn seen starting live began just now. The first one this screen sees may be
    // well under way (a reload or rejoin), so check with the server.
    if (!sawTurn.current) syncRef.current(turnKey, turnMs);
    sawTurn.current = true;
    // Restart only when the turn changes; turnMs is fixed per turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  // A player dropped: freeze, and pause the server's clock. Back: push the deadline out by
  // the time held, resume the server's clock and line up with it.
  const heldRef = useRef(held);
  useEffect(() => {
    if (held === heldRef.current) return;
    heldRef.current = held;
    if (!code) return;
    if (held) {
      setHeldSince(Date.now());
      pauseTurnClock(code).catch(console.error);
      return;
    }
    const since = heldSince ?? Date.now();
    setHeldSince(null);
    setClock((c) => (c ? { ...c, deadline: c.deadline + (Date.now() - since) } : c));
    resumeTurnClock(code)
      .then(resync)
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, code]);

  // Timers stop while the app is in the background; catch up when it's back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resync();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!clock || heldSince !== null) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [clock, heldSince]);

  // Until the effect catches up with a new turn, show the new turn's full time, not the
  // old turn's last second.
  if (!clock || clock.key !== turnKey) return TURN_SECONDS;
  const at = heldSince ?? now;
  return Math.min(TURN_SECONDS, Math.max(0, Math.ceil((clock.deadline - at) / 1000)));
}
