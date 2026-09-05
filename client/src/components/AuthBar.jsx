// Lives in the app header. Shows the Google button when signed out, or the
// user's avatar + a Profile/Sign out pair once they've signed in. Guests
// (Google not configured, or just not signed in yet) still get a "Profile"
// button so they can see their device-local history.
export default function AuthBar({ user, checking, googleAuthConfigured, mountButton, signOut, onOpenProfile }) {
  if (checking) {
    return <span className="small muted">Checking sign-in…</span>;
  }

  if (user) {
    return (
      <div className="row" style={{ gap: 10 }}>
        {user.picture && <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />}
        <span className="small">{user.name}</span>
        <button className="ghost small" onClick={onOpenProfile}>
          Profile
        </button>
        <button className="ghost small" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 10 }}>
      {googleAuthConfigured ? (
        <div ref={mountButton} />
      ) : (
        <span className="small muted">Guest mode — sign-in not configured</span>
      )}
      <button className="ghost small" onClick={onOpenProfile}>
        Profile
      </button>
    </div>
  );
}
