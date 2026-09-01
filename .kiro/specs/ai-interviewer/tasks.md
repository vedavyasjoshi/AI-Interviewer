# Implementation Plan — AI Mock Interviewer

This checklist traces the design into discrete, buildable steps. The core
product (Node + Express backend, React + Vite frontend, LLM/TTS/STT integrations
with fallbacks) is already implemented, so those tasks are checked off. The
remaining unchecked work is the automated test suite, which has no runner
configured yet (see Design → Testing strategy).

Task references point at the relevant Design sections and the concrete files
that satisfy each step.

## 1. Project scaffolding & capability probe

- [x] 1.1 Stand up the Express backend (`server/src/index.js`): CORS, JSON body
  limit (2 MB), `multer` in-memory uploads (10 MB cap), in-memory `sessions`
  `Map`, and the `MAX_QUESTIONS = 6` cap.
  _Design: Architecture; Components → Backend (`index.js`); Interview state machine._
- [x] 1.2 Stand up the React + Vite frontend shell (`client/index.html`,
  `client/src/main.jsx`, `client/src/App.jsx`, `client/vite.config.js`) with the
  `/api` dev proxy to `:4000`.
  _Design: Architecture; Same-origin API via dev proxy._
- [x] 1.3 Implement `GET /api/health` capability probe returning
  `{ ok, integrations: { llm, tts, stt }, roles, maxQuestions }` and consume it
  on `App.jsx` mount to store `integrations` + `roles` and gate the UI.
  _Design: Key architectural decisions (capability probe); API → `GET /api/health`._
- [x] 1.4 Build the `App.jsx` phase state machine
  (`resume → role → interview → report`) holding `resume`, `selectedRole`,
  `session`, `report`, with `restart` reset.
  _Design: Interview state machine → Frontend phase machine._
- [x] 1.5 Provide the thin fetch client (`client/src/api.js`) that normalizes
  errors (throws `Error(data.error)` on non-2xx) and returns `null` from server
  TTS/STT helpers on `501`/failure.
  _Design: Components → `api.js`; Client contract nuances._

## 2. Resume upload & parsing

- [x] 2.1 Implement `resumeParser.extractText` for PDF (`pdf-parse`), DOCX
  (`mammoth`), and UTF-8 text/markdown.
  _Design: Components → Backend (`resumeParser.js`); Data models → Resume._
- [x] 2.2 Implement `resumeParser.structureResume` heuristics: section
  splitting, `SKILL_DICTIONARY` matching (word boundaries, `c++`/`c#` escaping),
  name/summary guessing, entry grouping with caps, `rawText` capped at 12000
  chars.
  _Design: Data models → Resume._
- [x] 2.3 Expose `POST /api/resume` (multipart) and `POST /api/resume/text`
  returning `{ resume }`, with `400` on missing input and `500` on parse
  failure.
  _Design: API → `POST /api/resume`, `POST /api/resume/text`._
- [x] 2.4 Build `ResumeStep.jsx`: drag/drop or browse upload
  (`.pdf/.docx/.txt/.md`), paste/sample resume path, and render the extracted
  structured profile.
  _Design: Components → `ResumeStep.jsx`._

## 3. Role selection

- [x] 3.1 Define the static role catalog (`server/src/roles.js`) with `focus`
  (prompt guidance) + `competencies`, and `getRole` / `listRoles` (client-facing
  `listRoles` omits `focus`).
  _Design: Components → Backend (`roles.js`); Data models → Role._
- [x] 3.2 Build `RoleStep.jsx` to render roles from `/api/health`, capture the
  selected `roleId`, and trigger `Start interview`.
  _Design: Components → `RoleStep.jsx`._

## 4. LLM question generation & session start

- [x] 4.1 Implement the OpenAI-compatible `chat(messages, { json, temperature })`
  call in `llm.js`, configured via `OPENAI_API_KEY` / `OPENAI_BASE_URL` /
  `OPENAI_MODEL`, exposing `llmConfigured`.
  _Design: External integration abstraction → LLM._
