// Practice history for guests (not signed in). Kept on this device only, in
// localStorage — as soon as someone signs in with Google, history moves to
// the server and follows their account across devices instead.
const KEY = 'aiInterviewer.guestHistory';
const MAX_ENTRIES = 20;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function listLocalHistory() {
  return readAll();
}

export function addLocalHistory(entry) {
  const list = readAll();
  list.unshift(entry);
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or unavailable (private browsing) — history just won't persist.
  }
  return list;
}

export function clearLocalHistory() {
  localStorage.removeItem(KEY);
}
