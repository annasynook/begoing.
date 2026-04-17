import { supabase } from '../lib/supabase'

function formatDate(value) {
  if (!value) return 'Date TBD'
  return new Date(value).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ProfileSheet({ C, session, events, onClose }) {
  const hosted = events.filter((event) => event.host_id === session?.user?.id)
  const joined = events.filter((event) => event.attendees?.includes(session?.user?.id))

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet-modal profile-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Your profile</div>
            <div className="sheet-subtitle">{session?.user?.email}</div>
          </div>
          <button type="button" className="icon-dismiss" onClick={onClose}>x</button>
        </div>

        <div className="profile-stats">
          <div className="profile-stat"><strong>{hosted.length}</strong><span>Hosting</span></div>
          <div className="profile-stat"><strong>{joined.length}</strong><span>Joined</span></div>
        </div>

        <div className="profile-section-title">Hosted by you</div>
        <div className="profile-list">
          {hosted.length === 0 ? <div className="helper-copy">You have not hosted anything yet.</div> : hosted.map((event) => (
            <div key={event.id} className="profile-item">
              <strong>{event.title}</strong>
              <span>{formatDate(event.date)} / {event.city}</span>
            </div>
          ))}
        </div>

        <div className="profile-section-title">Joined events</div>
        <div className="profile-list">
          {joined.length === 0 ? <div className="helper-copy">You have not joined anything yet.</div> : joined.map((event) => (
            <div key={event.id} className="profile-item">
              <strong>{event.title}</strong>
              <span>{formatDate(event.date)} / {event.city}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="outline-button profile-signout"
          onClick={async () => {
            if (supabase) await supabase.auth.signOut()
            onClose()
          }}
          style={{ color: C.text }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
