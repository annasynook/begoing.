import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { canViewEvent, parseEventRecord } from './lib/eventDetails'
import { ensureDirectThread, ensureEventThread, fetchSocialData, respondToFriendRequest, sendFriendRequest, sendMessage } from './lib/social'
import AuthModal from './components/AuthModal'
import EventSheet from './components/EventSheet'
import CreateEventModal from './components/CreateEventModal'
import ProfileSheet from './components/ProfileSheet'
import ManageEventsSheet from './components/ManageEventsSheet'
import InboxSheet from './components/InboxSheet'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN
}

const icon = (...codepoints) => String.fromCodePoint(...codepoints)

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
  { value: 'Social', label: 'Social', emoji: icon(0x1f942), color: '#6d8f53' },
  { value: 'Coffee', label: 'Coffee', emoji: icon(0x2615), color: '#8b6a4b' },
  { value: 'Sports', label: 'Sports', emoji: icon(0x26bd), color: '#6c95bf' },
  { value: 'Arts', label: 'Arts', emoji: icon(0x1f3a8), color: '#c27d97' },
  { value: 'Education', label: 'Learning', emoji: icon(0x1f4da), color: '#9d7f57' },
  { value: 'Tech', label: 'Tech', emoji: icon(0x1f4bb), color: '#5d8b94' },
  { value: 'Outdoors', label: 'Outdoors', emoji: icon(0x1f332), color: '#4f9b73' },
  { value: 'Faith', label: 'Faith', emoji: icon(0x1f64f), color: '#d9a441' },
  { value: 'Food', label: 'Food', emoji: icon(0x1f35c), color: '#c9773d' },
  { value: 'Music', label: 'Music', emoji: icon(0x1f3b5), color: '#8a6bc0' },
  { value: 'Wellness', label: 'Wellness', emoji: icon(0x1f9d8), color: '#5fa89f' },
  { value: 'Family', label: 'Family', emoji: icon(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467), color: '#a6735a' },
  { value: 'Networking', label: 'Networking', emoji: icon(0x1f91d), color: '#5577b2' },
  { value: 'Games', label: 'Games', emoji: icon(0x1f3b2), color: '#9a6ad1' },
  { value: 'Nightlife', label: 'Nightlife', emoji: icon(0x1f37b), color: '#b56274' },
  { value: 'Volunteering', label: 'Volunteering', emoji: icon(0x1f90d), color: '#4b8b64' },
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
  vibe: 'Chill',
  energy: 'Easy pace',
  welcome: 'Anyone can join',
  price: 'Free',
  bringAlong: 'Just yourself',
  visibility: 'Open to everyone',
}

const DEFAULT_CENTER = [-114.0719, 51.0447]
const CANCELLED_PREFIX = '[Cancelled] '

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

function isCancelledEvent(event) {
  return event?.title?.startsWith(CANCELLED_PREFIX)
}

