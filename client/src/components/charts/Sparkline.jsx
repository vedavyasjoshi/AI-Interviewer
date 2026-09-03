import { useEffect, useState } from 'react';
import { clampScore, scoreColor } from '../../scoreUtils.js';

// Compact score-over-time strip across questions. Pure SVG.
// The line draws itself in on mount (stroke-dashoffset) and dots pop in.
export default function Sparkline({ scores = [], width = 620, height = 90 }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (scores.length < 2) return null;

  const padX = 14;
  const padY = 16;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const n = scores.length;

  const xFor = (i) => padX + (innerW * i) / (n - 1);
  const yFor = (s) => padY + innerH * (1 - clampScore(s) / 100);

  const points = scores.map((s, i) => ({ x: xFor(i), y: yFor(s), s }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath =
    `M ${points[0].x} ${height - padY} ` +
    points.map((p) => `L ${p.x} ${p.y}`).join(' ') +
    ` L ${points[n - 1].x} ${height - padY} Z`;

  // Rough path length for the draw-in animation.
  const pathLen = width * 1.4;

  return (
    <svg
      className="sparkline"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={areaPath} fill="url(#sparkFill)" opacity={drawn ? 1 : 0}
        style={{ transition: 'opacity 0.6s ease 0.4s' }} />

      <path
        d={linePath}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLen}
        strokeDashoffset={drawn ? 0 : pathLen}
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />

      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r="4"
            fill={scoreColor(p.s)}
            stroke="var(--panel)"
            strokeWidth="2"
            opacity={drawn ? 1 : 0}
            style={{ transition: `opacity 0.3s ease ${0.6 + i * 0.08}s` }}
          />
          <text x={p.x} y={height - 2} textAnchor="middle" className="spark-label">
            Q{i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
