import { useRef, useState } from 'react'
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

export default function EventSheet({ event, session, onClose, requireAuth, onJoined, categoryMeta, isDesktop }) {
  const [ev, setEv] = useState(event)
  const [loading, setLoading] = useState(false)
  const [dragY, setDragY] = useState(0)
  const touchStartRef = useRef(null)

  const uid = session?.user?.id
  const isJoined = uid && ev.attendees?.includes(uid)
  const isFull = ev.max_attendees > 0 && ev.attendees?.length >= ev.max_attendees
  const count = ev.attendees?.length ?? 0

  const join = () => requireAuth(async () => {
    if (!supabase || isJoined || isFull || !uid) return

    setLoading(true)
    const next = [...(ev.attendees || []), uid]
    const { data, error } = await supabase
      .from('events')
      .update({ attendees: next })
      .eq('id', ev.id)
      .select()
      .single()
    setLoading(false)

    if (!error && data) {
      setEv(data)
      onJoined(data)
    }
  })

  const leave = async () => {
    if (!supabase || !uid) return

    setLoading(true)
    const next = (ev.attendees || []).filter((id) => id !== uid)
    const { data, error } = await supabase
      .from('events')
      .update({ attendees: next })
      .eq('id', ev.id)
      .select()
      .single()
    setLoading(false)

    if (!error && data) {
      setEv(data)
      onJoined(data)
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
            <div className="event-chip" style={{ background: `${categoryMeta.color}18`, color: categoryMeta.color }}>
              <span>{categoryMeta.emoji}</span>
              {categoryMeta.label}
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

        {ev.description ? <div className="detail-block">{ev.description}</div> : null}

        <div className="event-actions">
          {isJoined ? (
            <button type="button" className="outline-button grow" onClick={leave} disabled={loading}>
              Leave event
            </button>
          ) : (
            <button type="button" className="primary-submit grow" onClick={join} disabled={loading || isFull}>
              {loading ? 'Working...' : isFull ? 'Event full' : 'Join event'}
            </button>
          )}
          <button
            type="button"
            className="outline-button"
            onClick={() => navigator.clipboard?.writeText(`${window.location.origin}?event=${ev.id}`)}
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  )
}
