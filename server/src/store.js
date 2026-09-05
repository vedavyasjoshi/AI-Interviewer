// -----------------------------------------------------------------------
// Tiny JSON-file store for users + practice history.
//
// The interview session itself stays in-memory (see index.js) — that's
// still fine for a short-lived demo session. But a user's *profile* and
// *history across sessions* need to survive a server restart, or "Profile"
// would be pointless. Rather than bring in a real database for a hackathon
// MVP, we persist a small JSON file to disk. It's still zero external
// dependencies and zero cost — just durable instead of purely in-memory.
//
// Swap this module out for a real DB later without touching callers: every
// exported function here is already async.
// -----------------------------------------------------------------------
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const MAX_HISTORY_PER_USER = 50; // keep the file small; oldest entries drop off

// In-memory cache, mirrored to disk on every write. Avoids re-reading the
// file on every request while still persisting across restarts.
let cache = null;
let writeQueue = Promise.resolve(); // serialize writes so they never race

async function ensureLoaded() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8');
    cache = JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Store: failed to read db.json, starting fresh.', err);
    }
    cache = { users: {} };
  }
  return cache;
}

async function persist() {
  // Chain onto the queue so concurrent calls don't stomp on each other.
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmpPath = `${DB_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(cache, null, 2), 'utf-8');
    await fs.rename(tmpPath, DB_PATH); // atomic-ish swap
  });
  return writeQueue;
}

/** Fetch a user record by their Google user id ("sub"), or null. */
export async function getUser(userId) {
  const db = await ensureLoaded();
  return db.users[userId] || null;
}

/** Create the user on first sign-in, or refresh their profile fields on every sign-in. */
export async function upsertUser({ id, email, name, picture }) {
  const db = await ensureLoaded();
  const existing = db.users[id];
  db.users[id] = {
    id,
    email,
    name,
    picture,
    createdAt: existing?.createdAt || Date.now(),
    history: existing?.history || [],
  };
  await persist();
  return db.users[id];
}

/** Append a completed interview report to a user's history (most recent first). */
export async function addHistoryEntry(userId, entry) {
  const db = await ensureLoaded();
  const user = db.users[userId];
  if (!user) return null;
  user.history.unshift(entry);
  if (user.history.length > MAX_HISTORY_PER_USER) {
    user.history.length = MAX_HISTORY_PER_USER;
  }
  await persist();
  return entry;
}

/** List a user's history, most recent first. */
export async function getHistory(userId) {
  const db = await ensureLoaded();
  return db.users[userId]?.history || [];
}
