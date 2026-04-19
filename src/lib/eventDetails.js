const META_START = '[begoing-meta]'
const META_END = '[/begoing-meta]'

const DEFAULT_META = {
  vibe: 'Chill',
  energy: 'Easy pace',
  welcome: 'Anyone can join',
  price: 'Free',
  bringAlong: 'Just yourself',
  visibility: 'Open to everyone',
}

export function buildEventDescription(form) {
  const meta = {
    vibe: form.vibe || DEFAULT_META.vibe,
    energy: form.energy || DEFAULT_META.energy,
    welcome: form.welcome || DEFAULT_META.welcome,
    price: form.price || DEFAULT_META.price,
    bringAlong: form.bringAlong || DEFAULT_META.bringAlong,
    visibility: form.visibility || DEFAULT_META.visibility,
  }

  const metaBlock = Object.entries(meta)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  return [
    `${META_START}\n${metaBlock}\n${META_END}`,
    (form.description || '').trim(),
  ].filter(Boolean).join('\n\n')
}

export function parseEventRecord(event) {
  const description = event?.description || ''
  const metaMatch = description.match(/\[begoing-meta\]([\s\S]*?)\[\/begoing-meta\]/)
  const meta = { ...DEFAULT_META }

  if (metaMatch?.[1]) {
    metaMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [key, ...rest] = line.split('=')
        if (!key || rest.length === 0) return
        meta[key.trim()] = rest.join('=').trim()
      })
  }

  const descriptionDisplay = description
    .replace(metaMatch?.[0] || '', '')
    .replace(/^\s+/, '')
    .trim()

  return {
    ...event,
    details: meta,
    descriptionDisplay,
    visibility: meta.visibility || DEFAULT_META.visibility,
  }
}

export function canViewEvent(event, viewerId, sharedEventId) {
  const visibility = event?.visibility || DEFAULT_META.visibility
  if (visibility === 'Open to everyone') return true
  if (viewerId && (event.host_id === viewerId || event.attendees?.includes(viewerId))) return true
  if (sharedEventId && event.id === sharedEventId) return true
  return false
}
