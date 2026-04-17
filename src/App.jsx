import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import AuthModal from './components/AuthModal'
import EventSheet from './components/EventSheet'
import CreateEventModal from './components/CreateEventModal'
import ProfileSheet from './components/ProfileSheet'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN
}

const C = {
  primary: '#6d8f53',
  primaryDark: '#4f6e38',
  primaryLight: 'rgba(109,143,83,0.14)',
  blue: '#6c95bf',
  blueLight: 'rgba(108,149,191,0.16)',
  rose: '#c27d97',
  roseLight: 'rgba(194,125,151,0.16)',
  amber: '#d9a441',
  amberLight: 'rgba(217,164,65,0.16)',
  bg: '#ede8df',
  surface: 'rgba(255,255,255,0.9)',
  surfaceStrong: 'rgba(255,255,255,0.97)',
  panel: 'rgba(245,241,234,0.95)',
  text: '#1a1714',
  muted: '#6f685f',
  light: '#aba39b',
  border: 'rgba(0,0,0,0.08)',
  shadow: '0 10px 40px rgba(32, 27, 22, 0.12)',
}

export const EVENT_CATEGORIES = [
  { value: 'Social', label: 'Social', emoji: '🥂', color: '#6d8f53' },
  { value: 'Sports', label: 'Sports', emoji: '⚽', color: '#6c95bf' },
  { value: 'Arts', label: 'Arts', emoji: '🎨', color: '#c27d97' },
  { value: 'Education', label: 'Learning', emoji: '📚', color: '#9d7f57' },
  { value: 'Tech', label: 'Tech', emoji: '💻', color: '#5d8b94' },
  { value: 'Outdoors', label: 'Outdoors', emoji: '🌲', color: '#4f9b73' },
  { value: 'Faith', label: 'Faith', emoji: '🙏', color: '#d9a441' },
  { value: 'Food', label: 'Food', emoji: '🍜', color: '#c9773d' },
  { value: 'Music', label: 'Music', emoji: '🎵', color: '#8a6bc0' },
  { value: 'Wellness', label: 'Wellness', emoji: '🧘', color: '#5fa89f' },
  { value: 'Family', label: 'Family', emoji: '👨‍👩‍👧', color: '#a6735a' },
  { value: 'Networking', label: 'Networking', emoji: '🤝', color: '#5577b2' },
]

const EMPTY_CREATE_FORM = {
  title: '',
  description: '',
  date: '',
  city: '',
  category: 'Social',
  max_attendees: '',
  addressQuery: '',
  addressLabel: '',
}

const DEFAULT_CENTER = [-114.0719, 51.0447]

function categoryMeta(value) {
  return EVENT_CATEGORIES.find((item) => item.value === value) || EVENT_CATEGORIES[0]
}

function eventCountLabel(count) {
  return `${count} attendee${count === 1 ? '' : 's'}`
}

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

