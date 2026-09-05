import { useEffect, useState } from 'react';
import { getHealth, startInterview, getReport } from './api.js';
import { unlockSpeech } from './voice.js';
import { useAuth } from './hooks/useAuth.js';
import { addLocalHistory } from './localHistory.js';
import ResumeStep from './components/ResumeStep.jsx';
import RoleStep from './components/RoleStep.jsx';
import InterviewStep from './components/InterviewStep.jsx';
import ReportStep from './components/ReportStep.jsx';
import ProfileStep from './components/ProfileStep.jsx';
import AuthBar from './components/AuthBar.jsx';

// Phases: resume -> role -> interview -> report (+ profile, reachable any time)
export default function App() {
  const auth = useAuth();
  const [health, setHealth] = useState(null);
  const [phase, setPhase] = useState('resume');
  const [prevPhase, setPrevPhase] = useState('resume'); // where "← Back" from Profile returns to
  const [viewingHistory, setViewingHistory] = useState(false); // report opened from Profile, vs. just-finished
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
    setViewingHistory(false);
    setPhase('report');
    setError('');
    try {
      const res = await getReport(session.sessionId, auth.token);
      setReport(res.report);
      setReportRole(res.role);
      // Signed-in: the server already saved this to the account's history.
      // Guest: keep a device-local copy so Profile still has something to show.
      if (!res.saved) {
        addLocalHistory({
          id: session.sessionId,
          createdAt: Date.now(),
          role: res.role,
          difficulty: selectedDifficulty,
          overallScore: res.report?.overallScore ?? null,
          report: res.report, // keep the full report so "View report" works later
        });
      }
    } catch (e) {
      setError(e.message || 'Failed to generate report.');
    } finally {
      setLoadingReport(false);
    }
  }

  // Open the Profile page from wherever the user currently is.
  function openProfile() {
    setPrevPhase(phase);
    setPhase('profile');
  }

  // A history row was clicked on the Profile page — show that past report.
  function viewHistoryEntry(entry) {
    setReport(entry.report || entry); // guest entries are score-only, no full report body
    setReportRole(entry.role || '');
    setViewingHistory(true);
    setPhase('report');
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
    setViewingHistory(false);
    setError('');
    setPhase('resume');
  }

  // From the report screen: a freshly-finished interview starts a new one;
  // a report opened from Profile just goes back there instead.
  function handleReportDone() {
    if (viewingHistory) {
      setPhase('profile');
    } else {
      restart();
    }
  }

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <img className="brand-logo" src="/garuda-logo.png" alt="Garuda" />
          <span className="brand-name">Garuda</span>
          <span className="brand-sub">AI Interview Coach</span>
        </div>
        <AuthBar
          user={auth.user}
          checking={auth.checking}
          googleAuthConfigured={auth.googleAuthConfigured}
          mountButton={auth.mountButton}
          signOut={auth.signOut}
          onOpenProfile={openProfile}
        />
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
            <ReportStep
              report={report}
              role={reportRole}
              onRestart={handleReportDone}
              restartLabel={viewingHistory ? '← Back to profile' : 'Start a new interview'}
            />
          )}
        </>
      )}

      {phase === 'profile' && (
        <ProfileStep
          user={auth.user}
          token={auth.token}
          onViewReport={viewHistoryEntry}
          onBack={() => setPhase(prevPhase === 'profile' ? 'resume' : prevPhase)}
        />
      )}

      <p className="small muted" style={{ marginTop: 24, textAlign: 'center' }}>
        {auth.user
          ? 'Signed in — your practice history is saved to your account.'
          : 'Guest mode — history saved on this device only, until you sign in.'}
      </p>
    </div>
  );
}
