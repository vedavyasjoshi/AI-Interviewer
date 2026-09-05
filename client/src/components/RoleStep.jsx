// Step 2: pick a target role (built-in or custom) and difficulty level.
export default function RoleStep({
  roles,
  selectedRole,
  onSelect,
  customRole,
  onCustomRole,
  difficulties = [],
  selectedDifficulty,
  onSelectDifficulty,
  onStart,
  canStart,
  starting,
}) {
  // Picking a built-in role clears any custom text, and vice versa.
  function pickRole(id) {
    onCustomRole('');
    onSelect(id);
  }
  function typeCustom(value) {
    if (value) onSelect(null);
    onCustomRole(value);
  }

  return (
    <div className="card">
      <div className="step-label">Step 2</div>
      <h2>Choose your target role</h2>
      <div className="roles">
        {roles.map((role) => (
          <button
            key={role.id}
            className={`role ${selectedRole === role.id ? 'selected' : ''}`}
            onClick={() => pickRole(role.id)}
          >
            <div className="role-name">{role.label}</div>
            <div className="role-comp">{role.competencies.join(' · ')}</div>
          </button>
        ))}
      </div>

      <h3>Or enter a custom role</h3>
      <input
        className={`custom-role ${customRole.trim() ? 'active' : ''}`}
        type="text"
        value={customRole}
        onChange={(e) => typeCustom(e.target.value)}
        placeholder="e.g. DevOps Engineer, or paste a job description…"
      />

      {difficulties.length > 0 && (
        <>
          <h3>Difficulty level</h3>
          <div className="difficulty-row">
            {difficulties.map((d) => (
              <button
                key={d.id}
                className={`level ${selectedDifficulty === d.id ? 'selected' : ''}`}
                onClick={() => onSelectDifficulty(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        <div className="spacer" />
        <button className="primary" onClick={onStart} disabled={!canStart || starting}>
          {starting ? 'Starting…' : 'Start interview →'}
        </button>
      </div>
    </div>
  );
}