export default function App() {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const markers = useRef({})

  const [session, setSession] = useState(null)
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [pickMode, setPickMode] = useState(false)
  const [pickedLoc, setPickedLoc] = useState(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [authCb, setAuthCb] = useState(null)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createInfo, setCreateInfo] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [filter, setFilter] = useState('Upcoming')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [searchText, setSearchText] = useState('')
  const [isDesktop, setIsDesktop] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(false)

  const hasMapboxToken = Boolean(MAPBOX_TOKEN)

  const ensureProfile = async (user) => {
    if (!supabase || !user?.id) return

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name || user.email?.split('@')[0] || '',
      city: '',
      interests: [],
    })

    if (error) {
      throw error
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const media = window.matchMedia('(min-width: 980px)')
    const sync = () => setIsDesktop(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!supabase) return undefined

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        try {
          await ensureProfile(session.user)
        } catch (_error) {
          // keep the session even if profile bootstrap fails; create flow will retry
        }
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        ensureProfile(nextSession.user).catch(() => {})
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchEvents = async () => {
    if (!supabase) return

    setLoadingEvents(true)
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true })

    if (data) setEvents(data)
    setLoadingEvents(false)
  }

  useEffect(() => {
    fetchEvents()
  }, [])

  useEffect(() => {
    if (!hasMapboxToken || map.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: DEFAULT_CENTER,
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

    events.forEach((event) => {
      if (typeof event.lat !== 'number' || typeof event.lng !== 'number') return

      const meta = categoryMeta(event.category)
      const count = event.attendees?.length ?? 0
      const el = document.createElement('button')
      el.type = 'button'
      el.style.cssText = `
        position: relative;
        width: ${count > 9 ? 50 : 44}px;
        height: ${count > 9 ? 50 : 44}px;
        border-radius: 999px;
        background: ${meta.color};
        border: 3px solid white;
        box-shadow: 0 6px 18px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: white;
        font-family: Inter, sans-serif;
        font-size: 12px;
        font-weight: 800;
        padding: 0;
      `

      el.innerHTML = `<span style="position:absolute; top:-8px; right:-4px; font-size:14px;">${meta.emoji}</span>${count || ''}`

      el.addEventListener('click', (clickEvent) => {
        clickEvent.stopPropagation()
        setSelected(event)
        setListOpen(false)
        if (map.current) {
          map.current.flyTo({ center: [event.lng, event.lat], zoom: Math.max(map.current.getZoom(), 13), duration: 550 })
        }
      })

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([event.lng, event.lat])
        .addTo(map.current)

      markers.current[event.id] = marker
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
      setCreateInfo('Location pinned from the map.')
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

  useEffect(() => {
    if (pickedLoc && !pickMode) {
      setShowCreate(true)
    }
  }, [pickedLoc, pickMode])

  const filteredEvents = useMemo(() => {
    let next = [...events]

    if (filter === 'Upcoming') {
      next = next.filter((event) => isUpcoming(event.date))
    }

    if (filter === 'Mine' && session?.user?.id) {
      next = next.filter((event) => event.host_id === session.user.id || event.attendees?.includes(session.user.id))
    }

    if (categoryFilter !== 'All') {
      next = next.filter((event) => event.category === categoryFilter)
    }

    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase()
      next = next.filter((event) =>
        event.title?.toLowerCase().includes(query)
        || event.city?.toLowerCase().includes(query)
        || event.description?.toLowerCase().includes(query),
      )
    }

    return next
  }, [categoryFilter, events, filter, searchText, session?.user?.id])

  const myStats = useMemo(() => {
    if (!session?.user?.id) return { joined: 0, hosting: 0 }
    const hosting = events.filter((event) => event.host_id === session.user.id).length
    const joined = events.filter((event) => event.attendees?.includes(session.user.id)).length
    return { hosting, joined }
  }, [events, session?.user?.id])

  const requireAuth = (callback) => {
    if (session) {
      callback()
      return
    }

    setAuthCb(() => callback)
    setShowAuth(true)
  }

  const handleAuthSuccess = () => {
    setShowAuth(false)
    fetchEvents()
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
      setCreateInfo('')
      setShowCreate(true)
    })
  }

  const handlePickLocation = () => {
    setShowCreate(false)
    setPickMode(true)
  }

  const handleAddressPick = ({ center, placeName, city }) => {
    const [lng, lat] = center
    setPickedLoc({
      lng: +lng.toFixed(6),
      lat: +lat.toFixed(6),
    })
    setCreateForm((current) => ({
      ...current,
      city: city || current.city || '',
      addressQuery: placeName,
      addressLabel: placeName,
    }))
    setCreateInfo('Address found and pinned on the map.')
    if (map.current) {
      map.current.flyTo({ center, zoom: 14, duration: 650 })
    }
  }

  const handleEventCreated = async (createRequest) => {
    setCreateLoading(true)
    setCreateError('')
    let ok = false
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession()

      if (freshSession?.user) {
        await ensureProfile(freshSession.user)
      }

      ok = await createRequest()
    } catch (error) {
      setCreateError(error.message || 'Could not prepare your account for event creation.')
    }
    setCreateLoading(false)

    if (!ok) return

    setShowCreate(false)
    setPickedLoc(null)
    setCreateForm(EMPTY_CREATE_FORM)
    setCreateInfo('')
    await fetchEvents()
  }

  const handleJoined = (updatedEvent) => {
    setEvents((current) => current.map((event) => (event.id === updatedEvent.id ? updatedEvent : event)))
    setSelected(updatedEvent)
  }

  const focusEvent = (event) => {
    setSelected(event)
    if (typeof event.lat === 'number' && typeof event.lng === 'number' && map.current) {
      map.current.flyTo({ center: [event.lng, event.lat], zoom: 13, duration: 500 })
    }
  }

  return (
    <div className={`app-shell ${isDesktop ? 'desktop-shell' : ''}`}>
      <div ref={mapContainer} className="map-stage" />

      {!hasMapboxToken && (
        <NoticeCard top={88} title="Map is not configured" text="Add a valid VITE_MAPBOX_TOKEN in Vercel Environment Variables, then redeploy." />
      )}

      {!hasSupabaseConfig && (
        <NoticeCard top={hasMapboxToken ? 88 : 182} title="Supabase is not configured" text="Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy." />
      )}

      {pickMode && (
        <div className="floating-banner">
          Tap anywhere on the map to pin the event
          <button type="button" onClick={() => setPickMode(false)}>Cancel</button>
        </div>
      )}

      <div className={`top-bar ${isDesktop ? 'desktop-top-bar' : ''}`}>
        <div>
          <div className="brand-mark">begoing.</div>
          <div className="brand-subtitle">Map-first gatherings that feel easy to join.</div>
        </div>
        <div className="top-actions">
          {session ? (
            <button type="button" className="avatar-button" onClick={() => setShowProfile(true)}>
              {session.user.email?.charAt(0)?.toUpperCase() || 'U'}
            </button>
          ) : (
            <button type="button" className="glass-button" onClick={() => setShowAuth(true)}>
              Sign in
            </button>
          )}
          <button type="button" className="primary-chip" onClick={handleCreateClick}>
            Create event
          </button>
        </div>
      </div>

      <aside className={`panel-shell ${isDesktop ? 'panel-shell-desktop' : ''} ${listOpen || isDesktop ? 'panel-shell-open' : ''}`}>
        <div className="panel-handle-wrap">
          {!isDesktop && <button type="button" className="panel-toggle" onClick={() => setListOpen((open) => !open)}>{listOpen ? 'Hide list' : `${filteredEvents.length} gatherings nearby`}</button>}
        </div>

        <div className="panel card-surface">
          <div className="panel-header">
            <div>
              <div className="panel-title">Explore gatherings</div>
              <div className="panel-subtitle">Filter the map and jump into what feels right.</div>
            </div>
            {session ? (
              <div className="profile-glance">
                <span>{myStats.hosting} hosting</span>
                <span>{myStats.joined} joined</span>
              </div>
            ) : null}
          </div>

          <div className="search-row">
            <input
              className="panel-input"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search title, city, or vibe"
            />
          </div>

          <div className="filter-row">
            {['Upcoming', 'All', ...(session ? ['Mine'] : [])].map((value) => (
              <button
                key={value}
                type="button"
                className={`filter-pill ${filter === value ? 'active' : ''}`}
                onClick={() => setFilter(value)}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="category-row">
            <button type="button" className={`category-pill ${categoryFilter === 'All' ? 'active' : ''}`} onClick={() => setCategoryFilter('All')}>
              All
            </button>
            {EVENT_CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`category-pill ${categoryFilter === item.value ? 'active' : ''}`}
                onClick={() => setCategoryFilter(item.value)}
              >
                <span>{item.emoji}</span>
                {item.label}
              </button>
            ))}
          </div>

          <div className="event-list">
            {loadingEvents ? (
              <div className="empty-block">Loading events...</div>
            ) : filteredEvents.length === 0 ? (
              <div className="empty-block">
                <div className="empty-title">Nothing matched those filters.</div>
                <div className="empty-copy">Try another category or create the first event in your area.</div>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <EventListCard
                  key={event.id}
                  event={event}
                  selected={selected?.id === event.id}
                  onOpen={() => focusEvent(event)}
                />
              ))
            )}
          </div>
        </div>
      </aside>

      {selected && (
        <EventSheet
          C={C}
          event={selected}
          session={session}
          onClose={() => setSelected(null)}
          requireAuth={requireAuth}
          onJoined={handleJoined}
          categoryMeta={categoryMeta(selected.category)}
          isDesktop={isDesktop}
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
          info={createInfo}
          setError={setCreateError}
          setInfo={setCreateInfo}
          categories={EVENT_CATEGORIES}
          mapboxToken={MAPBOX_TOKEN}
          onAddressPick={handleAddressPick}
          onPickLocation={handlePickLocation}
          onCreated={handleEventCreated}
          onClose={() => {
            setShowCreate(false)
            setCreateError('')
            setCreateInfo('')
          }}
        />
      )}

      {showProfile && (
        <ProfileSheet
          C={C}
          session={session}
          events={events}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  )
}

function EventListCard({ event, onOpen, selected }) {
  const meta = categoryMeta(event.category)
  const count = event.attendees?.length ?? 0

  return (
    <button type="button" className={`event-card ${selected ? 'selected' : ''}`} onClick={onOpen}>
      <div className="event-card-badge" style={{ background: `${meta.color}18`, color: meta.color }}>
        <span>{meta.emoji}</span>
        {meta.label}
      </div>
      <div className="event-card-title">{event.title}</div>
      <div className="event-card-meta">{formatDate(event.date)} / {event.city}</div>
      <div className="event-card-footer">
        <span>{eventCountLabel(count)}</span>
        <span>Open</span>
      </div>
    </button>
  )
}

function NoticeCard({ top, title, text }) {
  return (
    <div className="notice-card" style={{ top }}>
      <div className="notice-title">{title}</div>
      <div className="notice-text">{text}</div>
    </div>
  )
}
