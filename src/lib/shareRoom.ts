import { Share } from 'react-native';

/** What happened when sharing: the web version may copy a link instead (see shareRoom.web.ts). */
export type ShareResult = 'shared' | 'copied' | 'failed';

/** Opens the system share sheet with the room code. */
export async function shareRoom(roomCode: string): Promise<ShareResult> {
  try {
    await Share.share({ message: `Join my Clue Line game! Room code: ${roomCode}` });
    return 'shared';
  } catch (e) {
    console.error(e);
    return 'failed';
  }
}