function formatDistanceKm(distanceKm) {
  if (distanceKm == null || Number.isNaN(distanceKm)) return ''
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km away`
}

function getDistanceKm(from, to) {
  if (!from || typeof to?.lat !== 'number' || typeof to?.lng !== 'number') return null

  const toRad = (degrees) => degrees * (Math.PI / 180)
  const earthRadiusKm = 6371
  const latDelta = toRad(to.lat - from.lat)
  const lngDelta = toRad(to.lng - from.lng)
  const lat1 = toRad(from.lat)
  const lat2 = toRad(to.lat)

  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function displayNameForProfile(profile) {
  if (!profile) return 'Your profile'
  return profile.name || profile.email?.split('@')[0] || 'Member'
}

function hydrateEvent(event) {
  return parseEventRecord(event)
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
  const [showManageEvents, setShowManageEvents] = useState(false)
  const [showInbox, setShowInbox] = useState(false)
  const [profileTarget, setProfileTarget] = useState(null)
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
  const [profile, setProfile] = useState(null)
  const [friendRequests, setFriendRequests] = useState([])
  const [friends, setFriends] = useState([])
  const [threads, setThreads] = useState([])
  const [activeThreadId, setActiveThreadId] = useState('')
  const [userLocation, setUserLocation] = useState(null)
  const [sharedEventId, setSharedEventId] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('event') || ''
  })

  const hasMapboxToken = Boolean(MAPBOX_TOKEN)

  const ensureProfile = useCallback(async (user) => {
    if (!supabase || !user?.id) return null

    const payload = {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || '',
      city: '',
      interests: [],
    }

    const { error } = await supabase.from('profiles').upsert(payload)
    if (error) throw error
    return payload
  }, [])

  const fetchProfile = useCallback(async (userId) => {
    if (!supabase || !userId) {
      setProfile(null)
      return
    }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    setProfile(data || null)
  }, [])

  const refreshSocial = useCallback(async (userId) => {
    if (!supabase || !userId) {
      setFriendRequests([])
      setFriends([])
      setThreads([])
      setActiveThreadId('')
      return
    }

    const social = await fetchSocialData(supabase, userId)
    setFriendRequests(social.requests)
    setFriends(social.friends)
    setThreads(social.threads)
    setActiveThreadId((current) => current || social.threads[0]?.id || '')
  }, [])

  const fetchEvents = useCallback(async () => {
    if (!supabase) return

    setLoadingEvents(true)

    const relationQuery = await supabase
      .from('events')
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
      .order('date', { ascending: true })

    if (relationQuery.data) {
      setEvents(relationQuery.data.map(hydrateEvent))
      setLoadingEvents(false)
      return
    }

    const fallbackQuery = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true })

    if (fallbackQuery.data) setEvents(fallbackQuery.data.map(hydrateEvent))
    setLoadingEvents(false)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const media = window.matchMedia('(min-width: 980px)')
    const sync = () => setIsDesktop(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return undefined

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => {},
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 1000 * 60 * 10 },
    )

    return undefined
  }, [])

  useEffect(() => {
    if (!supabase) return undefined

    let cancelled = false

    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (cancelled) return
      setSession(currentSession)

      if (currentSession?.user) {
        try {
          await ensureProfile(currentSession.user)
        } catch (_error) {
          // Keep the user signed in even if the bootstrap upsert fails.
        }

        fetchProfile(currentSession.user.id)
        refreshSocial(currentSession.user.id)
        if (authCb) {
          const callback = authCb
          setAuthCb(null)
          callback()
        }
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return

      setSession(nextSession)

      if (!nextSession?.user) {
        setProfile(null)
        return
      }

      ensureProfile(nextSession.user)
        .catch(() => {})
        .finally(() => {
          fetchProfile(nextSession.user.id)
          fetchEvents()
          refreshSocial(nextSession.user.id)
          setShowAuth(false)
          if (authCb) {
            const callback = authCb
            setAuthCb(null)
            window.setTimeout(callback, 0)
          }
        })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [authCb, ensureProfile, fetchEvents, fetchProfile, refreshSocial])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    if (showInbox && session?.user?.id) {
      refreshSocial(session.user.id)
    }
  }, [refreshSocial, session?.user?.id, showInbox])

  useEffect(() => {
    if (!sharedEventId) {
      setSelected(null)
      return
    }

    if (events.length === 0) return

    const sharedEvent = events.find((event) => event.id === sharedEventId)
    if (!sharedEvent) return

    setSelected(sharedEvent)
    if (typeof sharedEvent.lat === 'number' && typeof sharedEvent.lng === 'number' && map.current) {
      map.current.flyTo({ center: [sharedEvent.lng, sharedEvent.lat], zoom: 13, duration: 500 })
    }
  }, [events, sharedEventId])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const updateFromUrl = () => {
      const nextId = new URLSearchParams(window.location.search).get('event') || ''
      setSharedEventId(nextId)
    }

    window.addEventListener('popstate', updateFromUrl)
    return () => window.removeEventListener('popstate', updateFromUrl)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    if (selected?.id) {
      url.searchParams.set('event', selected.id)
    } else {
      url.searchParams.delete('event')
    }

    window.history.replaceState({}, '', url)
  }, [selected])

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
      const cancelled = isCancelledEvent(event)
      const el = document.createElement('button')
      el.type = 'button'
      el.style.cssText = `
        position: relative;
        width: ${count > 9 ? 50 : 44}px;
        height: ${count > 9 ? 50 : 44}px;
        border-radius: 999px;
        background: ${cancelled ? '#8d8175' : meta.color};
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

      el.innerHTML = `<span style="position:absolute; top:-8px; right:-4px; font-size:14px;">${cancelled ? icon(0x26a0) : meta.emoji}</span>${count || ''}`

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

    next = next.filter((event) => canViewEvent(event, session?.user?.id, sharedEventId))

    if (filter === 'Upcoming') {
      next = next.filter((event) => isUpcoming(event.date) && !isCancelledEvent(event))
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
        || event.descriptionDisplay?.toLowerCase().includes(query)
        || event.host?.name?.toLowerCase().includes(query),
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
    if (session?.user?.id) {
      fetchProfile(session.user.id)
      refreshSocial(session.user.id)
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
    if (!supabase) {
      setCreateError('Supabase is not configured yet.')
      return
    }

    setCreateLoading(true)
    setCreateError('')
    let createdEvent = null
    try {
      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession()

      if (freshSession?.user) {
        await ensureProfile(freshSession.user)
      }

      createdEvent = await createRequest()
    } catch (error) {
      setCreateError(error.message || 'Could not prepare your account for event creation.')
    }
    setCreateLoading(false)

    if (!createdEvent) return

    try {
      await ensureEventThread(supabase, createdEvent, session?.user?.id || createdEvent.host_id)
    } catch (_error) {
      // Event still exists even if chat provisioning fails.
    }

    setShowCreate(false)
    setPickedLoc(null)
    setCreateForm(EMPTY_CREATE_FORM)
    setCreateInfo('')
    await fetchEvents()
    if (session?.user?.id) {
      refreshSocial(session.user.id)
    }
  }

  const handleEventUpdated = (updatedEvent) => {
    const hydratedEvent = hydrateEvent(updatedEvent)
    setEvents((current) => current.map((event) => (event.id === hydratedEvent.id ? hydratedEvent : event)))
    setSelected(hydratedEvent)
    if (session?.user?.id) {
      refreshSocial(session.user.id)
    }
  }

  const cancelEvent = async (event) => {
    if (!supabase || !session?.user?.id || event.host_id !== session.user.id || isCancelledEvent(event)) return null
    if (typeof window !== 'undefined' && !window.confirm('Cancel this event for everyone?')) return null

    const nextTitle = event.title.startsWith(CANCELLED_PREFIX) ? event.title : `${CANCELLED_PREFIX}${event.title}`
    const nextDescription = [
      'This gathering was cancelled by the host.',
      event.description?.replace(/^This gathering was cancelled by the host\.\n\n/, '') || '',
    ].filter(Boolean).join('\n\n')

    const { data, error } = await supabase
      .from('events')
      .update({
        title: nextTitle,
        description: nextDescription,
      })
      .eq('id', event.id)
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

    if (error || !data) return null

    handleEventUpdated(data)
    return data
  }

  const focusEvent = (event) => {
    setSelected(event)
    if (typeof event.lat === 'number' && typeof event.lng === 'number' && map.current) {
      map.current.flyTo({ center: [event.lng, event.lat], zoom: 13, duration: 500 })
    }
  }

  const openProfileSheet = (nextProfile) => {
    if (!nextProfile?.id) return
    setProfileTarget(nextProfile)
    setShowProfile(true)
  }

  const getFriendshipState = (profileId) => {
    const request = friendRequests.find((item) =>
      (item.sender_id === profileId && item.receiver_id === session?.user?.id)
      || (item.receiver_id === profileId && item.sender_id === session?.user?.id),
    )

    return request?.status || 'none'
  }

  const handleAddFriend = async (targetProfile) => {
    if (!supabase || !session?.user?.id || !targetProfile?.id || targetProfile.id === session.user.id) return
    await sendFriendRequest(supabase, session.user.id, targetProfile.id)
    await refreshSocial(session.user.id)
  }

  const handleRespondToRequest = async (requestId, status) => {
    if (!supabase || !session?.user?.id) return
    await respondToFriendRequest(supabase, requestId, status)
    await refreshSocial(session.user.id)
  }

  const handleOpenDirectChat = async (targetProfile) => {
    if (!supabase || !session?.user?.id || !targetProfile?.id) return
    const thread = await ensureDirectThread(supabase, session.user.id, targetProfile.id)
    await refreshSocial(session.user.id)
    setActiveThreadId(thread.id)
    setShowInbox(true)
  }

  const handleOpenEventChat = async (event) => {
    if (!supabase || !session?.user?.id || !event?.id) return
    const thread = await ensureEventThread(supabase, event, session.user.id)
    if (!thread) return
    await refreshSocial(session.user.id)
    setActiveThreadId(thread.id)
    setShowInbox(true)
  }

  const handleSendMessage = async (threadId, body) => {
    if (!supabase || !session?.user?.id) return
    await sendMessage(supabase, threadId, session.user.id, body)
    await refreshSocial(session.user.id)
    setActiveThreadId(threadId)
  }

  const activeOwnProfile = session?.user
    ? {
      id: session.user.id,
      email: session.user.email,
      name: profile?.name || session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '',
      city: profile?.city || '',
      interests: profile?.interests || [],
    }
    : null

  const selectedDistanceLabel = useMemo(() => {
    if (!selected) return ''
    return formatDistanceKm(getDistanceKm(userLocation, selected))
  }, [selected, userLocation])

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
            <>
              <button type="button" className="glass-button" onClick={() => setShowInbox(true)}>
                Inbox
              </button>
              <button type="button" className="glass-button" onClick={() => setShowManageEvents(true)}>
                My events
              </button>
              <button type="button" className="avatar-button" onClick={() => openProfileSheet(activeOwnProfile)}>
                {(activeOwnProfile?.name || activeOwnProfile?.email || 'U').charAt(0).toUpperCase()}
              </button>
            </>
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
              <div className="panel-subtitle">
                Filter the map, open host profiles, and jump straight into a plan that feels right.
              </div>
            </div>
            {session ? (
              <div className="profile-glance">
                <span>{myStats.hosting} hosting</span>
                <span>{myStats.joined} joined</span>
                {userLocation ? <span>Distance on</span> : null}
              </div>
            ) : null}
          </div>

          <div className="search-row">
            <input
              className="panel-input"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search title, city, host, or vibe"
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
                <div className="empty-copy">Try another category, open up the timing, or create the first event in your area.</div>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <EventListCard
                  key={event.id}
                  event={event}
                  selected={selected?.id === event.id}
                  onOpen={() => focusEvent(event)}
                  onOpenHost={() => openProfileSheet(event.host || { id: event.host_id, name: 'Host' })}
                  distanceLabel={formatDistanceKm(getDistanceKm(userLocation, event))}
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
          onJoined={handleEventUpdated}
          onEventUpdated={handleEventUpdated}
          onCancelEvent={cancelEvent}
          onOpenHostProfile={() => openProfileSheet(selected.host || { id: selected.host_id, name: 'Host' })}
          onOpenEventChat={handleOpenEventChat}
          categoryMeta={categoryMeta(selected.category)}
          isDesktop={isDesktop}
          distanceLabel={selectedDistanceLabel}
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

      {showProfile && profileTarget && (
        <ProfileSheet
          C={C}
          profileUser={profileTarget}
          session={session}
          events={events}
          onClose={() => setShowProfile(false)}
          onOpenEvent={(event) => {
            setShowProfile(false)
            focusEvent(event)
          }}
          onCancelEvent={cancelEvent}
          onAddFriend={async (targetProfile) => {
            await handleAddFriend(targetProfile)
          }}
          onMessageUser={async (targetProfile) => {
            setShowProfile(false)
            await handleOpenDirectChat(targetProfile)
          }}
          friendshipState={getFriendshipState(profileTarget.id)}
        />
      )}

      {showManageEvents && session ? (
        <ManageEventsSheet
          session={session}
          events={events.filter((event) => canViewEvent(event, session.user.id, sharedEventId))}
          onClose={() => setShowManageEvents(false)}
          onOpenEvent={(event) => {
            setShowManageEvents(false)
            focusEvent(event)
          }}
          onCancelEvent={cancelEvent}
          onOpenEventChat={(event) => {
            setShowManageEvents(false)
            handleOpenEventChat(event)
          }}
        />
      ) : null}

      {showInbox && session ? (
        <InboxSheet
          session={session}
          requests={friendRequests}
          friends={friends}
          threads={threads}
          activeThreadId={activeThreadId}
          onClose={() => setShowInbox(false)}
          onOpenThread={setActiveThreadId}
          onOpenDirectChat={handleOpenDirectChat}
          onSendMessage={handleSendMessage}
          onRespondToRequest={handleRespondToRequest}
        />
      ) : null}
    </div>
  )
}

