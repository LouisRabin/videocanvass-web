import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from '../lib/useMediaQuery'

export function Modal(props: {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Backdrop and panel stack above other modals that use the default (60000). */
  zBase?: number
  /** Wider panel for galleries / photo viewer. */
  wide?: boolean
}) {
  const zBase = props.zBase ?? 60000
  const zBackdrop = zBase
  const zPanel = zBase + 1
  const narrow = useMediaQuery(MOBILE_BREAKPOINT_QUERY)
  /** Fit modal to the visible viewport so the software keyboard does not shove the sheet off-screen. */
  const [vvLay, setVvLay] = useState(() => ({
    top: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 640,
  }))

  useEffect(() => {
    if (!props.open || !narrow) return
    const vv = window.visualViewport
    const sync = () => {
      if (vv) {
        setVvLay({ top: vv.offsetTop, height: vv.height })
      } else {
        setVvLay({ top: 0, height: window.innerHeight })
      }
    }
    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
    }
  }, [props.open, narrow])

  const panelStyle: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = props.wide
      ? {
          ...panel,
          width: 'min(960px, calc(100vw - 24px))',
          maxWidth: 'calc(100vw - 24px)',
          minWidth: 0,
        }
      : { ...panel }
    if (!narrow) return base
    return {
      ...base,
      width: 'min(720px, calc(100vw - 16px))',
      maxWidth: 'calc(100vw - 16px)',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }
  }, [narrow, props.wide])

  const narrowPanelMaxH = narrow ? Math.max(200, Math.round(vvLay.height) - 52) : undefined
  const panelMerged: React.CSSProperties =
    narrow && narrowPanelMaxH != null ? { ...panelStyle, maxHeight: narrowPanelMaxH } : panelStyle

  useEffect(() => {
    if (!props.open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props.open, props.onClose])

  if (!props.open) return null

  const backdropStyle: React.CSSProperties = narrow
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        top: vvLay.top,
        height: vvLay.height,
        width: '100%',
        maxWidth: '100vw',
        display: 'grid',
        placeItems: 'center',
        placeContent: 'center',
        padding: 'max(6px, env(safe-area-inset-top, 0px)) max(10px, env(safe-area-inset-right, 0px)) max(6px, env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px))',
        overflowX: 'hidden',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box',
      }
    : backdrop

  const node = (
    <div style={{ ...backdropStyle, zIndex: zBackdrop }} role="dialog" aria-modal="true" aria-label={props.title}>
      <div
        style={{ ...panelMerged, zIndex: zPanel }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div style={{ ...header, flexShrink: 0, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontWeight: 900 }}>{props.title}</div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={props.onClose}
            style={narrow ? { ...iconBtn, minWidth: 44, minHeight: 44, padding: 0 } : iconBtn}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div
          style={{
            padding: 14,
            flex: narrow ? 1 : undefined,
            minHeight: narrow ? 0 : undefined,
            minWidth: 0,
            maxWidth: '100%',
            overflowX: 'hidden',
            overflowY: narrow ? 'auto' : undefined,
            WebkitOverflowScrolling: narrow ? 'touch' : undefined,
            scrollPaddingBottom: narrow ? 120 : undefined,
            boxSizing: 'border-box',
          }}
        >
          {props.children}
        </div>
      </div>
      <div style={{ ...clickCatcher, zIndex: zBackdrop }} onClick={props.onClose} />
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(node, document.body)
  }
  return node
}

/** Above map Marker overlays (track pins use ~12k) so dialogs always win stacking. */
const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  maxWidth: '100vw',
  display: 'grid',
  placeItems: 'center',
  overflowX: 'hidden',
  boxSizing: 'border-box',
}

const clickCatcher: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17,24,39,0.35)',
}

const panel: React.CSSProperties = {
  position: 'relative',
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