- [x] 4.2 Implement `generateFirstQuestion(resume, role)` with the
  `mockFirstQuestion` deterministic fallback (greets by name, asks about top
  skill/project).
  _Design: External integration abstraction → LLM._
- [x] 4.3 Implement `POST /api/interview/start`: create a session
  (`randomUUID()`), generate Q1, store it as `pendingQuestion`, and return
  `{ sessionId, question, questionNumber: 1, maxQuestions }`.
  _Design: API → `POST /api/interview/start`; Data models → Session; Server adaptive loop._

## 5. Text-to-speech (TTS)

- [x] 5.1 Implement `tts.synthesize(text)` → MP3 buffer via ElevenLabs
  (`ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL`),
  exposing `ttsConfigured`.
  _Design: Components → Backend (`tts.js`); External integration → TTS._
- [x] 5.2 Expose `POST /api/tts` returning `audio/mpeg` bytes, `400` on missing
  text, and `501` when TTS is unconfigured.
  _Design: API → `POST /api/tts`._
- [x] 5.3 Implement client TTS: `speakBrowser` (SpeechSynthesis) and
  `playAudioUrl` (server MP3) in `voice.js`, preferring server TTS when
  `integrations.tts` and falling back to browser speech on `null`.
  _Design: Components → `voice.js`; External integration → TTS (fallback)._

## 6. STT & the client voice loop

- [x] 6.1 Implement `stt.transcribe(buffer, filename, mimetype)` via OpenAI
  Whisper (reuses `OPENAI_API_KEY`, `OPENAI_STT_MODEL` default `whisper-1`),
  exposing `sttConfigured`.
  _Design: Components → Backend (`stt.js`); External integration → STT._
- [x] 6.2 Expose `POST /api/stt` (multipart `audio`) returning `{ text }`, `400`
  on missing audio, and `501` when STT is unconfigured.
  _Design: API → `POST /api/stt`._
- [x] 6.3 Implement client capture primitives in `voice.js`: `createRecorder`
  (MediaRecorder → Blob), `BrowserSpeechRecognizer` (live SpeechRecognition),
  and `hasBrowserSTT`.
  _Design: Components → `voice.js`; External integration → STT (fallback)._
- [x] 6.4 Build the `InterviewStep.jsx` per-question loop: speak question →
  record (server MediaRecorder+Whisper or browser recognition) → transcribe →
  submit → route to follow-up or completion, with replay and typed-answer
  fallback.
  _Design: Interview state machine → Per-question loop; Components → `InterviewStep.jsx`._

## 7. Adaptive follow-up loop

- [x] 7.1 Implement `generateFollowUp(resume, role, history)` receiving the full
  rendered transcript, with the `mockFollowUp` fallback cycling role-specific
  templates keyed by `role.id`.
  _Design: External integration → LLM; Server adaptive loop._
- [x] 7.2 Implement `POST /api/interview/answer`: commit the answer to `history`,
  clear `pendingQuestion`, and either return an adaptive follow-up or signal
  `done: true` when `history.length >= MAX_QUESTIONS`.
  _Design: API → `POST /api/interview/answer`; Server adaptive loop._

## 8. Report generation & rendering

- [x] 8.1 Implement `generateReport(resume, role, history)` requesting a JSON
  report, with `mockReport` (heuristic `scoreAnswer` → overall/competency
  spread/strengths/improvements) as the fallback, including the malformed-JSON
  degradation path.
  _Design: External integration → LLM (extra resilience); Data models → Report._
- [x] 8.2 Expose `POST /api/interview/report` returning
  `{ report, role, history }`, with `404` on unknown session and `400` on empty
  history.
  _Design: API → `POST /api/interview/report`._
- [x] 8.3 Build `ReportStep.jsx`: overall score, summary, competency bars,
  strengths, improvements, per-question feedback, defensively defaulting every
  field so partial reports still render.
  _Design: Components → `ReportStep.jsx`; Data models → Report._

## 9. Integration fallbacks & health-driven branching

