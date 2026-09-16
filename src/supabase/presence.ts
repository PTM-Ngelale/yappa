import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';

let activeChannel: RealtimeChannel | null = null;

export type PresenceListener = (onlineUids: Set<string>) => void;
let listeners: PresenceListener[] = [];

function notifyListeners(): void {
  if (!activeChannel) return;
  const state = activeChannel.presenceState();
  const uids = new Set(Object.keys(state));
  listeners.forEach((listener) => listener(uids));
}

/** Joins a room's presence channel so other clients can detect this player going offline. */
export function startPresence(roomCode: string, uid: string): void {
  stopPresence();
  const channel = supabase.channel(`presence:room:${roomCode}`, {
    config: { presence: { key: uid } },
  });
  channel
    .on('presence', { event: 'sync' }, notifyListeners)
    .on('presence', { event: 'join' }, notifyListeners)
    .on('presence', { event: 'leave' }, notifyListeners)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track({ online_at: Date.now() });
    });
  activeChannel = channel;
}

export function stopPresence(): void {
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
