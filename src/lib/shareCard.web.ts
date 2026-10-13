import type { ShareResult } from './shareRoom';

/** The public page for a share card, on whichever address the web app is served from. */
export function cardLink(cardId: string): string {
  return `${window.location.origin}/c/${cardId}`;
}

/**
 * Shares the card link through the browser's share sheet where there is one (mostly phones),
 * otherwise copies it so it can be pasted anywhere.
 */
export async function shareCard(cardId: string, text: string): Promise<ShareResult> {
  const url = cardLink(cardId);
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
