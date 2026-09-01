// Final step: render the LLM-generated evaluation report.
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

  return (
    <div className="card">
      <div className="step-label">Results</div>
      <h2>Interview report — {role}</h2>

      <div className="score-ring">
        <div className="score-num">
          {overallScore}
          <span>/100</span>
        </div>
        <div style={{ flex: 1 }}>
          <div className="bar">
            <div style={{ width: `${Math.max(0, Math.min(100, overallScore))}%` }} />
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>{summary}</p>
        </div>
      </div>

      {competencyScores.length > 0 && (
        <>
          <h3>Competencies</h3>
          {competencyScores.map((c, i) => (
            <div className="comp-row" key={i}>
              <div className="comp-head">
                <span>{c.name}</span>
                <span>{c.score}/100</span>
              </div>
              <div className="bar">
                <div style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} />
              </div>
              {c.note && <div className="comp-note">{c.note}</div>}
            </div>
          ))}
        </>
      )}

      <div className="two-col" style={{ marginTop: 8 }}>
        <div>
          <h3>Strengths</h3>
          <ul className="list">
            {strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Areas to improve</h3>
          <ul className="list">
            {improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {perQuestion.length > 0 && (
        <>
          <h3>Per-question feedback</h3>
          {perQuestion.map((q, i) => (
            <div className="pq" key={i}>
              <span className="pq-score">{q.score}/100</span>
              <div className="pq-q">Q{i + 1}: {q.question}</div>
              {q.feedback && <div className="pq-fb">{q.feedback}</div>}
            </div>
          ))}
        </>
      )}

      <div className="row" style={{ marginTop: 20 }}>
        <div className="spacer" />
        <button className="primary" onClick={onRestart}>
          Start a new interview
        </button>
      </div>
    </div>
  );
}
