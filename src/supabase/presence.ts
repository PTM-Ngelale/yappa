import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState, type NativeEventSubscription } from 'react-native';
import { supabase } from './client';

let activeChannel: RealtimeChannel | null = null;
let activeUid: string | null = null;
let healthCheck: ReturnType<typeof setInterval> | null = null;
let appStateSub: NativeEventSubscription | null = null;

/** How often to check the server still lists this player. */
const HEALTH_CHECK_MS = 5000;
/** How long a check-in may take after the app comes back before the socket counts as dead. */
const RESUME_PROBE_MS = 4000;

export type PresenceListener = (onlineUids: Set<string>) => void;
let listeners: PresenceListener[] = [];

function notifyListeners(): void {
  if (!activeChannel) return;
  const state = activeChannel.presenceState();
  const uids = new Set(Object.keys(state));
  listeners.forEach((listener) => listener(uids));
}

function track(channel: RealtimeChannel, timeout?: number) {
  return channel.track({ online_at: Date.now() }, timeout ? { timeout } : {});
}

/**
 * The app is back from the background. Its socket may have died while it was away (Android
 * and browsers pause the heartbeat), and the realtime client can take half a minute to
 * notice — meanwhile the other players see this one as gone, and it misses anyone who joined
 * while it was away. Check in straight away; if that doesn't go through, reconnect the
 * socket, which rejoins every channel (this one re-announces itself as it rejoins).
 */
async function checkInAfterResume(): Promise<void> {
  const channel = activeChannel;
  // Not joined: the client already knows and is rejoining.
  if (!channel || channel.state !== 'joined') return;
  const result = await track(channel, RESUME_PROBE_MS).catch(() => 'error');
  if (result === 'ok' || channel !== activeChannel) return;
  await supabase.realtime.disconnect();
  supabase.realtime.connect();
}

/** Joins a room's presence channel so other clients can detect this player going offline. */
export function startPresence(roomCode: string, uid: string): void {
  stopPresence();
  // Private: only the room's players may join (migration 019).
  const channel = supabase.channel(`presence:room:${roomCode}`, {
    config: { presence: { key: uid }, private: true },
  });
  channel
    .on('presence', { event: 'sync' }, notifyListeners)
    .on('presence', { event: 'join' }, notifyListeners)
    .on('presence', { event: 'leave' }, notifyListeners)
    // Runs on every (re)join, e.g. after a reconnect — announce ourselves each time.
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') track(channel).catch(console.error);
    });
  activeChannel = channel;
  activeUid = uid;

  // Joined, but the server no longer lists us (e.g. it timed us out): announce again.
  healthCheck = setInterval(() => {
    if (activeChannel?.state === 'joined' && activeUid && !(activeUid in activeChannel.presenceState())) {
      track(activeChannel).catch(console.error);
    }
  }, HEALTH_CHECK_MS);
  appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') checkInAfterResume().catch(console.error);
  });
}

export function stopPresence(): void {
  if (healthCheck) clearInterval(healthCheck);
  healthCheck = null;
  appStateSub?.remove();
  appStateSub = null;
  activeUid = null;
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }
  listeners = [];
}

/**
 * Subscribes to changes in which uids are currently online in the active room's
 * presence channel (started elsewhere via startPresence). Returns an unsubscribe fn.
 */
export function onPresenceChange(listener: PresenceListener): () => void {
  listeners.push(listener);
  if (activeChannel) notifyListeners();
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
