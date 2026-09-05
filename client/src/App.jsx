import { useEffect, useState } from 'react';
import { getHealth, startInterview, getReport } from './api.js';
import { unlockSpeech } from './voice.js';
import ResumeStep from './components/ResumeStep.jsx';
import RoleStep from './components/RoleStep.jsx';
import InterviewStep from './components/InterviewStep.jsx';
import ReportStep from './components/ReportStep.jsx';

// Phases: resume -> role -> interview -> report
export default function App() {
  const [health, setHealth] = useState(null);
  const [phase, setPhase] = useState('resume');
  const [error, setError] = useState('');

  const [resume, setResume] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [customRole, setCustomRole] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('medium');

  const [session, setSession] = useState(null); // { sessionId, question, questionNumber, maxQuestions }
  const [starting, setStarting] = useState(false);
  const [report, setReport] = useState(null);
  const [reportRole, setReportRole] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setError('Could not reach the backend. Is the server running on :4000?'));
  }, []);

  const roles = health?.roles || [];
  const difficulties = health?.difficulties || [];
  const integrations = health?.integrations || { llm: false, tts: false, stt: false };

  async function handleStart() {
    const custom = customRole.trim();
    if (!resume || (!selectedRole && !custom)) return;
    // Prime the browser speech engine while we still have the click gesture,
    // so the first auto-spoken question is allowed to play (Chrome autoplay).
    unlockSpeech();
    setStarting(true);
    setError('');
    try {
      const res = await startInterview(
        resume,
        custom ? null : selectedRole,
        selectedDifficulty,
        custom || null
      );
      setSession(res);
      setPhase('interview');
    } catch (e) {
      setError(e.message || 'Failed to start interview.');
    } finally {
      setStarting(false);
    }
  }

  function handleFollowUp(question, questionNumber) {
    setSession((s) => ({ ...s, question, questionNumber }));
  }

  async function handleDone() {
    setLoadingReport(true);
    setPhase('report');
    setError('');
    try {
      const res = await getReport(session.sessionId);
      setReport(res.report);
      setReportRole(res.role);
    } catch (e) {
      setError(e.message || 'Failed to generate report.');
    } finally {
      setLoadingReport(false);
    }
  }

  // Let the user end early and jump to the report.
  async function finishEarly() {
    if (!session) return;
    await handleDone();
  }

  function restart() {
    setResume(null);
    setSelectedRole(null);
    setCustomRole('');
    setSelectedDifficulty('medium');
    setSession(null);
    setReport(null);
    setReportRole('');
    setError('');
    setPhase('resume');
  }

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <img className="brand-logo" src="/garuda-logo.png" alt="Garuda" />
          <span className="brand-name">Garuda</span>
          <span className="brand-sub">AI Interview Coach</span>
        </div>
      </div>
      <p className="subtitle">
        Practice, analyze, improve. Upload your resume, pick a role, and run an adaptive voice interview with instant feedback.
      </p>

      {health && (
        <div className="badges" style={{ marginBottom: 20 }}>
          <span className={`badge ${integrations.llm ? 'on' : 'mock'}`}>
            LLM: {integrations.llm ? (integrations.llmModel || 'connected') : 'mock mode'}
          </span>
          <span className={`badge ${integrations.tts ? 'on' : 'mock'}`}>
            TTS: {integrations.tts ? (integrations.ttsProvider || 'server voice') : 'browser voice'}
          </span>
          <span className={`badge ${integrations.stt ? 'on' : 'mock'}`}>
            STT: {integrations.stt ? (integrations.sttProvider || 'server') : 'browser voice'}
          </span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {phase === 'resume' && (
        <>
          <ResumeStep
            resume={resume}
            onParsed={(r) => setResume(r)}
            onError={setError}
          />
          {resume && (
            <RoleStep
              roles={roles}
              selectedRole={selectedRole}
              onSelect={setSelectedRole}
              customRole={customRole}
              onCustomRole={setCustomRole}
              difficulties={difficulties}
              selectedDifficulty={selectedDifficulty}
              onSelectDifficulty={setSelectedDifficulty}
              onStart={handleStart}
              canStart={Boolean(resume && (selectedRole || customRole.trim()))}
              starting={starting}
            />
          )}
        </>
      )}

      {phase === 'interview' && session && (
        <>
          <InterviewStep
            sessionId={session.sessionId}
            integrations={integrations}
            question={session.question}
            questionNumber={session.questionNumber}
            maxQuestions={session.maxQuestions}
            onFollowUp={handleFollowUp}
            onDone={handleDone}
            onError={setError}
          />
          <div className="row">
            <div className="spacer" />
            <button className="ghost small" onClick={finishEarly}>
              Finish early & get report
            </button>
          </div>
        </>
      )}

      {phase === 'report' && (
        <>
          {loadingReport ? (
            <div className="card">
              <h2>Generating your report…</h2>
              <p className="muted">Evaluating your answers and scoring competencies.</p>
            </div>
          ) : (
            <ReportStep report={report} role={reportRole} onRestart={restart} />
          )}
        </>
      )}

      <p className="small muted" style={{ marginTop: 24, textAlign: 'center' }}>
        In-memory sessions · works fully offline in mock mode.
      </p>
    </div>
  );
}
