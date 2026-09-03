import { useCountUp } from '../../hooks/useCountUp.js';
import { clampScore, scoreColor } from '../../scoreUtils.js';

// Big animated donut/radial gauge for the overall score. Pure SVG.
// The stroke fills on mount via a stroke-dashoffset transition while the
// center number counts up in sync.
export default function ScoreGauge({ score = 0, size = 200, stroke = 16 }) {
  const target = clampScore(score);
  const value = useCountUp(target, { duration: 1300 });
  const color = scoreColor(target);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const center = size / 2;

  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.85" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        {/* track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--panel-2)"
          strokeWidth={stroke}
        />
        {/* progress */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="gauge-center">
        <div className="gauge-num" style={{ color }}>
          {Math.round(value)}
          <span>/100</span>
        </div>
      </div>
    </div>
  );
}
