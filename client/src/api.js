// Thin API client for the backend.
//
// In development, calls are same-origin (/api/*) and go through Vite's dev
// proxy to the Express server. In production (e.g. Render), the client and
// server are separate deployments, so set VITE_API_BASE_URL at build time to
// the server's URL (e.g. https://ai-interviewer-server.onrender.com).
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/** Build a full API URL from a relative path like "/api/health". */
function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function getHealth() {
  return json(await fetch(apiUrl('/api/health')));
}

// -----------------------------------------------------------------------
// Auth + profile history
// -----------------------------------------------------------------------

/** Exchange a Google ID token for our own session token + user profile. */
export async function authGoogle(idToken) {
  return json(
    await fetch(apiUrl('/api/auth/google'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    })
  );
}

/** Validate a stored session token and fetch the current user's profile. */
export async function getMe(token) {
  return json(
    await fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
  );
}

/** A signed-in user's past practice sessions, most recent first. */
export async function getHistory(token) {
  return json(
    await fetch(apiUrl('/api/history'), {
      headers: { Authorization: `Bearer ${token}` },
    })
  );
}

export async function uploadResume(file) {
  const form = new FormData();
  form.append('resume', file);
  return json(await fetch(apiUrl('/api/resume'), { method: 'POST', body: form }));
}

export async function parseResumeText(text) {
  return json(
    await fetch(apiUrl('/api/resume/text'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  );
}

export async function startInterview(resume, roleId, difficulty, customRole) {
  return json(
    await fetch(apiUrl('/api/interview/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, roleId, difficulty, customRole }),
    })
  );
}

export async function submitAnswer(sessionId, answer, durationMs) {
  return json(
    await fetch(apiUrl('/api/interview/answer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, answer, durationMs }),
    })
  );
}

// `token` is optional: when present, the server attaches this report to the
// signed-in user's practice history; when absent, the report is still
// generated as normal, it just isn't saved server-side (caller falls back
// to device-local history — see localHistory.js).
export async function getReport(sessionId, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return json(
    await fetch(apiUrl('/api/interview/report'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId }),
    })
  );
}

/** Try server TTS (ElevenLabs). Returns a Blob URL, or null if unavailable. */
export async function serverTTS(text) {
  const res = await fetch(apiUrl('/api/tts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (res.status === 501) return null; // not configured -> caller uses browser
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Try server STT (Whisper). Returns transcript string, or null if unavailable. */
export async function serverSTT(audioBlob) {
  const form = new FormData();
  form.append('audio', audioBlob, 'audio.webm');
  const res = await fetch(apiUrl('/api/stt'), { method: 'POST', body: form });
  if (res.status === 501) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return data.text ?? null;
}
