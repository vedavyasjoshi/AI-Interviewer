import ScoreGauge from './charts/ScoreGauge.jsx';
import RadarChart from './charts/RadarChart.jsx';
import Sparkline from './charts/Sparkline.jsx';
import Confetti from './charts/Confetti.jsx';
import { useCountUp } from '../hooks/useCountUp.js';
import { clampScore, scoreColor, scoreBand } from '../scoreUtils.js';

// Animated competency bar with a count-up chip and a color-coded fill.
function CompetencyBar({ name, score, note, delay = 0 }) {
  const val = useCountUp(clampScore(score), { duration: 1100, delay });
  const color = scoreColor(score);
  return (
    <div className="comp-row">
      <div className="comp-head">
        <span>{name}</span>
        <span className="comp-chip" style={{ color, borderColor: `${color}66` }}>
          {Math.round(val)}
        </span>
      </div>
      <div className="bar">
        <div style={{ width: `${val}%`, background: color }} />
      </div>
      {note && <div className="comp-note">{note}</div>}
    </div>
  );
}

// Color-coded per-question card: colored left border + score chip.
function QuestionCard({ index, question, score, feedback }) {
  const color = scoreColor(score);
  return (
    <div className="pq" style={{ borderLeft: `4px solid ${color}` }}>
      <span className="pq-chip" style={{ color, borderColor: `${color}66` }}>
        {score}
      </span>
      <div className="pq-q">Q{index + 1}: {question}</div>
      {feedback && <div className="pq-fb">{feedback}</div>}
    </div>
  );
}

// Final step: render the LLM-generated evaluation report as a dashboard.
export default function ReportStep({ report, role, onRestart }) {
  if (!report) return null;
  const {
    overallScore = 0,
    summary,
    strengths = [],
    improvements = [],
    competencyScores = [],
    perQuestion = [],
  } = report;

  const overall = clampScore(overallScore);
  const band = scoreBand(overall);
  const bandColor = scoreColor(overall);
  const celebrate = overall >= 80;

  const radarData = competencyScores.map((c) => ({
    name: c.name,
    score: clampScore(c.score),
  }));
  const trend = perQuestion.map((q) => clampScore(q.score));

  return (
    <div className="report">
      <Confetti fire={celebrate} />

      {/* Hero header: gauge + verdict + summary */}
      <div className="card hero">
        <div className="step-label">Results</div>
        <div className="hero-grid">
          <ScoreGauge score={overall} />
          <div className="hero-body">
            <h2 className="hero-title">Interview report — {role}</h2>
            <div className={`band band-${band.tone}`} style={{ borderColor: `${bandColor}66`, color: bandColor }}>
              {band.label}
            </div>
            {summary && <p className="hero-summary">{summary}</p>}
          </div>
        </div>
      </div>

      {/* Radar + strengths/improvements side by side */}
      <div className="dash-grid">
        {radarData.length >= 3 && (
          <div className="card">
            <h3>Competency profile</h3>
            <div className="radar-wrap">
              <RadarChart data={radarData} />
            </div>
          </div>
        )}

        <div className="card">
          <h3>Breakdown</h3>
          {competencyScores.map((c, i) => (
            <CompetencyBar
              key={i}
              name={c.name}
              score={c.score}
              note={c.note}
              delay={i * 120}
            />
          ))}
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Strengths</h3>
          <ul className="list">
            {strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Areas to improve</h3>
          <ul className="list">
            {improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Per-question timeline */}
      {perQuestion.length > 0 && (
        <div className="card">
          <h3>Score across questions</h3>
          {trend.length >= 2 && (
            <div className="spark-wrap">
              <Sparkline scores={trend} />
            </div>
          )}
          <div className="pq-list">
            {perQuestion.map((q, i) => (
              <QuestionCard
                key={i}
                index={i}
                question={q.question}
                score={q.score}
                feedback={q.feedback}
              />
            ))}
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 4 }}>
        <div className="spacer" />
        <button className="primary" onClick={onRestart}>
          Start a new interview
        </button>
      </div>
    </div>
  );
}
