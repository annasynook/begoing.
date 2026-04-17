import { supabase } from '../lib/supabase'

const CATEGORIES = ['Social', 'Sports', 'Arts', 'Education', 'Tech', 'Outdoors', 'Faith', 'Food', 'Music']

export default function CreateEventModal({
  C,
  session,
  pickedLoc,
  form,
  setForm,
  loading,
  error,
  setError,
  onPickLocation,
  onCreated,
  onClose,
}) {
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!supabase) {
      setError('Supabase is not configured yet.')
      return
    }

    if (!form.title.trim() || !form.date || !form.city.trim()) {
      setError('Title, date, and city are required.')
      return
    }

    if (!pickedLoc) {
      setError('Please pin a location on the map.')
      return
    }

    onCreated(async () => {
      const { error: e } = await supabase.from('events').insert({
        title: form.title.trim(),
        description: form.description.trim(),
        date: form.date,
        city: form.city.trim(),
        category: form.category,
        max_attendees: form.max_attendees ? parseInt(form.max_attendees, 10) : 0,
        host_id: session.user.id,
        attendees: [session.user.id],
        lat: pickedLoc.lat,
        lng: pickedLoc.lng,
      })

      if (e) {
        setError(e.message)
        return false
      }

      return true
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '24px 20px 48px', width: '100%', maxWidth: 480, maxHeight: '88dvh', overflowY: 'auto' }}>
        <div style={{ width: 36, height: 4, background: 'rgba(0,0,0,0.12)', borderRadius: 2, margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 20 }}>New gathering</div>
          <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.07)', border: 'none', borderRadius: '50%', width: 30, height: 30, fontSize: 16, color: '#666' }}>x</button>
        </div>

        <Label>Title *</Label>
        <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Sunday Hike in Nose Hill" />

        <Label>Description</Label>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="What should people expect?"
          rows={2}
          style={{ ...inputSt, resize: 'none' }}
        />

        <Label>Date & time *</Label>
        <Input type="datetime-local" value={form.date} onChange={(e) => set('date', e.target.value)} />

        <Label>City *</Label>
        <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Calgary, AB" />

        <Label>Category</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => set('category', c)} style={{ padding: '6px 13px', borderRadius: 20, border: `1.5px solid ${form.category === c ? C.primary : 'rgba(0,0,0,0.1)'}`, background: form.category === c ? C.primaryLight : 'transparent', color: form.category === c ? C.primary : C.muted, fontSize: 13, fontWeight: form.category === c ? 600 : 400 }}>
              {c}
            </button>
          ))}
        </div>

        <Label>Max attendees <span style={{ color: C.light, fontWeight: 400 }}>(optional)</span></Label>
        <Input type="number" value={form.max_attendees} onChange={(e) => set('max_attendees', e.target.value)} placeholder="Leave empty = unlimited" />

        <Label>Location on map *</Label>
        <button onClick={onPickLocation} style={{ width: '100%', padding: '12px', borderRadius: 12, border: `1.5px dashed ${pickedLoc ? C.primary : 'rgba(0,0,0,0.15)'}`, background: pickedLoc ? C.primaryLight : '#fafaf8', color: pickedLoc ? C.primary : C.muted, fontSize: 14, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          Location: {pickedLoc ? `${pickedLoc.lat}, ${pickedLoc.lng}` : 'Tap to pin on map'}
        </button>

        {error && <div style={{ fontSize: 13, color: '#c0392b', marginBottom: 12 }}>{error}</div>}

        <button onClick={submit} disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 14, background: C.primary, color: 'white', border: 'none', fontSize: 16, fontWeight: 700 }}>
          {loading ? 'Creating...' : 'Publish gathering'}
        </button>
      </div>
    </div>
  )
}

const inputSt = { width: '100%', padding: '12px 14px', borderRadius: 11, border: '1px solid rgba(0,0,0,0.1)', fontSize: 14, marginBottom: 14, outline: 'none', display: 'block', background: '#fafaf8' }
const Input = (props) => <input style={inputSt} {...props} />
const Label = ({ children }) => <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 7, color: '#1a1714' }}>{children}</div>
