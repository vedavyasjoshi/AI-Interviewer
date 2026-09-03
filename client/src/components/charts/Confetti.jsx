import { useEffect, useRef } from 'react';

// Lightweight one-shot confetti burst on a full-screen canvas. No library.
// Renders nothing structurally visible; just animates then fades out.
export default function Confetti({ fire = false, count = 140 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!fire) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const W = window.innerWidth;
    const colors = ['#6c8cff', '#4ee1a0', '#ffcc66', '#ff6b6b', '#8a6cff', '#ffffff'];
    const parts = Array.from({ length: count }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 120,
      y: window.innerHeight * 0.32,
      vx: (Math.random() - 0.5) * 10,
      vy: Math.random() * -12 - 4,
      size: Math.random() * 7 + 4,
      color: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 0,
    }));

    let raf;
    const gravity = 0.35;
    const maxLife = 160;
    const start = performance.now();

    const frame = (now) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of parts) {
        p.life += 1;
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const fade = Math.max(0, 1 - p.life / maxLife);
        if (fade > 0 && p.y < window.innerHeight + 20) alive = true;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive && elapsed < 4000) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [fire, count]);

  if (!fire) return null;
  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />;
}
