import { useEffect, useRef, useState } from 'react';
import { submitAnswer, serverTTS, serverSTT } from '../api.js';
import { useStopwatch, formatDuration } from '../hooks/useStopwatch.js';
import Waveform from './charts/Waveform.jsx';
import {
  speakBrowser,
  stopSpeaking,
  stopAudio,
  playAudioUrl,
  createRecorder,
  BrowserSpeechRecognizer,
  hasBrowserSTT,
} from '../voice.js';

// Step 3: the adaptive voice interview loop.
// - The current question is spoken aloud (server TTS if available, else browser).
// - The user records an answer; it's transcribed (server STT if available, else
//   browser live recognition).
// - The answer is submitted; the backend returns a follow-up or signals done.
export default function InterviewStep({
  sessionId,
  integrations,
  question,
  questionNumber,
  maxQuestions,
  onFollowUp,
  onDone,
  onError,
}) {
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [history, setHistory] = useState([]); // local display of Q/A

  const recorderRef = useRef(null);
  const recognizerRef = useRef(null);
  const spokenForRef = useRef(null); // guards against double-speak (StrictMode/re-renders)

  // Per-question stopwatch. Resets on each new question; pauses while the
  // interviewer is speaking so timing reflects the candidate's thinking time.
  const { elapsed, getElapsedMs } = useStopwatch(question, !speaking);

  // Speak each new question as it arrives — exactly once per question.
  useEffect(() => {
    if (question && spokenForRef.current !== question) {
      spokenForRef.current = question;
      speak(question);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  async function speak(text) {
    // Make sure any live speech recognition is stopped before speaking —
    // browser SpeechRecognition and SpeechSynthesis interfere with each other.
    if (recognizerRef.current) {
      try {
        await recognizerRef.current.stop();
      } catch {
        /* ignore */
      }
      recognizerRef.current = null;
      setRecording(false);
    }
    // Halt any prior speech (server audio or browser) so we never overlap.
    stopAudio();
    stopSpeaking();
    setSpeaking(true);
    try {
      let url = null;
      if (integrations.tts) {
        url = await serverTTS(text);
      }
      if (url) {
        await playAudioUrl(url);
        URL.revokeObjectURL(url);
      } else {
        await speakBrowser(text);
      }
    } catch {
      /* ignore playback errors */
    } finally {
      setSpeaking(false);
    }
  }

  // Stop whatever is currently being spoken.
  function stopSpeakingNow() {
    stopAudio();
    stopSpeaking();
    setSpeaking(false);
  }

  async function startRecording() {
    onError('');
    setTranscript('');
    setInterim('');
    // Stop any in-progress speech before recording — the mic and speaker
    // compete in Chrome and can cause both to silently fail.
    stopAudio();
    stopSpeaking();
    setSpeaking(false);
    // Small delay to let the audio stack fully release after TTS ends.
    await new Promise((r) => setTimeout(r, 150));

    try {
      // Prefer live browser recognition when the server has no Whisper; it gives
      // instant transcripts. Otherwise record audio to send to the server.
      if (!integrations.stt && hasBrowserSTT()) {
        const recognizer = new BrowserSpeechRecognizer();
        recognizer.onInterim = (t) => setInterim(t);
        recognizer.start();
        recognizerRef.current = recognizer;
      } else {
        const recorder = await createRecorder();
        recorder.start();
        recorderRef.current = recorder;
      }
      setRecording(true);
    } catch (e) {
      onError('Microphone access failed. Check browser permissions. You can also type your answer.');
    }
  }

  async function stopRecording() {
    setRecording(false);
    try {
      if (recognizerRef.current) {
        const text = await recognizerRef.current.stop();
        recognizerRef.current = null;
        setInterim('');
        setTranscript((prev) => (prev ? prev + ' ' : '') + text);
      } else if (recorderRef.current) {
        setTranscribing(true);
        const blob = await recorderRef.current.stop();
        recorderRef.current = null;
        const text = await serverSTT(blob);
        setTranscribing(false);
        if (text != null) {
          setTranscript((prev) => (prev ? prev + ' ' : '') + text);
        } else {
          onError('Server transcription unavailable — please type your answer.');
        }
      }
    } catch (e) {
      setTranscribing(false);
      onError('Could not transcribe audio — please type your answer.');
    }
  }

  async function submit() {
    const answer = transcript.trim();
    if (!answer) {
      onError('Please record or type an answer first.');
      return;
    }
    setSubmitting(true);
    onError('');
    stopSpeaking();

    const durationMs = getElapsedMs();

    // Record locally for display.
    setHistory((h) => [...h, { question, answer }]);

    try {
      const res = await submitAnswer(sessionId, answer, durationMs);
      setTranscript('');
      setInterim('');
      if (res.done) {
        onDone();
      } else {
        onFollowUp(res.question, res.questionNumber);
      }
    } catch (e) {
      onError(e.message || 'Failed to submit answer.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="row">
        <div className="step-label">Interview in progress</div>
        <div className="spacer" />
        <div className="timer" title="Time on this question">
          ⏱ {formatDuration(elapsed)}
        </div>
        <div className="progress">
          Question {questionNumber} of {maxQuestions}
        </div>
      </div>

      <div className="qbubble" style={{ marginTop: 10 }}>{question}</div>

      <div className="row" style={{ marginTop: 10 }}>
        {speaking && (
          <span className="speaking">
            <span className="dot" /> Speaking…
          </span>
        )}
        {recording && (
          <div className="rec-panel">
            <div className="recording">
              <span className="rec-dot" /> Recording…
            </div>
            <Waveform active={recording} bars={20} />
          </div>
        )}
        <div className="spacer" />
        <button
          className="ghost small"
          onClick={speaking ? stopSpeakingNow : () => speak(question)}
          title={speaking ? 'Stop reading the question aloud' : 'Play the question aloud'}
        >
          {speaking ? '⏹ Stop' : '🔊 Play question'}
        </button>
      </div>

      <h3>Your answer</h3>
      {transcribing && <div className="progress" style={{ marginBottom: 8 }}>Transcribing…</div>}

      <textarea
        value={recording && interim ? interim : transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Record your answer by voice, or type it here…"
        disabled={recording}
      />

      <div className="row" style={{ marginTop: 12 }}>
        {!recording ? (
          <button onClick={startRecording} disabled={submitting}>
            🎙️ Record answer
          </button>
        ) : (
          <button className="danger" onClick={stopRecording}>
            ⏹ Stop
          </button>
        )}
        <div className="spacer" />
        <button className="primary" onClick={submit} disabled={submitting || recording}>
          {submitting ? 'Thinking…' : 'Submit & continue →'}
        </button>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>So far</h3>
          {history.map((t, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div className="small muted">Q{i + 1}: {t.question}</div>
              <div className="abubble small" style={{ marginTop: 4 }}>{t.answer}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
