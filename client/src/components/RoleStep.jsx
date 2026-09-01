// Step 2: pick one of the three target roles.
export default function RoleStep({ roles, selectedRole, onSelect, onStart, canStart, starting }) {
  return (
    <div className="card">
      <div className="step-label">Step 2</div>
      <h2>Choose your target role</h2>
      <div className="roles">
        {roles.map((role) => (
          <button
            key={role.id}
            className={`role ${selectedRole === role.id ? 'selected' : ''}`}
            onClick={() => onSelect(role.id)}
          >
            <div className="role-name">{role.label}</div>
            <div className="role-comp">{role.competencies.join(' · ')}</div>
          </button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 18 }}>
        <div className="spacer" />
        <button className="primary" onClick={onStart} disabled={!canStart || starting}>
          {starting ? 'Starting…' : 'Start interview →'}
        </button>
      </div>
    </div>
  );
}
