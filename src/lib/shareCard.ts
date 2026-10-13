import { Share } from 'react-native';
import { WEB_URL } from './links';
import type { ShareResult } from './shareRoom';

/** The public page for a share card; its link preview is the card picture. */
export function cardLink(cardId: string): string {
  return `${WEB_URL}/c/${cardId}`;
}

/** Opens the system share sheet with the game's card link (see shareCard.web.ts for the web). */
export async function shareCard(cardId: string, text: string): Promise<ShareResult> {
  try {
    // Android only shares `message`, so the link goes in it.
    await Share.share({ message: `${text}\n${cardLink(cardId)}` });
    return 'shared';
  } catch (e) {
    console.error(e);
    return 'failed';
  }
}
