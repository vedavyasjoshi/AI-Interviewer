// Thin API client for the backend. All calls are same-origin (/api/*) and go
// through Vite's dev proxy to the Express server.

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function getHealth() {
  return json(await fetch('/api/health'));
}

export async function uploadResume(file) {
  const form = new FormData();
  form.append('resume', file);
  return json(await fetch('/api/resume', { method: 'POST', body: form }));
}

export async function parseResumeText(text) {
  return json(
    await fetch('/api/resume/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  );
}

export async function startInterview(resume, roleId) {
  return json(
    await fetch('/api/interview/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, roleId }),
    })
  );
}

export async function submitAnswer(sessionId, answer) {
  return json(
    await fetch('/api/interview/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, answer }),
    })
  );
}

export async function getReport(sessionId) {
  return json(
    await fetch('/api/interview/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
  );
}

/** Try server TTS (ElevenLabs). Returns a Blob URL, or null if unavailable. */
export async function serverTTS(text) {
  const res = await fetch('/api/tts', {
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
  const res = await fetch('/api/stt', { method: 'POST', body: form });
  if (res.status === 501) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return data.text ?? null;
}
