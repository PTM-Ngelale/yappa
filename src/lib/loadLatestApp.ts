import * as Updates from 'expo-updates';

/**
 * Home's refresh: if a newer version of the app has been published (eas update), downloads it
 * and restarts into it. Resolves true when the app is restarting. Expo Go and dev builds have
 * no published updates to load, so there it does nothing.
 */
export async function loadLatestApp(): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return false;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) return false;
    await Updates.reloadAsync();
    return true;
  } catch (e) {
    console.warn('Update check failed:', e);
    return false;
  }
}
