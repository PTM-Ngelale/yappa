import type { ShareResult } from './shareRoom';

export type { ShareResult } from './shareRoom';

/** A link that opens this web app straight on the Join form with the code filled in. */
export function joinLink(roomCode: string): string {
  return `${window.location.origin}/join/${roomCode}`;
}

/**
 * Shares the room through the browser's share sheet where there is one (mostly phones),
 * otherwise copies the invite link so it can be pasted anywhere.
 */
export async function shareRoom(roomCode: string): Promise<ShareResult> {
  const url = joinLink(roomCode);
  const text = `Join my Yappa game! Room code: ${roomCode}`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Yappa', text, url });
      return 'shared';
    } catch (e) {
      // Closing the share sheet isn't an error worth reporting.
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch (e) {
    console.error(e);
    return 'failed';
  }
}
