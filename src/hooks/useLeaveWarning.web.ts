import { useEffect } from 'react';

/**
 * While `active`, closing or reloading the tab asks "Leave site?" first — leaving mid-game
 * drops you from the game and, after 30 seconds, ends it for the other two players.
 */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // older browsers need this to show the prompt
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}
