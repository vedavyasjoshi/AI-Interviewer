// Speech-to-text via OpenAI Whisper. Accepts an audio buffer and returns the
// transcript string. If not configured, callers should fall back to the
// browser's Web Speech API on the client.

// STT is decoupled from the LLM provider so you can use a free LLM (e.g. Groq)
// while transcription stays on its own provider — or unset, so the client falls
// back to the browser's Web Speech API for free. Falls back to the legacy
// OPENAI_* vars for backward compatibility.
const API_KEY = process.env.STT_API_KEY || process.env.OPENAI_STT_API_KEY;
const BASE_URL =
  process.env.STT_BASE_URL || 'https://api.openai.com/v1';
const STT_MODEL = process.env.STT_MODEL || 'whisper-1';

export const sttConfigured = Boolean(API_KEY);

// Short provider label for the UI badge. Null when server STT isn't configured
// (the browser's Web Speech recognition is used instead).
export const sttProvider = (() => {
  if (!sttConfigured) return null;
  const u = String(BASE_URL).toLowerCase();
  if (u.includes('groq')) return 'Groq Whisper';
  if (u.includes('openai')) return 'Whisper';
  if (u.includes('magica')) return 'Magica';
  return STT_MODEL || 'server STT';
})();

/**
 * Transcribe an audio buffer. `filename` should carry the right extension
 * (e.g. audio.webm) so the API can infer the format. Throws if not configured.
 */
export async function transcribe(buffer, filename = 'audio.webm', mimetype = 'audio/webm') {
  if (!sttConfigured) {
    throw new Error('Whisper STT not configured');
  }

  const form = new FormData();
  // Node 18+ provides global Blob/FormData.
  const blob = new Blob([buffer], { type: mimetype });
  form.append('file', blob, filename);
  form.append('model', STT_MODEL);

  const res = await fetch(`${BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Whisper STT failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  return data.text || '';
}
