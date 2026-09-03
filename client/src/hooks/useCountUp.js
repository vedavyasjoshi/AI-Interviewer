import { useEffect, useRef, useState } from 'react';

// Animates a number from 0 up to `target` over `duration` ms using rAF and an
// ease-out curve. Used for the big score reveal and competency chips.
export function useCountUp(target, { duration = 1100, delay = 0 } = {}) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  useEffect(() => {
    const to = Number(target) || 0;
    let timeoutId;

    const tick = (now) => {
      if (!startRef.current) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(to * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(to);
      }
    };

    timeoutId = setTimeout(() => {
      startRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return value;
}
