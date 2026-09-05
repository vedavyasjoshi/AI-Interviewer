import { useCallback, useEffect, useState } from 'react';
import { authGoogle, getMe } from '../api.js';
import { renderGoogleButton, googleAuthConfigured, googleSignOut } from '../googleAuth.js';

const TOKEN_KEY = 'aiInterviewer.sessionToken';

/**
 * Manages the signed-in user: restores a session from localStorage on load,
 * exposes a callback ref (`mountButton`) that renders Google's own button
 * wherever a component points it, and hands back the current token so
 * requests can be attributed to a user.
 */
export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(token));

  // Restore session on load if we already have a token from a previous visit.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setChecking(false);
      return undefined;
    }
    getMe(token)
      .then((res) => {
        if (!cancelled) setUser(res.user);
      })
      .catch(() => {
        // Expired/invalid token — quietly drop back to signed-out.
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          setToken('');
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleCredential = useCallback(async (idToken) => {
    try {
      const res = await authGoogle(idToken);
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
      setUser(res.user);
    } catch (err) {
      console.error('Google sign-in failed:', err);
    }
  }, []);

  // A callback ref: pass this straight to a <div ref={...} />. Retries
  // briefly because the GIS <script> tag loads asynchronously and may not
  // be ready the instant this component mounts.
  const mountButton = useCallback(
    (node) => {
      if (!node) return;
      let attempts = 0;
      const tryRender = () => {
        const ok = renderGoogleButton(node, handleCredential);
        attempts += 1;
        if (!ok && attempts < 15) setTimeout(tryRender, 300);
      };
      tryRender();
    },
    [handleCredential]
  );

  const signOut = useCallback(() => {
    googleSignOut();
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
  }, []);

  return { user, token, checking, googleAuthConfigured, mountButton, signOut };
}
