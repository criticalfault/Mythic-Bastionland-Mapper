/**
 * Fathom Analytics event helpers.
 * All calls are wrapped so they fail silently if Fathom is
 * blocked by an ad blocker or hasn't loaded yet.
 */
function track(event) {
  try {
    if (typeof window !== 'undefined' && typeof window.fathom !== 'undefined') {
      window.fathom.trackEvent(event);
    }
  } catch (_) {
    // Silently ignore — never break the app over analytics
  }
}

// ── Auth ──────────────────────────────────────────
export const trackSignIn       = () => track('Signed In');

// ── Lobby ─────────────────────────────────────────
export const trackRealmCreated = () => track('Realm Created');
export const trackRealmJoined  = () => track('Realm Joined');

// ── Map building ──────────────────────────────────
export const trackMapSaved     = () => track('Map Saved');
export const trackStateSaved   = () => track('State Saved');
export const trackMapExported  = (type) => track(`Map Exported ${type === 'gm' ? 'GM' : 'Player'}`);
export const trackNewMap       = () => track('New Map Created');

// ── Play ──────────────────────────────────────────
export const trackHexRevealed  = () => track('Hex Revealed');
export const trackPlayerAdded  = () => track('Player Token Added');
export const trackDiceRolled   = () => track('Dice Rolled');
export const trackPing         = () => track('Ping Sent');
