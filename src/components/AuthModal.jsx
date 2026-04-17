import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthModal({ C, onSuccess, onClose }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setLoading(true); setError('')
    if (mode === 'signup') {
      const { data, error: e } = await supabase.auth.signUp({ email, password })
      if (e) { setError(e.message); setLoading(false); return }
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id, name, email, city: '', interests: [],
        })
      }
    } else {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password })
      if (e) { setError(e.message); setLoading(false); return }
    }
    setLoading(false)
    onSuccess()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: '24px 24px 0 0', padding: '28px 24px 48px', width: '100%', maxWidth: 480 }}>
        <div style={{ width: 36, height: 4, background: 'rgba(0,0,0,0.12)', borderRadius: 2, margin: '0 auto 24px' }} />
        <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 4 }}>
          {mode === 'login' ? 'Welcome back' : 'Join begoing.'}
        </div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 22 }}>
          {mode === 'login' ? 'Sign in to join events' : 'Create your free account'}
        </div>

        {mode === 'signup' && <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />}
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
        <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 chars)" type="password" onKeyDown={(e) => e.key === 'Enter' && submit()} />

        {error && <div style={{ fontSize: 13, color: '#c0392b', marginBottom: 12 }}>{error}</div>}

        <button onClick={submit} disabled={loading} style={{ width: '100%', padding: 14, borderRadius: 14, background: C.primary, color: 'white', border: 'none', fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
          {loading ? '...' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <div style={{ textAlign: 'center', fontSize: 14, color: C.muted }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have one? '}
          <button onClick={() => { setMode((m) => m === 'login' ? 'signup' : 'login'); setError('') }} style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 700, cursor: 'pointer' }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

const Input = (props) => (
  <input style={{ width: '100%', padding: '12px 14px', borderRadius: 11, border: '1px solid rgba(0,0,0,0.1)', fontSize: 15, marginBottom: 12, outline: 'none', display: 'block', background: '#fafaf8' }} {...props} />
)
