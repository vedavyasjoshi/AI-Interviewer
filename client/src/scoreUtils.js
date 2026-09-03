// Shared helpers for turning a raw 0–100 score into color + human verdict.

export function clampScore(n) {
  return Math.max(0, Math.min(100, Number(n) || 0));
}

// Traffic-light color ramp: red -> amber -> green.
export function scoreColor(score) {
  const s = clampScore(score);
  if (s >= 80) return '#4ee1a0'; // green  (accent-2)
  if (s >= 65) return '#8fe388'; // green-lime
  if (s >= 50) return '#ffcc66'; // amber  (warn)
  if (s >= 35) return '#ffa04d'; // orange
  return '#ff6b6b'; // red (danger)
}

// A short human verdict + longer takeaway for the hero header.
export function scoreBand(score) {
  const s = clampScore(score);
  if (s >= 85) return { label: 'Strong hire signal', tone: 'great' };
  if (s >= 70) return { label: 'Hire-leaning', tone: 'good' };
  if (s >= 55) return { label: 'Promising, needs polish', tone: 'ok' };
  if (s >= 40) return { label: 'Mixed — key gaps', tone: 'weak' };
  return { label: 'Not ready yet', tone: 'poor' };
}
