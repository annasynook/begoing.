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

function displayNameForProfile(profileUser) {
  return profileUser?.name || profileUser?.email?.split('@')[0] || 'Member'
}

function isCancelledEvent(event) {
  return event?.title?.startsWith('[Cancelled] ')
}

export default function ProfileSheet({
  C,
  profileUser,
  session,
  events,
  onClose,
  onOpenEvent,
  onCancelEvent,
  onAddFriend,
  onMessageUser,
  friendshipState,
}) {
  const isOwnProfile = profileUser?.id === session?.user?.id
  const hosted = events.filter((event) => event.host_id === profileUser?.id)
  const joined = events.filter((event) => event.attendees?.includes(profileUser?.id))

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet-modal profile-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{isOwnProfile ? 'Your profile' : displayNameForProfile(profileUser)}</div>
            <div className="sheet-subtitle">{profileUser?.email || 'Public profile'}</div>
          </div>
          <button type="button" className="icon-dismiss" onClick={onClose}>x</button>
        </div>

        <div className="profile-head-card">
          <div className="profile-avatar-large">
            {displayNameForProfile(profileUser).charAt(0).toUpperCase()}
          </div>
          <div className="profile-head-copy">
            <strong>{displayNameForProfile(profileUser)}</strong>
            <span>{profileUser?.city || (isOwnProfile ? 'Add your city later' : 'City not shared yet')}</span>
            <span>{isOwnProfile ? 'Manage your own events here.' : 'See what this host has joined and created.'}</span>
          </div>
        </div>

        <div className="profile-stats">
          <div className="profile-stat"><strong>{hosted.length}</strong><span>Hosting</span></div>
          <div className="profile-stat"><strong>{joined.length}</strong><span>Joined</span></div>
        </div>

        {!isOwnProfile ? (
          <div className="event-actions secondary-actions">
            <button
              type="button"
              className="outline-button grow"
              onClick={() => onAddFriend(profileUser)}
              disabled={friendshipState === 'accepted' || friendshipState === 'pending'}
            >
              {friendshipState === 'accepted' ? 'Already friends' : friendshipState === 'pending' ? 'Request pending' : 'Add friend'}
            </button>
            <button type="button" className="primary-submit grow" onClick={() => onMessageUser(profileUser)}>
              Message
            </button>
          </div>
        ) : null}

        <div className="profile-section-title">{isOwnProfile ? 'Your hosted events' : 'Hosted events'}</div>
        <div className="profile-list">
          {hosted.length === 0 ? <div className="helper-copy">Nothing hosted yet.</div> : hosted.map((event) => (
            <div key={event.id} className="profile-item">
              <strong>{event.title}</strong>
              <span>{formatDate(event.date)} / {event.city}</span>
              <div className="profile-item-actions">
                <button type="button" className="inline-link-button" onClick={() => onOpenEvent(event)}>
                  Open event
                </button>
                {isOwnProfile && !isCancelledEvent(event) ? (
                  <button type="button" className="inline-link-button danger-link-button" onClick={() => onCancelEvent(event)}>
                    Cancel event
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="profile-section-title">{isOwnProfile ? 'Events you joined' : 'Joined events'}</div>
        <div className="profile-list">
          {joined.length === 0 ? <div className="helper-copy">Nothing joined yet.</div> : joined.map((event) => (
            <div key={event.id} className="profile-item">
              <strong>{event.title}</strong>
              <span>{formatDate(event.date)} / {event.city}</span>
              <div className="profile-item-actions">
                <button type="button" className="inline-link-button" onClick={() => onOpenEvent(event)}>
                  Open event
                </button>
              </div>
            </div>
          ))}
        </div>

        {isOwnProfile ? (
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
        ) : null}
      </div>
    </div>
  )
}
