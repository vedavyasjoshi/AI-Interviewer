import { useEffect, useState } from 'react';
import { clampScore } from '../../scoreUtils.js';

// Split a longish multi-word label across two balanced lines so it fits
// within the chart padding instead of overflowing the SVG viewBox.
function wrapLabel(name, maxChars = 12) {
  if (name.length <= maxChars || !name.includes(' ')) return [name];
  const words = name.split(' ');
  let best = { first: words[0], second: words.slice(1).join(' '), diff: Infinity };
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(' ');
    const second = words.slice(i).join(' ');
    const diff = Math.abs(first.length - second.length);
    if (diff < best.diff) best = { first, second, diff };
  }
  return [best.first, best.second];
}

// N-axis radar/spider chart for competencies. Pure SVG.
// The data polygon scales up from the center on mount for a reveal effect.
export default function RadarChart({ data = [], size = 300, max = 100 }) {
  const [grown, setGrown] = useState(0); // 0 -> 1 animation progress
  const n = data.length;

  useEffect(() => {
    let raf;
    let start;
    const dur = 900;
    const tick = (now) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / dur);
      setGrown(1 - Math.pow(1 - t, 3)); // easeOutCubic
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data]);

  if (n < 3) return null;

  const center = size / 2;
  const radius = center - 68; // leave room for (potentially long) labels
  const levels = [0.25, 0.5, 0.75, 1];

  // Angle for axis i, starting at the top and going clockwise.
  const angleFor = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointAt = (i, r) => ({
    x: center + Math.cos(angleFor(i)) * radius * r,
    y: center + Math.sin(angleFor(i)) * radius * r,
  });

  const gridPolygon = (level) =>
    data
      .map((_, i) => {
        const p = pointAt(i, level);
        return `${p.x},${p.y}`;
      })
      .join(' ');

  const dataPoints = data.map((d, i) => {
    const frac = clampScore(d.score) / max;
    return pointAt(i, frac * grown);
  });
  const dataPolygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <svg
      className="radar"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* concentric grid rings */}
      {levels.map((lvl) => (
        <polygon
          key={lvl}
          points={gridPolygon(lvl)}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}

      {/* spokes */}
      {data.map((_, i) => {
        const p = pointAt(i, 1);
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="var(--border)"
            strokeWidth="1"
          />
        );
      })}

      {/* data area */}
      <polygon
        points={dataPolygon}
        fill="rgba(108,140,255,0.28)"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="var(--accent)" />
      ))}

      {/* axis labels — wrapped onto two lines when long so they don't clip */}
      {data.map((d, i) => {
        const lp = pointAt(i, 1.12);
        const a = angleFor(i);
        const cos = Math.cos(a);
        const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
        // Nudge side labels a touch further out horizontally for breathing room.
        const dx = Math.abs(cos) < 0.3 ? 0 : cos > 0 ? 4 : -4;
        const lines = wrapLabel(d.name);
        return (
          <text
            key={i}
            x={lp.x + dx}
            y={lp.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="radar-label"
          >
            {lines.map((line, li) => (
              <tspan
                key={li}
                x={lp.x + dx}
                dy={li === 0 ? `${-(lines.length - 1) * 0.55}em` : '1.1em'}
              >
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
