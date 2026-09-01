// Browser voice helpers used as fallbacks (and defaults) when server TTS/STT
// integrations aren't configured.
//
// - speakBrowser: Web Speech API SpeechSynthesis for TTS.
// - createRecorder: MediaRecorder wrapper capturing mic audio to a Blob.
// - BrowserSpeechRecognizer: Web Speech API SpeechRecognition for live STT.

// Chrome populates getVoices() asynchronously — it's often empty on first call
// until the 'voiceschanged' event fires. Speaking before voices are loaded can
// silently no-op, so we wait for them.
function loadVoices() {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing && existing.length) return resolve(existing);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(window.speechSynthesis.getVoices() || []);
    };
    window.speechSynthesis.onvoiceschanged = finish;
    // Fallback in case the event never fires.
    setTimeout(finish, 500);
  });
}

// Chrome blocks speechSynthesis until there's been a user gesture. Call this
// from a click handler (e.g. Start interview) to prime the engine with a
// silent utterance so later automatic speech is allowed to play.
export function unlockSpeech() {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    // Kick voice loading too.
    window.speechSynthesis.getVoices();
  } catch {
    /* ignore */
  }
}

/** Speak text using the browser's speech synthesis. Resolves when done. */
export async function speakBrowser(text) {
  if (!('speechSynthesis' in window) || !text) return;
  const voices = await loadVoices();
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.lang = 'en-US';
    // Prefer a stable English voice when available.
    const preferred =
      voices.find((v) => v.lang && v.lang.startsWith('en') && v.default) ||
      voices.find((v) => v.lang && v.lang.startsWith('en')) ||
      voices[0];
    if (preferred) utter.voice = preferred;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    utter.onend = finish;
    utter.onerror = finish;
    // Safety net: some browsers never fire onend for long text. Estimate a
    // max duration (~15 chars/sec) and resolve after that as a fallback.
    const maxMs = Math.min(30000, Math.max(3000, (text.length / 15) * 1000 + 1500));
    setTimeout(finish, maxMs);

    window.speechSynthesis.speak(utter);
  });
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// Tracks the currently-playing server-TTS audio so we can stop it before
// starting new speech (prevents overlapping/double audio).
let currentAudio = null;

/** Stop any in-progress server-TTS audio playback. */
export function stopAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
}

/** Play an audio URL (from server TTS). Resolves when playback ends. */
export function playAudioUrl(url) {
  stopAudio();
  return new Promise((resolve) => {
    const audio = new Audio(url);
    currentAudio = audio;
    const done = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

/**
 * Create a MediaRecorder-based recorder. Returns { start, stop } where stop()
 * resolves to a Blob of the recorded audio (webm/opus where supported).
 */
export async function createRecorder() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported('audio/webm')
    ? 'audio/webm'
    : '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return {
    start() {
      chunks.length = 0;
      recorder.start();
    },
    stop() {
      return new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
        };
        recorder.stop();
      });
    },
  };
}

/** Is the browser's SpeechRecognition (live STT) available? */
export function hasBrowserSTT() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Live browser speech recognition. Call start(), speak, then stop() to get the
 * accumulated transcript. Useful when server Whisper isn't configured.
 */
export class BrowserSpeechRecognizer {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = Boolean(SR);
    this.transcript = '';
    if (this.supported) {
      this.rec = new SR();
      this.rec.continuous = true;
      this.rec.interimResults = true;
      this.rec.lang = 'en-US';
      this.rec.onresult = (event) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          }
        }
        if (finalText) this.transcript += finalText + ' ';
        if (this.onInterim) {
          const interim = Array.from(event.results)
            .filter((r) => !r.isFinal)
            .map((r) => r[0].transcript)
            .join(' ');
          this.onInterim(this.transcript + interim);
        }
      };
    }
  }

  start() {
    this.transcript = '';
    if (this.supported) {
      try {
        this.rec.start();
      } catch {
        /* already started — ignore */
      }
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.supported) return resolve('');
      this.rec.onend = () => resolve(this.transcript.trim());
      try {
        this.rec.stop();
      } catch {
        resolve(this.transcript.trim());
      }
    });
  }
}
