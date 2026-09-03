import { useEffect, useRef, useState } from 'react';

// A lightweight stopwatch. Restarts whenever `resetKey` changes (e.g. a new
// question) and can be paused via `running`. Returns elapsed seconds and a
// getter for the precise elapsed ms at any moment (used when submitting).
export function useStopwatch(resetKey, running = true) {
  const [elapsed, setElapsed] = useState(0); // whole seconds, for display
  const startRef = useRef(Date.now());
  const rafRef = useRef(0);

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    if (!running) return undefined;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      rafRef.current = window.setTimeout(tick, 250);
    };
    rafRef.current = window.setTimeout(tick, 250);

    return () => {
      cancelled = true;
      clearTimeout(rafRef.current);
    };
  }, [resetKey, running]);

  const getElapsedMs = () => Date.now() - startRef.current;

  return { elapsed, getElapsedMs };
}

// Format seconds as m:ss.
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}
