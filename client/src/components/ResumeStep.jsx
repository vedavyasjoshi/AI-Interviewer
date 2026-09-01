import { useRef, useState } from 'react';
import { uploadResume, parseResumeText } from '../api.js';
import { SAMPLE_RESUME_TEXT } from '../sampleResume.js';

// Step 1: upload a resume file (or use the sample), parse it, and show the
// extracted structured info.
export default function ResumeStep({ resume, onParsed, onError }) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    onError('');
    try {
      const { resume } = await uploadResume(file);
      onParsed(resume, file.name);
    } catch (e) {
      onError(e.message || 'Failed to parse resume.');
    } finally {
      setBusy(false);
    }
  }

  async function useSample() {
    setBusy(true);
    onError('');
    try {
      const { resume } = await parseResumeText(SAMPLE_RESUME_TEXT);
      onParsed(resume, 'sample-resume.txt');
    } catch (e) {
      onError(e.message || 'Failed to load sample.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="step-label">Step 1</div>
      <h2>Upload your resume</h2>

      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        {busy ? 'Parsing…' : 'Drag & drop a PDF, DOCX, or TXT here, or click to browse.'}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="ghost" onClick={useSample} disabled={busy}>
          Use sample resume
        </button>
      </div>

      {resume && <ParsedResume resume={resume} />}
    </div>
  );
}

function ParsedResume({ resume }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h3>Extracted profile</h3>
      {resume.name && (
        <div style={{ marginBottom: 8 }}>
          <strong>{resume.name}</strong>
        </div>
      )}
      {resume.summary && <p className="small muted">{resume.summary}</p>}

      {resume.skills?.length > 0 && (
        <>
          <h3>Skills</h3>
          <div className="chips">
            {resume.skills.map((s) => (
              <span className="chip" key={s}>
                {s}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="two-col" style={{ marginTop: 14 }}>
        <ListBlock title="Experience" items={resume.experience} />
        <ListBlock title="Projects" items={resume.projects} />
      </div>
      <ListBlock title="Education" items={resume.education} />
    </div>
  );
}

function ListBlock({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3>{title}</h3>
      <ul className="list">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
