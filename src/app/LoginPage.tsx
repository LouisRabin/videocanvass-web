import type { CSSProperties } from 'react'
import { useState } from 'react'
import { Layout } from './Layout'
import { supabase } from '../lib/supabase'
import { relationalBackendEnabled } from '../lib/backendMode'
import {
  vcAuthMainCenterWrap,
  vcGlassBtnPrimary,
  vcGlassFgDarkReadable,
  vcGlassFieldOnContentSurface,
  vcLiquidGlassInnerSurface,
} from '../lib/vcLiquidGlass'

const card: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  boxSizing: 'border-box',
  ...vcLiquidGlassInnerSurface,
  borderRadius: 16,
  padding: 20,
  display: 'grid',
  gap: 14,
  color: vcGlassFgDarkReadable,
}

const field: CSSProperties = {
  ...vcGlassFieldOnContentSurface,
  borderRadius: 10,
  padding: '10px 12px',
  width: '100%',
  boxSizing: 'border-box',
  fontSize: 16,
}

const btnPrimary: CSSProperties = {
  ...vcGlassBtnPrimary,
  width: '100%',
  boxSizing: 'border-box',
}

const btnGhost: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#1d4ed8',
  fontWeight: 700,
  cursor: 'pointer',
  textAlign: 'left' as const,
  padding: 0,
}

export function LoginPage() {
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!relationalBackendEnabled() || !supabase) {
    return (
      <Layout title="VideoCanvass" subtitle="Configuration error">
        <div style={vcAuthMainCenterWrap}>
          <div style={{ ...vcLiquidGlassInnerSurface, maxWidth: 480, width: '100%', padding: 16, borderRadius: 14, color: '#92400e' }}>
            Sign-in needs <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> baked into the build (same names in Vercel).
            If those are set but you still see this, set <code>VITE_VC_RELATIONAL_BACKEND=true</code> explicitly or remove a conflicting value, then redeploy.
            For demo sign-in with Supabase vars present, use <code>VITE_VC_RELATIONAL_BACKEND=false</code>.
          </div>
        </div>
      </Layout>
    )
  }

  const submit = async () => {
    setMessage(null)
    const em = email.trim()
    const pw = password
    if (!em || !pw) {
      setMessage('Enter email and password.')
      return
    }
    const client = supabase
    if (!client) return
    setBusy(true)
    try {
      if (mode === 'sign_up') {
        const { error } = await client.auth.signUp({
          email: em,
          password: pw,
          options: {
            data: {
              display_name: displayName.trim(),
              tax_number: taxNumber.trim(),
            },
          },
        })
        if (error) throw error
        setMessage('Check your email to confirm your account, then sign in.')
        setMode('sign_in')
      } else {
        const { error } = await client.auth.signInWithPassword({ email: em, password: pw })
        if (error) throw error
        // Session + optional MFA step are handled by SessionGate (auth listener).
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout title="VideoCanvass" subtitle="Sign in to your workspace">
      <div style={vcAuthMainCenterWrap}>
        <div style={card}>
          <form
            style={{ display: 'grid', gap: 14 }}
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18, color: vcGlassFgDarkReadable }}>
              {mode === 'sign_in' ? 'Sign in' : 'Create account'}
            </div>
            {mode === 'sign_up' ? (
              <>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: vcGlassFgDarkReadable }}>Display name</span>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={field} autoComplete="name" />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: vcGlassFgDarkReadable }}>Tax / ID number</span>
                  <input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} style={field} autoComplete="off" />
                </label>
              </>
            ) : null}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: vcGlassFgDarkReadable }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={field}
                autoComplete="email"
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: vcGlassFgDarkReadable }}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={field}
                autoComplete={mode === 'sign_in' ? 'current-password' : 'new-password'}
              />
            </label>
            {message ? (
              <div style={{ color: message.includes('Check your email') ? '#047857' : '#b91c1c', fontSize: 14 }}>{message}</div>
            ) : null}
            <button type="submit" style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <button
            type="button"
            style={btnGhost}
            onClick={() => {
              setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')
              setMessage(null)
            }}
          >
            {mode === 'sign_in' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </Layout>
  )
}
