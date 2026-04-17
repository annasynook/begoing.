import { useState, useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import AuthModal from './components/AuthModal'
import EventSheet from './components/EventSheet'
import CreateEventModal from './components/CreateEventModal'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN
}

const C = {
  primary: '#7BA05B',
  primaryDark: '#5E7D43',
  primaryLight: 'rgba(123,160,91,0.14)',
  blue: '#779ECB',
  blueLight: 'rgba(119,158,203,0.14)',
  rose: '#CC8899',
  yellow: '#FFDB58',
  bg: '#f0ede8',
  surface: 'rgba(255,255,255,0.88)',
  surfaceBlur: 'rgba(248,246,242,0.92)',
  text: '#1a1714',
  muted: '#6b6560',
  light: '#a8a49f',
  border: 'rgba(0,0,0,0.08)',
}

const CAT_COLOR = {
  Social: '#7BA05B',
  Sports: '#779ECB',
  Arts: '#CC8899',
  Education: '#A08B5B',
  Tech: '#5B8BA0',
  Outdoors: '#5BA07B',
  Faith: '#FFDB58',
  Food: '#C4873A',
  default: '#7BA05B',
}

const EMPTY_CREATE_FORM = {
  title: '',
  description: '',
  date: '',
  city: '',
  category: 'Social',
  max_attendees: '',
}

export { C }

