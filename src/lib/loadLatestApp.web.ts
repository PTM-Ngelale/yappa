/** Web version: reloading the page always loads the latest deploy. */
export async function loadLatestApp(): Promise<boolean> {
  window.location.reload();
  return true;
}
