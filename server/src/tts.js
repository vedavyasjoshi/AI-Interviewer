// Text-to-speech via an OpenAI-compatible /audio/speech endpoint.
//
// Configured for Groq's Orpheus voices by default (natural-sounding, free tier),
// but works with any OpenAI-compatible TTS provider by overriding TTS_BASE_URL.
// If not configured, callers fall back to the browser's speechSynthesis API.
//
// Env vars (with sensible Groq defaults):
//   TTS_API_KEY   - provider key. Falls back to OPENAI_API_KEY so the same Groq
//                   key powers both LLM and TTS without duplicating it.
//   TTS_BASE_URL  - default https://api.groq.com/openai/v1
//   TTS_MODEL     - default canopylabs/orpheus-v1-english
//   TTS_VOICE     - default tara
//   TTS_FORMAT    - default wav (mp3 also supported by Groq)

const API_KEY = process.env.TTS_API_KEY || process.env.OPENAI_API_KEY;
const BASE_URL = process.env.TTS_BASE_URL || 'https://api.groq.com/openai/v1';
const MODEL = process.env.TTS_MODEL || 'canopylabs/orpheus-v1-english';
const VOICE = process.env.TTS_VOICE || 'tara';
const FORMAT = process.env.TTS_FORMAT || 'wav';

// Only treat TTS as configured when an explicit TTS key/base is present, OR the
// base URL is set. We gate on a dedicated flag so enabling server TTS is a
// deliberate choice (browser voice remains the zero-config default).
export const ttsConfigured = Boolean(process.env.TTS_API_KEY || process.env.TTS_BASE_URL);

// Content type to send back to the client for each supported format.
const CONTENT_TYPE = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
};

export const audioContentType = CONTENT_TYPE[FORMAT] || 'audio/wav';

/**
 * Synthesize speech. Returns a Buffer of audio bytes (format = TTS_FORMAT).
 * Throws if not configured or if the provider returns an error.
 */
export async function synthesize(text) {
  if (!ttsConfigured) {
    throw new Error('Server TTS not configured');
  }

  const res = await fetch(`${BASE_URL}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: text,
      voice: VOICE,
      response_format: FORMAT,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`TTS failed (${res.status}): ${detail}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
