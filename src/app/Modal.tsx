import React, { useEffect } from 'react'

export function Modal(props: {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!props.open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props.open, props.onClose])

  if (!props.open) return null

  return (
    <div style={backdrop} role="dialog" aria-modal="true" aria-label={props.title}>
      <div style={panel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontWeight: 900 }}>{props.title}</div>
          <div style={{ flex: 1 }} />
          <button onClick={props.onClose} style={iconBtn} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={{ padding: 14 }}>{props.children}</div>
      </div>
      <div style={clickCatcher} onMouseDown={props.onClose} />
    </div>
  )
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'grid',
  placeItems: 'center',
}

const clickCatcher: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17,24,39,0.35)',
  zIndex: 10000,
}

const panel: React.CSSProperties = {
  position: 'relative',
  zIndex: 10001,
  width: 'min(720px, calc(100vw - 24px))',
  borderRadius: 16,
  background: 'white',
  border: '1px solid #e5e7eb',
  boxShadow: '0 20px 40px rgba(0,0,0,0.18)',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 14,
  borderBottom: '1px solid #e5e7eb',
}

const iconBtn: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '6px 10px',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 900,
}

