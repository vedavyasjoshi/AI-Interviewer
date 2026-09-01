# AI Mock Interviewer 🎙️

An AI-powered mock interview web app built for a hackathon. Upload your resume,
pick a target role, and get an adaptive voice-driven interview with a final
scored feedback report.

## Features

- **Resume upload & parsing** — Upload a PDF/DOCX/TXT resume; a parser extracts
  structured info (skills, experience, education, projects).
- **Role selection** — Choose from **Software Engineer**, **Product Manager**,
  or **Data Scientist**.
- **LLM question generation** — Questions are generated with full context of the
  parsed resume and the selected role.
- **Text-to-speech** — The AI's questions are spoken aloud (ElevenLabs, with a
  browser Web Speech fallback).
- **Voice answers + speech-to-text** — Answer by voice; your speech is
  transcribed (OpenAI Whisper, with a browser Web Speech fallback).
- **Adaptive follow-ups** — Transcribed answers feed back into the LLM, which
  asks contextual follow-up questions.
- **Final report** — At the end you get feedback, an overall score, per-question
  scoring, strengths, and areas of improvement.

## Architecture

```
┌─────────────────┐         ┌──────────────────────────────┐
│  React + Vite   │  HTTP   │      Express (Node.js)        │
│   frontend      │◄───────►│  /api/resume  parse resume    │
│                 │         │  /api/interview/start          │
│  - upload UI    │         │  /api/interview/answer (loop)  │
│  - role picker  │         │  /api/interview/report         │
│  - voice loop   │         │  /api/tts   (ElevenLabs)       │
│  - report view  │         │  /api/stt   (Whisper)          │
└─────────────────┘         └───────────────┬──────────────┘
                                            │
                          ┌─────────────────┴───────────────┐
                          │ LLM (OpenAI-compatible)          │
                          │ TTS (ElevenLabs)                 │
                          │ STT (OpenAI Whisper)             │
                          │ + mock fallbacks (no keys needed)│
                          └──────────────────────────────────┘
```

**Pragmatic hackathon choices:**
- Interview session state is kept **in-memory** on the server (a `Map` keyed by
  session id). No database needed for a demo.
- Every external integration (LLM, TTS, STT) has a **mock fallback**, so the app
  is fully demoable even with **zero API keys**.
- The frontend prefers the browser's built-in Web Speech API for TTS/STT when
  server integrations aren't configured — great for offline demos.

## Prerequisites

- Node.js 18+ (uses global `fetch` and `FormData`)

## Setup

```bash
# 1. Install backend deps
cd server
npm install

# 2. Install frontend deps
cd ../client
npm install
```

### Configure API keys (optional)

Copy the example env file and fill in whatever you have. **All keys are
optional** — missing integrations fall back to mocks / browser APIs.

```bash
cd server
cp .env.example .env
```

```
# LLM (OpenAI-compatible). If unset, a deterministic mock LLM is used.
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# ElevenLabs TTS. If unset, the frontend uses browser speech synthesis.
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# Whisper STT uses OPENAI_API_KEY. If unset, the frontend uses browser STT.
```

## Run

Open two terminals:

```bash
# Terminal 1 — backend on :4000
cd server
npm run dev

# Terminal 2 — frontend on :5173 (proxies /api to :4000)
cd client
npm run dev
```

Then open http://localhost:5173.

## Demo flow

1. Upload a resume (or click **Use sample resume**).
2. Pick a role.
3. Click **Start interview** — the AI asks a question (spoken aloud).
4. Click **Record answer**, speak, then **Stop**. Your answer is transcribed.
5. The AI asks an adaptive follow-up. Repeat.
6. Click **Finish & get report** to see your scored feedback.