function EventListCard({ event, onOpen, onOpenHost, selected, distanceLabel }) {
  const meta = categoryMeta(event.category)
  const count = event.attendees?.length ?? 0
  const cancelled = isCancelledEvent(event)
  const limitedVisibility = event.visibility && event.visibility !== 'Open to everyone'

  return (
    <button type="button" className={`event-card ${selected ? 'selected' : ''}`} onClick={onOpen}>
      <div className="event-card-top">
        <div className="event-card-top-badges">
          <div className="event-card-badge" style={{ background: `${meta.color}18`, color: meta.color }}>
            <span>{meta.emoji}</span>
            {meta.label}
          </div>
          {limitedVisibility ? <div className="event-status-chip subtle-status-chip">{event.visibility}</div> : null}
        </div>
        {cancelled ? <div className="event-status-chip">Cancelled</div> : null}
      </div>
      <div className="event-card-title">{event.title}</div>
      <div className="event-card-meta">{formatDate(event.date)} / {event.city}</div>
      {distanceLabel ? <div className="event-card-distance">{distanceLabel}</div> : null}
      {event.host?.name ? (
        <span
          className="inline-link-button"
          role="button"
          tabIndex={0}
          onClick={(eventClick) => { eventClick.stopPropagation(); onOpenHost() }}
          onKeyDown={(eventKey) => {
            if (eventKey.key === 'Enter' || eventKey.key === ' ') {
              eventKey.preventDefault()
              eventKey.stopPropagation()
              onOpenHost()
            }
          }}
        >
          Hosted by {displayNameForProfile(event.host)}
        </span>
      ) : null}
      <div className="event-card-footer">
        <span>{eventCountLabel(count)}</span>
        <span>{cancelled ? 'View details' : 'Open'}</span>
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
