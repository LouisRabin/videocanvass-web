import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { TourStepDef } from './tourSteps'
import { resolveTourElement } from './tourSteps'
import type { TargetMode } from '../../lib/targetMode'

const Z_OVERLAY = 200_000

type Props = {
  steps: TourStepDef[]
  variant: TargetMode
  onClose: () => void
  /** Called when user finishes last step; `dontShowAgain` from checkbox */
  onComplete: (dontShowAgain: boolean) => void
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function ProductTour(props: Props) {
  const { steps, onClose, onComplete } = props
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; maxW: number } | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef<HTMLDivElement>(null)

  const step = steps[index]
  const isLast = index >= steps.length - 1
  const total = steps.length

  const updateGeometry = useCallback(() => {
    if (!step) return
    const edgeMargin = 12
    const el = step.target ? resolveTourElement(step.target) : null
    if (el && el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      const r = el.getBoundingClientRect()
      setRect(r)
      const pad = 8
      const margin = edgeMargin
      const tw = 320
      const th = 200
      const vw = window.innerWidth
      const vh = window.innerHeight
      let top = r.bottom + pad
      let left = r.left + r.width / 2 - tw / 2
      const pref = step.placement ?? 'bottom'
      if (pref === 'top' && r.top > th + margin) {
        top = r.top - pad - th
      } else if (pref === 'left' && r.left > tw + margin) {
        left = r.left - tw - pad
        top = r.top + r.height / 2 - th / 2
      } else if (pref === 'right' && r.right + tw + margin < vw) {
        left = r.right + pad
        top = r.top + r.height / 2 - th / 2
      } else if (pref === 'bottom' || top + th > vh - margin) {
        if (r.top > th + margin) top = r.top - pad - th
        else top = clamp(r.bottom + pad, margin, vh - th - margin)
      }
      left = clamp(left, margin, vw - tw - margin)
      top = clamp(top, margin, vh - margin)
      setTooltipPos({ top, left, maxW: tw })
    } else {
      setRect(null)
      setTooltipPos({
        top: Math.max(edgeMargin, (window.innerHeight - 280) / 2),
        left: Math.max(edgeMargin, (window.innerWidth - 340) / 2),
        maxW: Math.min(340, window.innerWidth - edgeMargin * 2),
      })
    }
  }, [step])

  useLayoutEffect(() => {
    updateGeometry()
    const t = window.setTimeout(updateGeometry, 320)
    return () => clearTimeout(t)
  }, [index, updateGeometry])

  useEffect(() => {
    const onResize = () => updateGeometry()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [updateGeometry])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (liveRef.current && step) {
      liveRef.current.textContent = `${step.title}. ${step.body}`
    }
  }, [step])

  const goNext = useCallback(() => {
    if (isLast) {
      onComplete(dontShowAgain)
      return
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1))
  }, [dontShowAgain, isLast, onComplete, steps.length])

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const btn: CSSProperties = useMemo(
    () => ({
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '8px 12px',
      background: 'white',
      fontWeight: 700,
      fontSize: 14,
      cursor: 'pointer',
    }),
    [],
  )

  const primaryBtn: CSSProperties = useMemo(
    () => ({
      ...btn,
      borderColor: '#111827',
      background: '#111827',
      color: 'white',
    }),
    [btn],
  )

  if (!step || total === 0) return null

  const hole = rect
    ? {
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      }
    : null

  const portal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vc-tour-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_OVERLAY,
        pointerEvents: 'auto',
      }}
    >
      <div
        className="vc-tour-sr"
        ref={liveRef}
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.52)',
          pointerEvents: 'auto',
        }}
        aria-hidden
      />
      {hole ? (
        <div
          style={{
            position: 'fixed',
            left: hole.left,
            top: hole.top,
            width: hole.width,
            height: hole.height,
            borderRadius: 10,
            border: '3px solid rgba(255,255,255,0.95)',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: Z_OVERLAY + 1,
            boxShadow: '0 0 0 2px rgba(17,24,39,0.25)',
          }}
          aria-hidden
        />
      ) : null}

      {tooltipPos ? (
        <div
          ref={cardRef}
          tabIndex={-1}
          style={{
            position: 'fixed',
            top: tooltipPos.top,
            left: tooltipPos.left,
            maxWidth: tooltipPos.maxW,
            width: 'calc(100vw - 24px)',
            boxSizing: 'border-box',
            background: 'white',
            borderRadius: 14,
            padding: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            border: '1px solid #e5e7eb',
            zIndex: Z_OVERLAY + 1,
            pointerEvents: 'auto',
          }}
        >
          <div id="vc-tour-title" style={{ fontWeight: 900, fontSize: 17, marginBottom: 8, color: '#111827' }}>
            {step.title}
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#374151' }}>{step.body}</p>
          <div style={{ marginTop: 14, fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
            Step {index + 1} of {total}
          </div>
          {isLast ? (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} />
              Don’t show this tour again ({props.variant === 'web' ? 'wide layout' : 'narrow layout'})
            </label>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button type="button" style={btn} onClick={onClose}>
              Skip
            </button>
            {index > 0 ? (
              <button type="button" style={btn} onClick={goBack}>
                Back
              </button>
            ) : null}
            <button type="button" style={primaryBtn} onClick={goNext}>
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )

  return createPortal(portal, document.body)
}
