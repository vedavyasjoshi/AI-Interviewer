import { useEffect, useState } from 'react';
import { getHistory } from '../api.js';
import { listLocalHistory } from '../localHistory.js';
import { clampScore, scoreColor } from '../scoreUtils.js';

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function HistoryRow({ entry, onView }) {
  const score = clampScore(entry.overallScore);
  const color = scoreColor(score);
  return (
    <div className="pq" style={{ borderLeft: `4px solid ${color}` }}>
      <span className="pq-chip" style={{ color, borderColor: `${color}66` }}>
        {score}
      </span>
      <div className="pq-q" style={{ paddingRight: 90 }}>
        {entry.role || 'Interview'}
        {entry.difficulty ? ` · ${entry.difficulty}` : ''}
      </div>
      <div className="pq-time">{formatDate(entry.createdAt)}</div>
      <div className="row" style={{ marginTop: 10 }}>
        <div className="spacer" />
        <button className="ghost small" onClick={() => onView(entry)}>
          View report
        </button>
      </div>
    </div>
  );
}

// Shows the signed-in user's server-side history, or — for guests — the
// device-local history saved in this browser only.
export default function ProfileStep({ user, token, onViewReport, onBack }) {
  const [history, setHistory] = useState(user ? null : listLocalHistory());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    getHistory(token)
      .then((res) => {
        if (!cancelled) setHistory(res.history);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Failed to load history.');
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  const entries = history || [];

  return (
    <div className="card">
      <div className="hero-top">
        <div className="step-label">Profile</div>
        <button className="ghost small" onClick={onBack}>
          ← Back
        </button>
      </div>

      {user ? (
        <div className="row" style={{ marginBottom: 18 }}>
          {user.picture && <img className="avatar avatar-lg" src={user.picture} alt="" referrerPolicy="no-referrer" />}
          <div>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div className="small muted">{user.email}</div>
          </div>
        </div>
      ) : (
        <div className="insight insight-gap" style={{ marginBottom: 18 }}>
          <span className="insight-icon">⚠️</span>
          <span>
            You're browsing as a guest — this history is saved on this device only. Sign in with Google
            (top right) to keep it across devices.
          </span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <h3 style={{ marginTop: 0 }}>Practice history</h3>
      {entries.length === 0 ? (
        <p className="small muted">No practice sessions yet — finish an interview to see it here.</p>
      ) : (
        <div className="pq-list">
          {entries.map((entry) => (
            <HistoryRow key={entry.id || entry.createdAt} entry={entry} onView={onViewReport} />
          ))}
        </div>
      )}
    </div>
  );
}
