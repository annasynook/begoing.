import { useState } from 'react'
import { supabase } from '../lib/supabase'

function currentRedirectUrl() {
  if (typeof window === 'undefined') return undefined
  return window.location.href
}

export default function AuthModal({ C, onSuccess, onClose }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const signInWithGoogle = async () => {
    if (!supabase) {
      setError('Supabase is not configured yet.')
      return
    }

    setLoading(true)
    setError('')
    setInfo('')

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: currentRedirectUrl(),
      },
    })

    if (oauthError) {
      setError(oauthError.message)
      setLoading(false)
    }
  }

  const submit = async () => {
    if (!supabase) {
      setError('Supabase is not configured yet.')
      return
    }

    setLoading(true)
    setError('')
    setInfo('')

    if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
          },
          emailRedirectTo: currentRedirectUrl(),
        },
      })

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
        setInfo('We sent a confirmation email. Open it and you will come back into the app without needing to start over.')
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
            <div className="sheet-subtitle">
              {mode === 'login'
                ? 'Sign in to join, host, and manage your gatherings.'
                : 'Use Google or email. If email confirmation is enabled, we will bring you back to this same event after you confirm.'}
            </div>
          </div>
          <button type="button" className="icon-dismiss" onClick={onClose}>x</button>
        </div>

        <div className="sheet-grid">
          <button type="button" className="social-auth-button" disabled={loading} onClick={signInWithGoogle}>
            <span>G</span>
            Continue with Google
          </button>

          <div className="auth-divider">
            <span>or continue with email</span>
          </div>

          {mode === 'signup' ? (
            <input className="sheet-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
          ) : null}
          <input className="sheet-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" />
          <input className="sheet-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (min 6 chars)" type="password" onKeyDown={(event) => { if (event.key === 'Enter') submit() }} />

          {mode === 'signup' ? (
            <div className="auth-note-card">
              <strong>What happens next</strong>
              <span>
                If your Supabase project requires email confirmation, you will tap the link in your inbox and come right back here.
                If confirmation is off, you will land in your account immediately.
              </span>
            </div>
          ) : null}

          {error ? <div className="error-copy">{error}</div> : null}
          {info ? <div className="info-copy auth-success-copy">{info}</div> : null}

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
