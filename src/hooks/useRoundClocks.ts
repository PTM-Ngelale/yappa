import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { roomClocks } from '../game/config';
import type { RoomData } from '../supabase/room';
import { clockState, pauseTurnClock, resumeTurnClock } from '../supabase/round';
import { ROUND_INTRO_MS } from '../screens/RoundIntroScreen';

type Deadline = { key: string; ms: number; at: number };

/**
 * The round's two clocks, counted on this device: the turn clock (each Knower turn; when
 * it runs out the turn passes) and the round clock (when it runs out the round is lost). Their
 * lengths come from the room (roomClocks).
 *
 * Every device sees the same room updates, so they count down together; the server decides
 * when time is really up (skip_turn, expire_round). A device that loads mid-round, comes back
 * from the background or resumes after a pause asks the server where the clocks stand
 * (clock_state) rather than starting again. While `held` (a player has dropped) both clocks
 * stand still, here and on the server.
 */
export function useRoundClocks(
  code: string | null | undefined,
  roomData: RoomData | null,
  held: boolean,
): { turnSeconds: number; roundSeconds: number } {
  const playing = roomData?.status === 'playing';
  const round = roomData?.round ?? 0;
  const turnIndex = roomData?.turnIndex ?? 0;
  const roundKey = playing ? `${round}` : null;
  const turnKey = playing ? `${round}:${turnIndex}` : null;
  // The first turn and the round also cover the role reveal every device shows first.
  const clocks = roomClocks(roomData);
  const turnMs = clocks.turnSeconds * 1000 + (turnIndex === 0 ? ROUND_INTRO_MS : 0);
  const roundMs = clocks.roundSeconds * 1000 + ROUND_INTRO_MS;

  const [turnClock, setTurnClock] = useState<Deadline | null>(null);
  const [roundClock, setRoundClock] = useState<Deadline | null>(null);
  const [heldSince, setHeldSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Ask the server where both clocks stand and move the deadlines to match.
  const latest = useRef({ code, roundKey, turnKey });
  latest.current = { code, roundKey, turnKey };
  const sync = () => {
    const { code: c, roundKey: rk, turnKey: tk } = latest.current;
    if (!c || !rk || !tk) return;
    const asked = Date.now();
    clockState(c)
      .then((state) => {
        if (!state || `${state.round}` !== rk) return;
        // The server measured these roughly halfway through the round trip.
        const mid = (asked + Date.now()) / 2;
        setRoundClock((d) => (d && d.key === rk ? { ...d, at: mid - state.roundElapsedMs + d.ms } : d));
        if (`${state.round}:${state.turnIndex}` === tk) {
          setTurnClock((d) => (d && d.key === tk ? { ...d, at: mid - state.turnElapsedMs + d.ms } : d));
        }
      })
      .catch(console.error);
  };

  // A round seen starting live began just now; the first one this screen sees may be well
  // under way (a reload or rejoin), so check with the server.
  const sawRound = useRef(false);
  useEffect(() => {
    if (roundKey === null) {
      setRoundClock(null);
      return;
    }
    setRoundClock({ key: roundKey, ms: roundMs, at: Date.now() + roundMs });
    if (!sawRound.current) sync();
    sawRound.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);

  useEffect(() => {
    if (turnKey === null) {
      setTurnClock(null);
      return;
    }
    setTurnClock({ key: turnKey, ms: turnMs, at: Date.now() + turnMs });
    setHeldSince((h) => (h === null ? null : Date.now()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  // A player dropped: freeze both clocks here and on the server. Back: push both deadlines
  // out by the time held, restart the server's clocks and line up with them.
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
    const pausedFor = Date.now() - (heldSince ?? Date.now());
    setHeldSince(null);
    setTurnClock((d) => (d ? { ...d, at: d.at + pausedFor } : d));
    setRoundClock((d) => (d ? { ...d, at: d.at + pausedFor } : d));
    resumeTurnClock(code).then(sync).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, code]);

  // Timers stop while the app is in the background; catch up when it's back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!roundClock || heldSince !== null) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [roundClock, heldSince]);

  const at = heldSince ?? now;
  const left = (d: Deadline | null, key: string | null, max: number) =>
    // Until a new turn or round catches up, show its full time, not the old one's last second.
    !d || d.key !== key ? max : Math.min(max, Math.max(0, Math.ceil((d.at - at) / 1000)));
  return {
    turnSeconds: left(turnClock, turnKey, clocks.turnSeconds),
    roundSeconds: left(roundClock, roundKey, clocks.roundSeconds),
  };
}
