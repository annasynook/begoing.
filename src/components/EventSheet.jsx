import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

function formatLongDate(value) {
  if (!value) return 'Date TBD'
  return new Date(value).toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function displayNameForProfile(profile) {
  return profile?.name || profile?.email?.split('@')[0] || 'Host'
}

function isCancelledEvent(event) {
  return event?.title?.startsWith('[Cancelled] ')
}

export default function EventSheet({
  event,
  session,
  onClose,
  requireAuth,
  onJoined,
  onEventUpdated,
  onCancelEvent,
  onOpenHostProfile,
  onOpenEventChat,
  categoryMeta,
  isDesktop,
  distanceLabel,
}) {
  const [ev, setEv] = useState(event)
  const [loading, setLoading] = useState(false)
  const [dragY, setDragY] = useState(0)
  const touchStartRef = useRef(null)

  useEffect(() => {
    setEv(event)
  }, [event])

  const uid = session?.user?.id
  const isHost = uid && ev.host_id === uid
  const isJoined = uid && ev.attendees?.includes(uid)
  const cancelled = isCancelledEvent(ev)
  const isFull = ev.max_attendees > 0 && ev.attendees?.length >= ev.max_attendees
  const count = ev.attendees?.length ?? 0
  const details = ev.details || {}

  const join = () => requireAuth(async () => {
    if (!supabase || cancelled) return

    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession()

    const freshUid = freshSession?.user?.id
    if (!freshUid) return

    const alreadyJoined = ev.attendees?.includes(freshUid)
    const eventIsFull = ev.max_attendees > 0 && (ev.attendees?.length ?? 0) >= ev.max_attendees
    if (alreadyJoined || eventIsFull) return

    setLoading(true)
    const next = [...(ev.attendees || []), freshUid]
    const { data, error } = await supabase
      .from('events')
      .update({ attendees: next })
      .eq('id', ev.id)
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          name,
          email,
          city,
          interests
        )
      `)
      .single()
    setLoading(false)

    if (!error && data) {
      setEv(data)
      onJoined(data)
    }
  })

  const leave = async () => {
    if (!supabase || !uid || cancelled) return

    setLoading(true)
    const next = (ev.attendees || []).filter((id) => id !== uid)
    const { data, error } = await supabase
      .from('events')
      .update({ attendees: next })
      .eq('id', ev.id)
      .select(`
        *,
        host:profiles!events_host_id_fkey (
          id,
          name,
          email,
          city,
          interests
        )
      `)
      .single()
    setLoading(false)

    if (!error && data) {
      setEv(data)
      onJoined(data)
    }
  }

  const cancel = async () => {
    const updated = await onCancelEvent(ev)
    if (updated) {
      setEv(updated)
      onEventUpdated(updated)
    }
  }

  return (
    <div className="sheet-scrim event-sheet-scrim" onClick={onClose}>
      <div
        className={`sheet-modal event-sheet ${isDesktop ? 'event-sheet-desktop' : ''}`}
        style={dragY > 0 && !isDesktop ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(eventClick) => eventClick.stopPropagation()}
        onTouchStart={(eventTouch) => { touchStartRef.current = eventTouch.touches[0].clientY }}
        onTouchMove={(eventTouch) => {
          if (isDesktop || touchStartRef.current == null) return
          const delta = eventTouch.touches[0].clientY - touchStartRef.current
          setDragY(delta > 0 ? delta : 0)
        }}
        onTouchEnd={() => {
          if (!isDesktop && dragY > 110) onClose()
          setDragY(0)
          touchStartRef.current = null
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div>
            <div className="event-chip-row">
              <div className="event-chip" style={{ background: `${categoryMeta.color}18`, color: categoryMeta.color }}>
                <span>{categoryMeta.emoji}</span>
                {categoryMeta.label}
              </div>
              {ev.visibility && ev.visibility !== 'Open to everyone' ? <div className="event-status-chip subtle-status-chip">{ev.visibility}</div> : null}
              {cancelled ? <div className="event-status-chip">Cancelled</div> : null}
            </div>
            <div className="sheet-title">{ev.title}</div>
            <div className="sheet-subtitle">{formatLongDate(ev.date)} / {ev.city}</div>
          </div>
          <button type="button" className="icon-dismiss" onClick={onClose}>x</button>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <strong>{count}</strong>
            <span>Going</span>
          </div>
          <div className="stat-card">
            <strong>{ev.max_attendees > 0 ? Math.max(ev.max_attendees - count, 0) : 'Unlimited'}</strong>
            <span>Spots left</span>
          </div>
        </div>

        {distanceLabel ? (
          <div className="detail-block compact-detail-block">
            <strong>Distance</strong>
            <div>{distanceLabel}</div>
          </div>
        ) : null}

        <div className="detail-grid">
          <div className="detail-block compact-detail-block">
            <strong>Vibe</strong>
            <div>{details.vibe || 'Chill'}</div>
          </div>
          <div className="detail-block compact-detail-block">
            <strong>Energy</strong>
            <div>{details.energy || 'Easy pace'}</div>
          </div>
          <div className="detail-block compact-detail-block">
            <strong>Good for</strong>
            <div>{details.welcome || 'Anyone can join'}</div>
          </div>
          <div className="detail-block compact-detail-block">
            <strong>Cost</strong>
            <div>{details.price || 'Free'}</div>
          </div>
          <div className="detail-block compact-detail-block">
            <strong>Bring</strong>
            <div>{details.bringAlong || 'Just yourself'}</div>
          </div>
          <div className="detail-block compact-detail-block">
            <strong>Visibility</strong>
            <div>{ev.visibility || 'Open to everyone'}</div>
          </div>
        </div>

        {ev.host ? (
          <button type="button" className="host-card" onClick={onOpenHostProfile}>
            <span className="host-card-kicker">Hosted by</span>
            <strong>{displayNameForProfile(ev.host)}</strong>
            <small>Open profile</small>
          </button>
        ) : null}

        {ev.descriptionDisplay ? <div className="detail-block">{ev.descriptionDisplay}</div> : null}

        <div className="event-actions">
          {isJoined ? (
            <button type="button" className="outline-button grow" onClick={leave} disabled={loading || cancelled}>
              {cancelled ? 'Event cancelled' : 'Leave event'}
            </button>
          ) : (
            <button type="button" className="primary-submit grow" onClick={join} disabled={loading || isFull || cancelled}>
              {loading ? 'Working...' : cancelled ? 'Event cancelled' : isFull ? 'Event full' : 'Join event'}
            </button>
          )}
          <button
            type="button"
            className="outline-button"
            onClick={() => navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}?event=${ev.id}`)}
          >
            Copy link
          </button>
        </div>

        {(isJoined || isHost) ? (
          <div className="event-actions secondary-actions">
            <button type="button" className="outline-button grow" onClick={() => onOpenEventChat(ev)}>
              Open event chat
            </button>
          </div>
        ) : null}

        {isHost ? (
          <div className="event-actions secondary-actions">
            {!cancelled ? (
              <button type="button" className="outline-button grow danger-button" onClick={cancel}>
                Cancel event
              </button>
            ) : null}
            <button type="button" className="outline-button grow" onClick={onOpenHostProfile}>
              Open host profile
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
