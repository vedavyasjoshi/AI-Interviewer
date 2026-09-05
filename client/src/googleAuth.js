// Thin wrapper around Google Identity Services (GIS) — loaded as a plain
// <script> tag in index.html rather than an npm package, so signing in
// doesn't pull in an SDK just to render one button.
//
// Set VITE_GOOGLE_CLIENT_ID at build time (client/.env) to the SAME OAuth
// Client ID the server verifies against (GOOGLE_CLIENT_ID). If it's unset,
// googleAuthConfigured is false and the app runs in guest mode instead of
// showing a broken button.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const googleAuthConfigured = Boolean(CLIENT_ID);

let initialized = false;

/**
 * Render the official "Sign in with Google" button into a DOM node.
 * Returns false if the GIS script hasn't finished loading yet (async tag) —
 * callers should retry briefly rather than treat that as a hard failure.
 */
export function renderGoogleButton(container, onCredential) {
  if (!googleAuthConfigured || !container || !window.google?.accounts?.id) {
    return false;
  }
  if (!initialized) {
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response) => onCredential(response.credential),
    });
    initialized = true;
  }
  container.innerHTML = '';
  window.google.accounts.id.renderButton(container, {
    theme: 'filled_black',
    size: 'large',
    shape: 'pill',
    text: 'signin_with',
  });
  return true;
}

/** Best-effort local sign-out (clears Google's own auto-select memory). */
export function googleSignOut() {
  window.google?.accounts?.id?.disableAutoSelect?.();
}
