import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'crypto';

import { listRoles, getRole, listDifficulties, getDifficulty } from './roles.js';
import { parseResumeFile } from './resumeParser.js';
import {
  generateFirstQuestion,
  generateFollowUp,
  generateReport,
  llmConfigured,
  llmModel,
} from './llm.js';
import { synthesize, ttsConfigured, ttsProvider, audioContentType } from './tts.js';
import { transcribe, sttConfigured, sttProvider } from './stt.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Allow all origins by default (demo-friendly). Set CORS_ORIGIN to a specific
// origin (e.g. the deployed client URL) to lock it down in production.
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '2mb' }));

// In-memory upload handling (no disk writes — pragmatic for a demo).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// -----------------------------------------------------------------------
// In-memory session store. Maps sessionId -> interview state.
// For a hackathon demo we don't need persistence; a Map is enough.
// -----------------------------------------------------------------------
const sessions = new Map();

const MAX_QUESTIONS = 5; // cap the adaptive loop for a tight demo

// Health / capability probe so the frontend knows which integrations exist.
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    integrations: {
      llm: llmConfigured,
      llmModel,
      tts: ttsConfigured,
      ttsProvider,
      stt: sttConfigured,
      sttProvider,
    },
    roles: listRoles(),
    difficulties: listDifficulties(),
    maxQuestions: MAX_QUESTIONS,
  });
});

// -----------------------------------------------------------------------
// Resume upload + parsing
// -----------------------------------------------------------------------
app.post('/api/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No resume file uploaded (field "resume").' });
    }
    const parsed = await parseResumeFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    res.json({ resume: parsed });
  } catch (err) {
    console.error('Resume parse error:', err);
    res.status(500).json({ error: 'Failed to parse resume.', detail: String(err.message || err) });
  }
});

// Parse resume from raw pasted text (handy fallback / sample resume path).
app.post('/api/resume/text', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Missing "text".' });
    }
    const { structureResume } = await import('./resumeParser.js');
    res.json({ resume: structureResume(text) });
  } catch (err) {
    console.error('Resume text parse error:', err);
    res.status(500).json({ error: 'Failed to parse resume text.' });
  }
});

// -----------------------------------------------------------------------
// Interview lifecycle
// -----------------------------------------------------------------------

// Start: create a session, generate the first question.
app.post('/api/interview/start', async (req, res) => {
  try {
    const { resume, roleId, difficulty: difficultyId } = req.body || {};
    const role = getRole(roleId);
    if (!role) {
      return res.status(400).json({ error: 'Invalid or missing roleId.' });
    }
    if (!resume) {
      return res.status(400).json({ error: 'Missing parsed resume.' });
    }

    const difficulty = getDifficulty(difficultyId);
    const question = await generateFirstQuestion(resume, role, difficulty);
    const sessionId = randomUUID();

    sessions.set(sessionId, {
      role,
      resume,
      difficulty,
      history: [], // completed [{ question, answer }]
      pendingQuestion: question, // asked, awaiting an answer
      createdAt: Date.now(),
    });

    res.json({ sessionId, question, questionNumber: 1, maxQuestions: MAX_QUESTIONS });
  } catch (err) {
    console.error('Interview start error:', err);
    res.status(500).json({ error: 'Failed to start interview.', detail: String(err.message || err) });
  }
});

// Answer: record the answer to the pending question, then either return an
// adaptive follow-up or signal that the interview is complete.
app.post('/api/interview/answer', async (req, res) => {
  try {
    const { sessionId, answer, durationMs } = req.body || {};
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Unknown or expired session.' });
    }
    if (!session.pendingQuestion) {
      return res.status(400).json({ error: 'No pending question to answer.' });
    }

    // Commit the Q/A pair. durationMs is optional (older clients omit it).
    const dur = Number(durationMs);
    session.history.push({
      question: session.pendingQuestion,
      answer: (answer || '').trim(),
      durationMs: Number.isFinite(dur) && dur >= 0 ? Math.round(dur) : null,
    });
    session.pendingQuestion = null;

    if (session.history.length >= MAX_QUESTIONS) {
      return res.json({ done: true, questionNumber: session.history.length, maxQuestions: MAX_QUESTIONS });
    }

    const followUp = await generateFollowUp(session.resume, session.role, session.history, session.difficulty);
    session.pendingQuestion = followUp;

    res.json({
      done: false,
      question: followUp,
      questionNumber: session.history.length + 1,
      maxQuestions: MAX_QUESTIONS,
    });
  } catch (err) {
    console.error('Interview answer error:', err);
    res.status(500).json({ error: 'Failed to process answer.', detail: String(err.message || err) });
  }
});

// Report: generate the final evaluation from the full history.
app.post('/api/interview/report', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Unknown or expired session.' });
    }
    if (session.history.length === 0) {
      return res.status(400).json({ error: 'No answers recorded yet.' });
    }

    const report = await generateReport(session.resume, session.role, session.history, session.difficulty);

    // Attach per-question timing (captured client-side) onto the report by
    // index — perQuestion order matches the interview history order.
    if (Array.isArray(report.perQuestion)) {
      report.perQuestion = report.perQuestion.map((q, i) => ({
        ...q,
        durationMs: session.history[i]?.durationMs ?? null,
      }));
    }

    res.json({
      report,
      role: session.role.label,
      history: session.history,
    });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Failed to generate report.', detail: String(err.message || err) });
  }
});

// -----------------------------------------------------------------------
// Voice: TTS + STT
// -----------------------------------------------------------------------

// TTS: text -> audio bytes. 501 if not configured (frontend falls back to browser).
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Missing "text".' });
    }
    if (!ttsConfigured) {
      return res.status(501).json({ error: 'TTS not configured; use browser fallback.' });
    }
    const audio = await synthesize(text);
    res.set('Content-Type', audioContentType);
    res.send(audio);
  } catch (err) {
    console.error('TTS error:', err);
    res.status(500).json({ error: 'TTS failed.', detail: String(err.message || err) });
  }
});

// STT: audio file -> transcript. 501 if not configured.
app.post('/api/stt', upload.single('audio'), async (req, res) => {
  try {
    if (!sttConfigured) {
      return res.status(501).json({ error: 'STT not configured; use browser fallback.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No audio uploaded (field "audio").' });
    }
    const text = await transcribe(
      req.file.buffer,
      req.file.originalname || 'audio.webm',
      req.file.mimetype || 'audio/webm'
    );
    res.json({ text });
  } catch (err) {
    console.error('STT error:', err);
    res.status(500).json({ error: 'STT failed.', detail: String(err.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`AI Interviewer server listening on http://localhost:${PORT}`);
  console.log(
    `Integrations — LLM: ${llmConfigured ? 'on' : 'mock'}, ` +
      `TTS: ${ttsConfigured ? 'Groq Orpheus' : 'browser fallback'}, ` +
      `STT: ${sttConfigured ? 'Whisper' : 'browser fallback'}`
  );
});
