// -----------------------------------------------------------------------
// Google Sign-In verification + our own lightweight session tokens.
//
// Flow: the client gets an ID token straight from Google Identity Services
// (no server-side OAuth redirect dance needed). The client sends that ID
// token to POST /api/auth/google once; we verify it against Google, look up
// or create the user, and hand back our *own* signed session token. The
// client stores that and sends it as "Authorization: Bearer <token>" on
// every request afterwards — we never need to re-verify with Google again.
//
// If GOOGLE_CLIENT_ID isn't set, auth is simply not configured: the health
// endpoint reports that, and the frontend falls back to a "guest" mode with
// device-local history instead of hiding the app. Same fallback philosophy
// as the LLM/TTS/STT integrations.
// -----------------------------------------------------------------------
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const authConfigured = Boolean(GOOGLE_CLIENT_ID);

// A session secret is required to sign our own tokens even if Google auth
// is configured. If the operator hasn't set one, generate a random secret
// at boot — sessions just won't survive a server restart, which is a fine
// hackathon-demo degradation (same spirit as the in-memory session store).
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET && authConfigured) {
  console.warn(
    'JWT_SECRET not set — using a random secret for this run. ' +
      'Signed-in sessions will not survive a server restart. Set JWT_SECRET in .env to persist them.'
  );
}

const client = authConfigured ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const SESSION_TTL = '30d';

/** Verify a Google ID token (from the client's Sign-In-With-Google button). Returns the Google profile. */
export async function verifyGoogleIdToken(idToken) {
  if (!authConfigured) {
    throw new Error('Google auth is not configured on this server.');
  }
  const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error('Invalid Google token payload.');
  }
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name || payload.email || 'Candidate',
    picture: payload.picture || null,
  };
}

/** Sign our own session token for a user (so we never re-verify with Google on every request). */
export function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, picture: user.picture },
    JWT_SECRET,
    { expiresIn: SESSION_TTL }
  );
}

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { id: payload.sub, email: payload.email, name: payload.name, picture: payload.picture };
  } catch {
    return null; // expired / tampered / malformed — treat as signed-out
  }
}

/** Attaches req.user if a valid session token is present; never rejects the request. */
export function optionalAuth(req, _res, next) {
  req.user = readBearerToken(req);
  next();
}

/** Rejects with 401 unless a valid session token is present. */
export function requireAuth(req, res, next) {
  const user = readBearerToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Sign in required.' });
  }
  req.user = user;
  next();
}
