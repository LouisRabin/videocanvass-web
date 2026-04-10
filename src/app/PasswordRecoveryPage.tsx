import type { CSSProperties } from 'react'
import { useState } from 'react'
import { Layout } from './Layout'
import { supabase } from '../lib/supabase'
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

type Props = {
  onComplete: () => void
  onSignOut: () => void
}

/** Shown after the user opens the reset link from email (`PASSWORD_RECOVERY` session). */
export function PasswordRecoveryPage(props: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async () => {
    setMessage(null)
    const pw = password
    const c = confirm
    if (pw.length < 8) {
      setMessage('Use at least 8 characters for your password.')
      return
    }
    if (pw !== c) {
      setMessage('Passwords do not match.')
      return
    }
    if (!supabase) return
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      props.onComplete()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not update password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout title="VideoCanvass" subtitle="Set a new password">
      <div style={vcAuthMainCenterWrap}>
        <div style={card}>
          <form
            style={{ display: 'grid', gap: 14 }}
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18, color: vcGlassFgDarkReadable }}>Choose a new password</div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#475569' }}>
              Your email link was valid. Enter a new password below, then continue to your workspace.
            </p>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: vcGlassFgDarkReadable }}>New password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={field}
                autoComplete="new-password"
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: vcGlassFgDarkReadable }}>Confirm password</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={field}
                autoComplete="new-password"
              />
            </label>
            {message ? <div style={{ color: '#b91c1c', fontSize: 14 }}>{message}</div> : null}
            <button type="submit" style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }} disabled={busy}>
              {busy ? 'Please wait…' : 'Update password'}
            </button>
          </form>
          <button type="button" style={btnGhost} onClick={() => void props.onSignOut()}>
            Cancel and sign out
          </button>
        </div>
      </div>
    </Layout>
  )
}