export default function App() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const markers = useRef({})

  const [session, setSession] = useState(null)
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [pickedLoc, setPickedLoc] = useState(null)
  const [listOpen, setListOpen] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [authCb, setAuthCb] = useState(null)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  const hasMapboxToken = Boolean(MAPBOX_TOKEN)

  useEffect(() => {
    if (!supabase) return undefined

    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const fetchEvents = useCallback(async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true })

    if (data) setEvents(data)
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    if (!hasMapboxToken) return
    if (map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-114.0719, 51.0447],
      zoom: 11,
    })

    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.current.addControl(new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserHeading: false,
    }), 'top-right')

    map.current.on('load', () => setMapLoaded(true))
  }, [hasMapboxToken])

  useEffect(() => {
    if (!mapLoaded) return

    Object.keys(markers.current).forEach((id) => {
      markers.current[id].remove()
      delete markers.current[id]
    })

    events.forEach((ev) => {
      if (typeof ev.lat !== 'number' || typeof ev.lng !== 'number') return

      const color = CAT_COLOR[ev.category] || CAT_COLOR.default
      const count = ev.attendees?.length ?? 0

      const el = document.createElement('div')
      el.style.cssText = `
        position: relative;
        width: ${count > 9 ? 44 : 38}px;
        height: ${count > 9 ? 44 : 38}px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid white;
        box-shadow: 0 3px 12px rgba(0,0,0,0.22);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.15s;
        font-family: Inter, sans-serif;
        font-size: 12px;
        font-weight: 700;
        color: white;
      `
      el.textContent = count || ''

      if (count > 5) {
        const pulse = document.createElement('div')
        pulse.className = 'marker-pulse'
        pulse.style.background = color
        el.appendChild(pulse)
      }

      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.15)' })
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)' })
      el.addEventListener('click', (event) => {
        event.stopPropagation()
        setSelected(ev)
        setListOpen(false)
        map.current.flyTo({ center: [ev.lng, ev.lat], zoom: Math.max(map.current.getZoom(), 13), duration: 500 })
      })

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([ev.lng, ev.lat])
        .addTo(map.current)

      markers.current[ev.id] = marker
    })
  }, [events, mapLoaded])

  useEffect(() => {
    if (!map.current || !mapLoaded) return

    const canvas = map.current.getCanvas()

    const handleClick = (event) => {
      if (!pickMode) return

      setPickedLoc({
        lng: +event.lngLat.lng.toFixed(6),
        lat: +event.lngLat.lat.toFixed(6),
      })
      setPickMode(false)
      canvas.style.cursor = ''
    }

    if (pickMode) {
      canvas.style.cursor = 'crosshair'
      map.current.on('click', handleClick)
    } else {
      canvas.style.cursor = ''
      map.current.off('click', handleClick)
    }

    return () => {
      map.current?.off('click', handleClick)
      canvas.style.cursor = ''
    }
  }, [pickMode, mapLoaded])

  const requireAuth = (cb) => {
    if (session) {
      cb()
      return
    }

    setAuthCb(() => cb)
    setShowAuth(true)
  }

  const handleAuthSuccess = () => {
    setShowAuth(false)
    if (authCb) {
      authCb()
      setAuthCb(null)
    }
  }

  const handleCreateClick = () => {
    requireAuth(() => {
      setPickedLoc(null)
      setCreateForm(EMPTY_CREATE_FORM)
      setCreateError('')
      setShowCreate(true)
    })
  }

  const handlePickLocation = () => {
    setShowCreate(false)
    setPickMode(true)
  }

  useEffect(() => {
    if (pickedLoc && !pickMode) {
      setShowCreate(true)
    }
  }, [pickedLoc, pickMode])

  const handleEventCreated = async (createRequest) => {
    setCreateLoading(true)
    setCreateError('')
    const ok = await createRequest()
    setCreateLoading(false)

    if (!ok) return

    setShowCreate(false)
    setPickedLoc(null)
    setCreateForm(EMPTY_CREATE_FORM)
    fetchEvents()
  }

  const handleJoined = (updatedEvent) => {
    setEvents((currentEvents) => currentEvents.map((event) => (
      event.id === updatedEvent.id ? updatedEvent : event
    )))
    setSelected(updatedEvent)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden' }}>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />

      {!hasMapboxToken && (
        <NoticeCard
          C={C}
          top={84}
          title="Map is not configured"
          text="Add a valid VITE_MAPBOX_TOKEN in Vercel Environment Variables, then redeploy."
        />
      )}

      {!hasSupabaseConfig && (
        <NoticeCard
          C={C}
          top={hasMapboxToken ? 84 : 182}
          title="Supabase is not configured"
          text="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy."
        />
      )}

      {pickMode && (
        <div style={{
          position: 'absolute',
          top: 70,
          left: '50%',
          transform: 'translateX(-50%)',
          background: C.text,
          color: 'white',
          padding: '10px 20px',
          borderRadius: 30,
          fontSize: 14,
          fontWeight: 600,
          zIndex: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          Tap map to place event
          <button onClick={() => setPickMode(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: 20, padding: '2px 10px', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(to bottom, rgba(240,237,232,0.95) 60%, transparent)',
        pointerEvents: 'none',
      }}>
        <span style={{ fontFamily: 'DM Serif Display', fontSize: 26, color: C.primary, pointerEvents: 'auto' }}>
          begoing.
        </span>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          {session ? <UserMenu C={C} session={session} /> : <button onClick={() => setShowAuth(true)} style={btnStyle(C)}>Sign in</button>}
        </div>
      </div>

      {!pickMode && (
        <button
          onClick={handleCreateClick}
          style={{
            position: 'absolute',
            bottom: listOpen ? 'calc(45% + 16px)' : 96,
            right: 16,
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: C.primary,
            color: 'white',
            border: 'none',
            fontSize: 26,
            fontWeight: 300,
            boxShadow: '0 4px 20px rgba(123,160,91,0.45)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'bottom 0.35s cubic-bezier(0.4,0,0.2,1)',
          }}
          title="Host a gathering"
        >
          +
        </button>
      )}

      {!selected && (
        <button
          onClick={() => setListOpen((open) => !open)}
          style={{
            position: 'absolute',
            bottom: listOpen ? '43%' : 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: C.surface,
            backdropFilter: 'blur(14px)',
            border: `1px solid ${C.border}`,
            borderRadius: 30,
            padding: '9px 20px',
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'bottom 0.35s cubic-bezier(0.4,0,0.2,1)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 10 }}>{listOpen ? 'v' : '^'}</span>
          {events.length} gathering{events.length !== 1 ? 's' : ''} nearby
        </button>
      )}

      {listOpen && !selected && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '44%',
          background: C.surfaceBlur,
          backdropFilter: 'blur(16px)',
          borderTop: `1px solid ${C.border}`,
          borderRadius: '20px 20px 0 0',
          zIndex: 15,
          overflowY: 'auto',
          padding: '0 16px 24px',
        }}>
          <div className="drag-handle" style={{ paddingTop: 10 }} />
          <div style={{ fontSize: 12, color: C.light, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            All gatherings
          </div>
          {events.length === 0 ? (
            <EmptyState C={C} />
          ) : (
            events.map((ev) => (
              <MiniCard
                key={ev.id}
                C={C}
                event={ev}
                onClick={() => {
                  setSelected(ev)
                  setListOpen(false)
                  if (typeof ev.lat === 'number' && typeof ev.lng === 'number' && map.current) {
                    map.current.flyTo({ center: [ev.lng, ev.lat], zoom: 13, duration: 500 })
                  }
                }}
              />
            ))
          )}
        </div>
      )}

      {selected && (
        <EventSheet
          C={C}
          event={selected}
          session={session}
          onClose={() => setSelected(null)}
          requireAuth={requireAuth}
          onJoined={handleJoined}
        />
      )}

      {showAuth && (
        <AuthModal C={C} onSuccess={handleAuthSuccess} onClose={() => setShowAuth(false)} />
      )}

      {showCreate && (
        <CreateEventModal
          C={C}
          session={session}
          pickedLoc={pickedLoc}
          form={createForm}
          setForm={setCreateForm}
          loading={createLoading}
          error={createError}
          setError={setCreateError}
          onPickLocation={handlePickLocation}
          onCreated={handleEventCreated}
          onClose={() => {
            setShowCreate(false)
            setPickedLoc(null)
            setCreateError('')
          }}
        />
      )}
    </div>
  )
}

function btnStyle(C) {
  return {
    padding: '7px 16px',
    borderRadius: 20,
    background: C.surface,
    backdropFilter: 'blur(12px)',
    border: `1px solid ${C.border}`,
    fontSize: 13,
    fontWeight: 600,
    color: C.text,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  }
}

function UserMenu({ C, session }) {
  const [open, setOpen] = useState(false)
  const initial = session.user.email?.charAt(0).toUpperCase()

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((current) => !current)} style={{ width: 34, height: 34, borderRadius: '50%', background: `linear-gradient(135deg, ${C.primary}, ${C.blue})`, border: 'none', color: 'white', fontWeight: 700, fontSize: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
        {initial}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 42, right: 0, background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: 8, minWidth: 160, zIndex: 50 }}>
          <div style={{ fontSize: 12, color: C.light, padding: '4px 10px 8px' }}>{session.user.email}</div>
          <button
            onClick={async () => {
              if (supabase) await supabase.auth.signOut()
              setOpen(false)
            }}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', textAlign: 'left', fontSize: 14, color: C.text, cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function MiniCard({ C, event, onClick }) {
  const count = event.attendees?.length ?? 0
  const dateStr = event.date ? new Date(event.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div onClick={onClick} style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', alignItems: 'center' }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${C.primary}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>O</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</div>
        <div style={{ fontSize: 12, color: C.muted }}>{dateStr} / {event.city}</div>
      </div>
      <div style={{ fontSize: 12, color: C.primary, fontWeight: 600, flexShrink: 0 }}>{count} going</div>
    </div>
  )
}

function EmptyState({ C }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 20px', color: C.muted }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>O</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: C.text }}>No gatherings yet</div>
      <div style={{ fontSize: 13 }}>Tap + to be the first to host one!</div>
    </div>
  )
}

function NoticeCard({ C, top, title, text }) {
  return (
    <div style={{
      position: 'absolute',
      left: 16,
      right: 16,
      top,
      zIndex: 20,
      background: 'rgba(255,255,255,0.94)',
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}
