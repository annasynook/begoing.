import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function EventSheet({ C, event, session, onClose, requireAuth, onJoined }) {
  const [ev, setEv] = useState(event)
  const [loading, setLoading] = useState(false)

  const uid = session?.user?.id
  const isJoined = uid && ev.attendees?.includes(uid)
  const isFull = ev.max_attendees > 0 && ev.attendees?.length >= ev.max_attendees
  const count = ev.attendees?.length ?? 0

  const dateStr = ev.date
    ? new Date(ev.date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

  const join = () => requireAuth(async () => {
    if (isJoined || isFull) return
    setLoading(true)
    const next = [...(ev.attendees || []), uid]
    const { data, error } = await supabase
      .from('events').update({ attendees: next }).eq('id', ev.id).select().single()
    setLoading(false)
    if (!error) { setEv(data); onJoined(data) }
  })

  const leave = async () => {
    setLoading(true)
    const next = (ev.attendees || []).filter((id) => id !== uid)
    const { data, error } = await supabase
      .from('events').update({ attendees: next }).eq('id', ev.id).select().single()
    setLoading(false)
    if (!error) { setEv(data); onJoined(data) }
  }

  const share = () => {
    const url = `${window.location.origin}?event=${ev.id}`
    if (navigator.share) {
      navigator.share({ title: ev.title, text: `Join me at ${ev.title}`, url })
    } else {
      navigator.clipboard?.writeText(url)
      alert('Link copied!')
    }
  }

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      background: 'rgba(248,246,242,0.97)', backdropFilter: 'blur(20px)',
      borderRadius: '24px 24px 0 0',
      borderTop: '1px solid rgba(0,0,0,0.08)',
      padding: '0 20px 36px',
      zIndex: 25,
      maxHeight: '62%',
      overflowY: 'auto',
      boxShadow: '0 -8px 40px rgba(0,0,0,0.14)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4, position: 'sticky', top: 0, background: 'rgba(248,246,242,0.97)', paddingBottom: 10 }}>
        <div style={{ width: 36, height: 4, background: 'rgba(0,0,0,0.14)', borderRadius: 2 }} />
      </div>
      <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 20, background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: '50%', width: 30, height: 30, fontSize: 16, color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>

      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6, paddingRight: 36 }}>{ev.title}</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>{dateStr} · {ev.city}</div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Chip color={C.primary} label={`${count} going`} />
        {ev.category && <Chip color={C.blue} label={ev.category} />}
        {isFull && <Chip color={C.rose} label="Full" />}
      </div>

      {ev.description && (
        <div style={{ fontSize: 14, color: C.text, lineHeight: 1.65, marginBottom: 18, background: 'rgba(255,255,255,0.6)', borderRadius: 12, padding: 14, border: '1px solid rgba(0,0,0,0.06)' }}>
          {ev.description}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {isJoined ? (
          <button onClick={leave} disabled={loading} style={actionBtn('#f0f0f0', C.muted)}>
            ✓ Going — Leave
          </button>
        ) : (
          <button onClick={join} disabled={loading || isFull} style={actionBtn(isFull ? '#ccc' : C.primary, 'white')}>
            {loading ? '...' : isFull ? 'Event Full' : 'Join →'}
          </button>
        )}
        <button onClick={share} style={{ ...actionBtn('rgba(255,255,255,0.7)', C.muted), flex: 'none', width: 48, padding: 0, fontSize: 18 }}>
          📤
        </button>
      </div>
    </div>
  )
}

const actionBtn = (bg, color) => ({
  flex: 1, padding: '13px', borderRadius: 14,
  background: bg, border: '1px solid rgba(0,0,0,0.07)',
  color, fontSize: 15, fontWeight: 700,
})

function Chip({ color, label }) {
  return (
    <span style={{ background: color + '1A', color, fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 20 }}>
      {label}
    </span>
  )
}
