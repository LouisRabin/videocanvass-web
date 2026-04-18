import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Modal } from './Modal'
import { supabase } from '../lib/supabase'

const field: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '10px 12px',
  width: '100%',
  boxSizing: 'border-box',
  fontSize: 16,
}

const btn: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'white',
  fontWeight: 700,
  cursor: 'pointer',
}

const btnPrimary: CSSProperties = {
  border: '1px solid #111827',
  borderRadius: 10,
  padding: '12px 14px',
  background: '#111827',
  color: 'white',
  fontWeight: 800,
  cursor: 'pointer',
}

type Step = 'list' | 'enroll' | 'confirm'

type Props = {
  open: boolean
  onClose: () => void
  onFactorsChanged: () => void
}

export function MfaEnrollmentModal(props: Props) {
  const [step, setStep] = useState<Step>('list')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [confirmCode, setConfirmCode] = useState('')
  const [existingTotpId, setExistingTotpId] = useState<string | null>(null)

  const refreshFactors = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) {
      setMessage(error.message)
      return
    }
    const totp = data?.totp?.[0]
    setExistingTotpId(totp?.id && totp.status === 'verified' ? totp.id : null)
  }, [])

  const resetToList = useCallback(() => {
    setStep('list')
    setMessage(null)
    setPendingFactorId(null)
    setQrDataUrl(null)
    setTotpSecret(null)
    setConfirmCode('')
  }, [])

  const handleClose = useCallback(() => {
    resetToList()
    props.onClose()
  }, [props, resetToList])

  useEffect(() => {
    if (!props.open) return
    setStep('list')
    setMessage(null)
    setPendingFactorId(null)
    setQrDataUrl(null)
    setTotpSecret(null)
    setConfirmCode('')
    void refreshFactors()
  }, [props.open, refreshFactors])

  return (
    <Modal title="Authenticator app (2FA)" open={props.open} onClose={handleClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        {step === 'list' ? (
          <>
            <p style={{ margin: 0, fontSize: 14, color: '#4b5563', lineHeight: 1.45 }}>
              Use an authenticator app (Google Authenticator, 1Password, etc.) for a second step at sign-in when MFA is enabled in your Supabase project.
            </p>
            {existingTotpId ? (
              <div style={{ fontSize: 14, color: '#047857' }}>Authenticator is set up for this account.</div>
            ) : (
              <div style={{ fontSize: 14, color: '#6b7280' }}>No authenticator enrolled yet.</div>
            )}
            {message ? <div style={{ color: '#b91c1c', fontSize: 14 }}>{message}</div> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {!existingTotpId ? (
                <button type="button" style={btnPrimary} onClick={() => setStep('enroll')}>
                  Set up authenticator
                </button>
              ) : null}
              {existingTotpId ? (
                <button
                  type="button"
                  style={btn}
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      if (!supabase || !existingTotpId) return
                      setBusy(true)
                      setMessage(null)
                      try {
                        const { error } = await supabase.auth.mfa.unenroll({ factorId: existingTotpId })
                        if (error) throw error
                        props.onFactorsChanged()
                        await refreshFactors()
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : 'Could not remove factor')
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                >
                  {busy ? 'Working…' : 'Remove authenticator'}
                </button>
              ) : null}
              <button type="button" style={btn} onClick={handleClose}>
                Close
              </button>
            </div>
          </>
        ) : null}

        {step === 'enroll' ? (
          <>
            <p style={{ margin: 0, fontSize: 14, color: '#4b5563', lineHeight: 1.45 }}>
              We will show a QR code. Scan it in your app, then enter a 6-digit code to confirm.
            </p>
            {message ? <div style={{ color: '#b91c1c', fontSize: 14 }}>{message}</div> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    if (!supabase) return
                    setBusy(true)
                    setMessage(null)
                    try {
                      const { data, error } = await supabase.auth.mfa.enroll({
                        factorType: 'totp',
                        friendlyName: 'VideoCanvass',
                      })
                      if (error) throw error
                      if (data.type !== 'totp' || !data.totp) throw new Error('Unexpected enroll response')
                      setPendingFactorId(data.id)
                      setQrDataUrl(data.totp.qr_code ?? null)
                      setTotpSecret(data.totp.secret ?? null)
                      setStep('confirm')
                    } catch (e) {
                      setMessage(e instanceof Error ? e.message : 'Enrollment failed')
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              >
                {busy ? 'Starting…' : 'Generate QR code'}
              </button>
              <button type="button" style={btn} onClick={() => { setStep('list'); setMessage(null) }}>
                Back
              </button>
            </div>
          </>
        ) : null}

        {step === 'confirm' ? (
          <>
            {qrDataUrl ? (
              <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Scan this QR code</span>
                <img
                  src={qrDataUrl}
                  alt="Authenticator QR"
                  style={{ width: 200, height: 200, border: '1px solid #e5e7eb', borderRadius: 8 }}
                />
              </div>
            ) : null}
            {totpSecret ? (
              <div style={{ fontSize: 12, color: '#6b7280', wordBreak: 'break-all' }}>
                Or enter secret manually: <code>{totpSecret}</code>
              </div>
            ) : null}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Code from app</span>
              <input
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                style={field}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </label>
            {message ? <div style={{ color: '#b91c1c', fontSize: 14 }}>{message}</div> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={busy || !pendingFactorId}
                onClick={() => {
                  void (async () => {
                    if (!supabase || !pendingFactorId) return
                    const c = confirmCode.replace(/\s/g, '')
                    if (c.length < 6) {
                      setMessage('Enter the 6-digit code.')
                      return
                    }
                    setBusy(true)
                    setMessage(null)
                    try {
                      const { error } = await supabase.auth.mfa.challengeAndVerify({
                        factorId: pendingFactorId,
                        code: c,
                      })
                      if (error) throw error
                      props.onFactorsChanged()
                      handleClose()
                    } catch (e) {
                      setMessage(e instanceof Error ? e.message : 'Verification failed')
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              >
                {busy ? 'Confirming…' : 'Confirm and finish'}
              </button>
              <button type="button" style={btn} onClick={() => { setStep('list'); setMessage(null) }}>
                Cancel
              </button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
