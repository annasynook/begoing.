import { useEffect, useRef, useState } from 'react'

function findCity(feature) {
  const context = feature.context || []
  const city = context.find((item) => item.id.startsWith('place') || item.id.startsWith('locality'))
  return city?.text || ''
}

export default function CreateEventModal({
  C,
  session,
  pickedLoc,
  form,
  setForm,
  loading,
  error,
  info,
  setError,
  setInfo,
  categories,
  mapboxToken,
  onAddressPick,
  onPickLocation,
  onCreated,
  onClose,
}) {
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [dragY, setDragY] = useState(0)
  const touchStartRef = useRef(null)

  useEffect(() => {
    if (!form.addressQuery?.trim() || form.addressQuery === form.addressLabel) {
      setResults([])
      return undefined
    }

    if (!mapboxToken) {
      setResults([])
      return undefined
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(form.addressQuery)}.json?access_token=${mapboxToken}&autocomplete=true&limit=5&types=address,place,poi,locality,neighborhood`,
          { signal: controller.signal },
        )
        const data = await response.json()
        setResults(data.features || [])
      } catch (_error) {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 350)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [form.addressLabel, form.addressQuery, mapboxToken])

  const set = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submit = async () => {
    if (!form.title.trim() || !form.date || !form.city.trim()) {
      setError('Title, date, and city are required.')
      return
    }
    if (!pickedLoc) {
      setError('Choose an address or pin the event on the map.')
      return
    }

    await onCreated(async () => {
      const { supabase } = await import('../lib/supabase')
      if (!supabase) {
        setError('Supabase is not configured yet.')
        return false
      }

      const {
        data: { session: freshSession },
      } = await supabase.auth.getSession()

      if (!freshSession?.user?.id) {
        setError('Sign in again before creating an event.')
        return false
      }

      const { error: createError } = await supabase.from('events').insert({
        title: form.title.trim(),
        description: form.description.trim(),
        date: form.date,
        city: form.city.trim(),
        category: form.category,
        max_attendees: form.max_attendees ? parseInt(form.max_attendees, 10) : 0,
        host_id: freshSession.user.id,
        attendees: [freshSession.user.id],
        lat: pickedLoc.lat,
        lng: pickedLoc.lng,
      })

      if (createError) {
        setError(createError.message)
        return false
      }

      return true
    })
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        className="sheet-modal create-sheet"
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => { touchStartRef.current = event.touches[0].clientY }}
        onTouchMove={(event) => {
          if (touchStartRef.current == null) return
          const delta = event.touches[0].clientY - touchStartRef.current
          setDragY(delta > 0 ? delta : 0)
        }}
        onTouchEnd={() => {
          if (dragY > 110) onClose()
          setDragY(0)
          touchStartRef.current = null
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Create a gathering</div>
            <div className="sheet-subtitle">Search an address or pin it directly on the map.</div>
          </div>
          <button type="button" className="icon-dismiss" onClick={onClose}>x</button>
        </div>

        <div className="sheet-grid">
          <div>
            <div className="field-label">Title *</div>
            <input className="sheet-input" value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="Sunset coffee walk" />
          </div>

          <div>
            <div className="field-label">Description</div>
            <textarea className="sheet-textarea" value={form.description} onChange={(event) => set('description', event.target.value)} placeholder="What kind of vibe are people joining?" />
          </div>

          <div className="two-column">
            <div>
              <div className="field-label">Date *</div>
              <input className="sheet-input" type="datetime-local" value={form.date} onChange={(event) => set('date', event.target.value)} />
            </div>
            <div>
              <div className="field-label">City *</div>
              <input className="sheet-input" value={form.city} onChange={(event) => set('city', event.target.value)} placeholder="Calgary, AB" />
            </div>
          </div>

          <div>
            <div className="field-label">Category</div>
            <div className="category-grid">
              {categories.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`category-choice ${form.category === item.value ? 'active' : ''}`}
                  onClick={() => set('category', item.value)}
                >
                  <span>{item.emoji}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="field-label">Address search</div>
            <input
              className="sheet-input"
              value={form.addressQuery}
              onChange={(event) => {
                set('addressQuery', event.target.value)
                set('addressLabel', '')
                setInfo('')
              }}
              placeholder="123 17 Ave SW, Calgary"
            />
            <div className="helper-copy">Type an address, cafe, park, or neighborhood.</div>
            {searching ? <div className="helper-copy">Searching address...</div> : null}
            {results.length > 0 ? (
              <div className="address-results">
                {results.map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    className="address-result"
                    onClick={() => {
                      onAddressPick({
                        center: feature.center,
                        placeName: feature.place_name,
                        city: findCity(feature),
                      })
                      setResults([])
                    }}
                  >
                    <span>{feature.text}</span>
                    <small>{feature.place_name}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="location-box">
            <div>
              <div className="field-label">Pinned location</div>
              <div className="location-copy">
                {pickedLoc
                  ? `${pickedLoc.lat}, ${pickedLoc.lng}`
                  : 'No map pin yet. You can search an address or choose manually.'}
              </div>
              {form.addressLabel ? <div className="helper-copy">{form.addressLabel}</div> : null}
            </div>
            <button type="button" className="outline-button" onClick={onPickLocation}>
              Pick on map
            </button>
          </div>

          <div>
            <div className="field-label">Max attendees</div>
            <input className="sheet-input" type="number" value={form.max_attendees} onChange={(event) => set('max_attendees', event.target.value)} placeholder="Leave empty for unlimited" />
          </div>

          {error ? <div className="error-copy">{error}</div> : null}
          {info ? <div className="info-copy">{info}</div> : null}

          <button type="button" className="primary-submit" disabled={loading} onClick={submit}>
            {loading ? 'Creating...' : 'Publish event'}
          </button>
        </div>
      </div>
    </div>
  )
}
