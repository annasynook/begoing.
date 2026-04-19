import { useMemo, useState } from 'react'

function formatDate(value) {
  if (!value) return 'Date TBD'
  return new Date(value).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isUpcoming(value) {
  if (!value) return true
  return new Date(value).getTime() >= Date.now() - 60 * 60 * 1000
}

function isCancelledEvent(event) {
  return event?.title?.startsWith('[Cancelled] ')
}

export default function ManageEventsSheet({ session, events, onClose, onOpenEvent, onCancelEvent, onOpenEventChat }) {
  const [tab, setTab] = useState('hosting')
  const [copiedId, setCopiedId] = useState('')
  const userId = session?.user?.id

  const hosted = useMemo(
    () => events.filter((event) => event.host_id === userId),
    [events, userId],
  )

  const joined = useMemo(
    () => events.filter((event) => event.attendees?.includes(userId)),
    [events, userId],
  )

  const activeList = tab === 'hosting' ? hosted : joined
  const upcoming = activeList.filter((event) => isUpcoming(event.date))
  const past = activeList.filter((event) => !isUpcoming(event.date))

  const shareEvent = async (event) => {
    const link = `${window.location.origin}${window.location.pathname}?event=${event.id}`
    await navigator.clipboard?.writeText(link)
    setCopiedId(event.id)
    window.setTimeout(() => setCopiedId(''), 1800)
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet-modal profile-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Manage your events</div>
            <div className="sheet-subtitle">See what you are hosting, what you joined, and handle links or cancellations quickly.</div>
          </div>
          <button type="button" className="icon-dismiss" onClick={onClose}>x</button>
        </div>

        <div className="dashboard-stats">
          <div className="profile-stat"><strong>{hosted.length}</strong><span>Hosting</span></div>
          <div className="profile-stat"><strong>{joined.length}</strong><span>Joined</span></div>
        </div>

        <div className="dashboard-tabs">
          <button type="button" className={`filter-pill ${tab === 'hosting' ? 'active' : ''}`} onClick={() => setTab('hosting')}>
            Hosting
          </button>
          <button type="button" className={`filter-pill ${tab === 'joined' ? 'active' : ''}`} onClick={() => setTab('joined')}>
            Joined
          </button>
        </div>

        <section className="dashboard-section">
          <div className="profile-section-title">Upcoming</div>
          <div className="profile-list">
            {upcoming.length === 0 ? <div className="helper-copy">Nothing upcoming here yet.</div> : upcoming.map((event) => (
              <div key={event.id} className="profile-item dashboard-item">
                <strong>{event.title}</strong>
                <span>{formatDate(event.date)} / {event.city}</span>
                {event.visibility ? <span>{event.visibility}</span> : null}
                <div className="profile-item-actions">
                  <button type="button" className="inline-link-button" onClick={() => onOpenEvent(event)}>
                    Open event
                  </button>
                  <button type="button" className="inline-link-button" onClick={() => shareEvent(event)}>
                    {copiedId === event.id ? 'Copied' : 'Copy invite'}
                  </button>
                  <button type="button" className="inline-link-button" onClick={() => onOpenEventChat(event)}>
                    Open chat
                  </button>
                  {tab === 'hosting' && !isCancelledEvent(event) ? (
                    <button type="button" className="inline-link-button danger-link-button" onClick={() => onCancelEvent(event)}>
                      Cancel event
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-section">
          <div className="profile-section-title">Past</div>
          <div className="profile-list">
            {past.length === 0 ? <div className="helper-copy">Nothing past yet.</div> : past.map((event) => (
              <div key={event.id} className="profile-item dashboard-item">
                <strong>{event.title}</strong>
                <span>{formatDate(event.date)} / {event.city}</span>
                <div className="profile-item-actions">
                  <button type="button" className="inline-link-button" onClick={() => onOpenEvent(event)}>
                    Open event
                  </button>
                  <button type="button" className="inline-link-button" onClick={() => shareEvent(event)}>
                    {copiedId === event.id ? 'Copied' : 'Copy invite'}
                  </button>
                  <button type="button" className="inline-link-button" onClick={() => onOpenEventChat(event)}>
                    Open chat
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
