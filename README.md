# AI Mock Interviewer 🎙️

An AI-powered mock interview web app built for a hackathon. Upload your resume,
pick a target role, and get an adaptive voice-driven interview with a final
scored feedback report — running entirely on **free** services.

## Features

- **Resume upload & parsing** — Upload a PDF/DOCX/TXT resume; a parser extracts
  structured info (skills, experience, education, projects).
- **Role selection** — Choose from **Software Engineer**, **Product Manager**,
  or **Data Scientist**.
- **LLM question generation** — Questions are generated with full context of the
  parsed resume and the selected role (via **Groq**, free tier).
- **Text-to-speech** — The AI's questions are spoken aloud with a natural voice
  (**Groq Orpheus**, with a browser Web Speech fallback).
- **Voice answers + speech-to-text** — Answer by voice; your speech is
  transcribed by the **browser's Web Speech API** (free, no key).
- **Adaptive follow-ups** — Transcribed answers feed back into the LLM, which
  asks contextual follow-up questions. Context is held server-side and replayed
  on every call (the LLM API itself is stateless).
- **Final report** — At the end you get feedback, an overall score, per-question
  scoring, strengths, and areas of improvement.
- **Google Sign-In + Profile** — Sign in with Google to save every completed
  interview to your account and revisit it later from your **Profile** page.
  Skip sign-in and the app still works fully as a guest — history is just kept
  on that device only, in the browser, instead of on the server.

## The free stack

| Capability | Provider | Cost | Notes |
|---|---|---|---|
| LLM (questions, follow-ups, report) | **Groq** `openai/gpt-oss-120b` | Free tier | OpenAI-compatible endpoint |
| Text-to-speech (questions) | **Groq Orpheus** (`austin` voice) | Free tier | Falls back to browser voice |
| Speech-to-text (answers) | **Browser Web Speech API** | Free | No key needed |

Every external integration also has a **fallback**, so the app stays demoable
even if a provider is unconfigured or rate-limited:
- **LLM** falls back to a deterministic mock generator (and also on a failed
  live call, so a mid-demo rate-limit degrades gracefully instead of erroring).
- **TTS** falls back to the browser's `speechSynthesis`.
- **STT** falls back to browser recognition, and typing is always available.

## Architecture

```
┌─────────────────┐         ┌──────────────────────────────┐
│  React + Vite   │  HTTP   │      Express (Node.js)        │
│   frontend      │◄───────►│  /api/resume  parse resume    │
│                 │         │  /api/interview/start          │
│  - upload UI    │         │  /api/interview/answer (loop)  │
│  - role picker  │         │  /api/interview/report         │
│  - voice loop   │         │  /api/tts   (Groq Orpheus)     │
│  - report view  │         │  /api/stt   (optional server)  │
└─────────────────┘         └───────────────┬──────────────┘
                                            │
                          ┌─────────────────┴───────────────┐
                          │ LLM  → Groq (OpenAI-compatible)  │
                          │ TTS  → Groq Orpheus              │
                          │ STT  → browser (default)         │
                          │ + fallbacks (no keys needed)     │
                          └──────────────────────────────────┘
```

**Pragmatic hackathon choices:**
- Interview session state is kept **in-memory** on the server (a `Map` keyed by
  session id). No database — an *in-progress* interview is lost on server
  restart.
- User profiles and completed **practice history** persist to a small JSON
  file (`server/data/db.json`), so — unlike the in-progress session above —
  they survive a server restart. It's still zero external services and zero
  cost; swap `server/src/store.js` for a real database later without
  touching any callers.
- Integrations are **decoupled**: the LLM, TTS, and STT each read their own env
  vars, so you can mix providers (e.g. Groq LLM + browser STT) freely.
- The frontend uses the browser's Web Speech API where server integrations
  aren't configured — great for offline/zero-cost demos.
- **Google Sign-In** follows the same fallback philosophy: if it isn't
  configured, the app runs as a guest (history saved to that browser via
  `localStorage`) instead of blocking anyone from using it.

## Prerequisites

- Node.js 18+ (uses global `fetch` and `FormData`)
- A free **Groq API key** — https://console.groq.com/keys (optional; without it
  the app runs in mock mode)

## Setup

```bash
# 1. Install backend deps
cd server
npm install

# 2. Install frontend deps
cd ../client
npm install
```

### Configure (Groq — free)

Copy the example env file and add your Groq key. **All keys are optional** —
without them the app falls back to mocks / browser voice.

