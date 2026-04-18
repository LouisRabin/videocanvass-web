import { useState, type CSSProperties } from 'react'
import { supabase } from '../lib/supabase'
import { getPreferredTotpFactorId, verifyTotpChallenge } from '../lib/mfaAuth'
import {
  vcGlassBtnPrimary,
  vcGlassFgDarkReadable,
  vcGlassFieldOnContentSurface,
  vcLiquidGlassInnerSurface,
} from '../lib/vcLiquidGlass'

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

type Props = {
  onSignOut: () => void
}

export function MfaTotpChallengePanel(props: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = async () => {
    if (!supabase) return
    setMessage(null)
    const c = code.replace(/\s/g, '')
    if (c.length < 6) {
      setMessage('Enter the 6-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    try {
      const factorId = await getPreferredTotpFactorId(supabase)
      if (!factorId) {
        setMessage('No authenticator factor found. Sign out and contact support if this persists.')
        return
      }
      await verifyTotpChallenge(supabase, factorId, c)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        ...vcLiquidGlassInnerSurface,
        display: 'grid',
        gap: 14,
        maxWidth: 420,
        width: '100%',
        padding: 20,
        borderRadius: 16,
        boxSizing: 'border-box',
        color: vcGlassFgDarkReadable,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 18 }}>Two-step verification</div>
      <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.45 }}>
        Open your authenticator app and enter the current code for VideoCanvass.
      </p>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Authentication code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={field}
          autoComplete="one-time-code"
          inputMode="numeric"
          autoFocus
        />
      </label>
      {message ? <div style={{ color: '#b91c1c', fontSize: 14 }}>{message}</div> : null}
      <button type="button" style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => void submit()}>
        {busy ? 'Verifying…' : 'Verify'}
      </button>
      <button
        type="button"
        style={{ border: 'none', background: 'transparent', color: '#2563eb', fontWeight: 700, cursor: 'pointer', textAlign: 'left', padding: 0 }}
        onClick={props.onSignOut}
      >
        Sign out
      </button>
    </div>
  )
}
