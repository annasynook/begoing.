import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthModal({ C, onSuccess, onClose }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const submit = async () => {
    if (!supabase) {
      setError('Supabase is not configured yet.')
      return
    }

    setLoading(true)
    setError('')
    setInfo('')

    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) {
        setError(signUpError.message)
        setLoading(false)
        return
      }

      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          name,
          email,
          city: '',
          interests: [],
        })
      }

      if (!data.session) {
        setInfo('Check your email for the confirmation link, then come back and sign in.')
        setMode('login')
        setLoading(false)
        return
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }
    }

    setLoading(false)
    onSuccess()
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet-modal auth-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</div>
            <div className="sheet-subtitle">{mode === 'login' ? 'Sign in to join and host events.' : 'You only need email and password to start.'}</div>
          </div>
          <button type="button" className="icon-dismiss" onClick={onClose}>x</button>
        </div>

        <div className="sheet-grid">
          {mode === 'signup' ? (
            <input className="sheet-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
          ) : null}
          <input className="sheet-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" />
          <input className="sheet-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (min 6 chars)" type="password" onKeyDown={(event) => { if (event.key === 'Enter') submit() }} />

          {error ? <div className="error-copy">{error}</div> : null}
          {info ? <div className="info-copy">{info}</div> : null}

          <button type="button" className="primary-submit" disabled={loading} onClick={submit}>
            {loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            className="text-switch"
            onClick={() => {
              setMode((current) => (current === 'login' ? 'signup' : 'login'))
              setError('')
              setInfo('')
            }}
            style={{ color: C.primary }}
          >
            {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