```bash
cd server
cp .env.example .env
```

```
# LLM via Groq (OpenAI-compatible). If unset, a deterministic mock LLM is used.
OPENAI_API_KEY=gsk_...              # your free Groq key
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=openai/gpt-oss-120b

# Text-to-speech via Groq Orpheus. Reuses OPENAI_API_KEY if TTS_API_KEY unset.
# Requires a one-time model terms acceptance in the Groq console.
# Valid voices: autumn diana hannah austin daniel troy
TTS_BASE_URL=https://api.groq.com/openai/v1
TTS_MODEL=canopylabs/orpheus-v1-english
TTS_VOICE=austin
TTS_FORMAT=wav

# Speech-to-text: unset -> browser Web Speech recognition (free).
STT_API_KEY=
```

> **First-time TTS setup:** Groq's Orpheus model requires accepting its terms
> once. Open
> https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
> and accept, otherwise `/api/tts` will return an error and the app will fall
> back to the browser voice.

> **Security:** `.env` is gitignored — never commit your key. If a key is ever
> exposed, rotate it at https://console.groq.com/keys.

### Configure Google Sign-In (optional)

Without this, the app runs fine as a guest — history just stays on that one
device instead of following the user's account. To enable it:

1. Go to https://console.cloud.google.com/apis/credentials (any Google
   account; no billing required).
2. **Create Credentials → OAuth client ID → Web application.**
3. Under **Authorized JavaScript origins**, add every URL you'll open the app
   from, e.g. `http://localhost:5173` for local dev, plus your deployed
   client URL. (No redirect URI is needed — sign-in happens entirely in the
   browser via Google Identity Services.)
4. Copy the generated **Client ID** into *both* of these — it must be the
   exact same value in both places, since the server checks that the token's
   audience matches:

   ```bash
   # server/.env
   GOOGLE_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
   JWT_SECRET=any-long-random-string   # signs our own session tokens
   ```

   ```bash
   # client/.env  (copy client/.env.example first: cp client/.env.example client/.env)
   VITE_GOOGLE_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
   ```
5. Restart both the server and the client dev server so the new env vars
   are picked up.

`JWT_SECRET` can be left unset for a quick demo — a random secret is
generated at boot — but then everyone is signed out if the server restarts,
since it can no longer verify session tokens it issued before. Set a fixed
value to keep people signed in across restarts/deploys.

## Run

Open two terminals:

```bash
# Terminal 1 — backend on :4000
cd server
npm run dev     # or: npm start

# Terminal 2 — frontend on :5173 (proxies /api to :4000)
cd client
npm run dev
```

Then open **http://localhost:5173** (use **Chrome** for best Web Speech
support). Allow microphone access when prompted.

## Demo flow

1. (Optional) **Sign in with Google**, top right — or skip it and continue as
   a guest; either way the interview works the same.
2. Upload a resume (or click **Use sample resume**).
3. Pick a role.
4. Click **Start interview** — the AI asks a question, spoken aloud in the
   Austin voice.
5. Click **Record answer**, speak, then **Stop**. Your answer is transcribed.
6. The AI asks an adaptive follow-up. Repeat (up to 6 questions).
7. Click **Finish early & get report** (or reach the last question) to see your
   scored feedback. If you're signed in, this is saved to your account
   automatically; as a guest it's saved to this browser only.
8. Click **Profile** (top right) any time to revisit past sessions and reopen
   any report.

## Notes & limits

- **Groq free tier** is rate-limited (not billed): ~30 requests/min and
  1,000/day for the LLM; Orpheus TTS is ~10/min and 100/day. A full interview is
  ~7 LLM calls, so a demo sits well inside these limits.
- **Browser voice varies by OS/browser** — test TTS/STT on the machine you'll
  demo on. Chrome is recommended.
- **In-progress interviews don't persist** — restarting the server clears any
  interview that hasn't reached its final report yet. Completed reports for
  signed-in users (and the user profiles themselves) do persist, in
  `server/data/db.json` — the last 50 sessions per user are kept.
- **Guest history is per-browser** — it's stored in that browser's
  `localStorage`, so it won't show up on another device, and clearing site
  data clears it. Signing in with Google moves history to the server, where
  it follows the account instead.
- **On Render specifically**, `server/data/db.json` survives restarts but
  *not* redeploys (free-tier disk is ephemeral across deploys) — add a
  persistent disk if you need history to survive a redeploy.