- [x] 9.1 Isolate each integration behind a `*Configured` flag derived from env
  vars and branch on the flag rather than try/catch of the integration.
  _Design: External integration abstraction with fallbacks._
- [x] 9.2 Wire the client fallback chain: detect capability via `/api/health` →
  prefer server integration → fall back to browser mock/speech → allow manual
  typed text as the ultimate fallback.
  _Design: External integration abstraction (uniform pattern)._

## 10. Error handling

- [x] 10.1 Wrap backend route handlers in try/catch, log to `console.error`, and
  return `{ error, detail? }` with correct status codes (`400`/`404`/`500`/`501`).
  _Design: Error handling._
- [x] 10.2 Enforce session/answer/report guards: `404` unknown/expired session,
  `400` when no `pendingQuestion`, `400` when `history` is empty.
  _Design: Error handling._
- [x] 10.3 Surface frontend errors via the `error` banner, keep voice failures
  non-fatal (fall back / prompt to type), and show the health-probe failure
  message that gates the interview UI.
  _Design: Error handling._

## 11. Automated testing (outstanding — no runner configured yet)

- [ ] 11.1 Add a backend test runner (Node's built-in `node:test` or Vitest) plus
  a `test` script in `server/package.json`; this is the prerequisite step before
  writing the suite.
  _Design: Testing strategy → Suggested tooling._
- [ ] 11.2 Backend unit tests for `resumeParser.structureResume`: section
  splitting, skill-dictionary matching (`c++`/`c#` escaping, word boundaries),
  name/summary guessing, entry grouping and caps.
  _Design: Testing strategy → Unit tests (backend)._
- [ ] 11.3 Backend unit tests for `llm` mock functions with `OPENAI_API_KEY`
  unset: `mockFirstQuestion` personalization, `mockFollowUp` template cycling per
  `role.id`, `mockReport` `scoreAnswer` thresholds and aggregation.
  _Design: Testing strategy → Unit tests (backend)._
- [ ] 11.4 Backend unit test for the `generateReport` JSON-failure path: stub
  `chat` to return non-JSON and assert fallback to `mockReport`.
  _Design: Testing strategy → Unit tests (backend); External integration (extra resilience)._
- [ ] 11.5 Backend unit tests for `roles`: `getRole` unknown id → `null`;
  `listRoles` omits `focus`.
  _Design: Testing strategy → Unit tests (backend)._
- [ ] 11.6 Backend HTTP integration tests (e.g. `supertest`, keys unset):
  `/api/health` shape + `maxQuestions`; `/api/resume/text` happy path + `400`;
  full `start → answer × N → report` lifecycle with `questionNumber` progression
  and `done:true` at `MAX_QUESTIONS`; error paths (`404`/`400`); `/api/tts` and
  `/api/stt` `501` when unconfigured.
  _Design: Testing strategy → Integration tests (backend, HTTP)._
- [ ] 11.7 Add a frontend test runner (Vitest + React Testing Library) plus a
  `test` script in `client/package.json`.
  _Design: Testing strategy → Suggested tooling._
- [ ] 11.8 Frontend unit tests for `api.js`: `serverTTS`/`serverSTT` return
  `null` on `501` and non-2xx; `json()` throws with the server `error` message.
  _Design: Testing strategy → Frontend tests._
- [ ] 11.9 Frontend tests for the `App` phase machine
  (`resume → role → interview → report` and `restart` reset) with mocked `api`.
  _Design: Testing strategy → Frontend tests._
- [ ] 11.10 Frontend tests for `InterviewStep` fallback branching: browser STT
  when `integrations.stt=false`, server STT path otherwise, and typed-answer
  submission; mock `voice.js` and `api`.
  _Design: Testing strategy → Frontend tests._
- [ ] 11.11 Document the manual/demo verification checklist: zero-key run (mock
  LLM + browser TTS/STT), keyed run (real LLM/ElevenLabs/Whisper), and
  cross-browser Web Speech availability.
  _Design: Testing strategy → Manual / demo verification._
