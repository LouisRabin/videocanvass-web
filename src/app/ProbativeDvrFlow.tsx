import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { Modal } from './Modal'
import {
  composeManualOffset,
  decomposeAbsMs,
  driftFromClocks,
  formatDriftBreakdown,
  incidentRealToDvrDisplay,
  manualOffsetHasInput,
  parseDateTimeLocal,
} from './dvrTimeMath'
import { formatAppDateTime, formatTimeThenDate } from '../lib/timeFormat'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from '../lib/useMediaQuery'

const btn: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '8px 10px',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

const btnPrimary: CSSProperties = {
  ...btn,
  borderColor: '#111827',
  background: '#111827',
  color: 'white',
}

const field: CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'white',
}

const label: CSSProperties = {
  fontSize: 12,
  color: '#111827',
  fontWeight: 800,
  marginBottom: 6,
}

const numGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: 10,
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const HOUR_OPTIONS_24 = Array.from({ length: 24 }, (_, i) => pad2(i))
const MINUTE_OPTIONS_60 = Array.from({ length: 60 }, (_, i) => pad2(i))
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

const WHEEL_ROW_PX = 26
const WHEEL_VISIBLE_ROWS = 5
const WHEEL_HEIGHT_PX = WHEEL_ROW_PX * WHEEL_VISIBLE_ROWS
/** Spacer rows so the first/last value can scroll into the center band (same as half of visible rows). */
const WHEEL_PAD_ROWS = Math.floor(WHEEL_VISIBLE_ROWS / 2)

function wheelSnapScrollTop(index: number, len: number): number {
  const max = Math.max(0, (len - 1) * WHEEL_ROW_PX)
  const t = index * WHEEL_ROW_PX
  return Math.max(0, Math.min(max, t))
}

const wheelPadRowStyle: CSSProperties = {
  height: WHEEL_ROW_PX,
  flexShrink: 0,
  scrollSnapAlign: 'start',
  boxSizing: 'border-box',
}

/** Scroll-snap column: native div + touch scroll (no seconds). */
function TimeWheel(props: {
  values: string[]
  value: string
  disabled?: boolean
  onChange: (v: string) => void
  ariaLabel: string
}) {
  const { values, value, disabled, onChange, ariaLabel } = props
  const ref = useRef<HTMLDivElement>(null)
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToValue = useCallback(
    (v: string, instant: boolean) => {
      const el = ref.current
      if (!el || disabled) return
      const idx = values.indexOf(v)
      if (idx < 0) return
      const top = wheelSnapScrollTop(idx, values.length)
      el.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' })
    },
    [values, disabled],
  )

  useLayoutEffect(() => {
    scrollToValue(value, true)
  }, [value, scrollToValue])

  useEffect(() => {
    return () => {
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current)
    }
  }, [])

  const onScroll = () => {
    const el = ref.current
    if (!el || disabled) return
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current)
    scrollEndTimer.current = setTimeout(() => {
      scrollEndTimer.current = null
      const n = Math.round(el.scrollTop / WHEEL_ROW_PX)
      const c = Math.max(0, Math.min(values.length - 1, n))
      const next = values[c]!
      const snap = wheelSnapScrollTop(c, values.length)
      if (Math.abs(el.scrollTop - snap) > 0.5) el.scrollTop = snap
      if (next !== value) onChange(next)
    }, 50)
  }

  return (
    <div
      style={{
        height: WHEEL_HEIGHT_PX,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#f9fafb',
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      <div
        aria-label={ariaLabel}
        ref={ref}
        role="listbox"
        onScroll={onScroll}
        style={{
          height: WHEEL_HEIGHT_PX,
          overflowY: 'scroll',
          overscrollBehavior: 'contain',
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
        }}
      >
        {Array.from({ length: WHEEL_PAD_ROWS }, (_, i) => (
          <div key={`wheel-pad-top-${i}`} aria-hidden style={wheelPadRowStyle} />
        ))}
        {values.map((v) => (
          <div
            key={v}
            role="option"
            aria-selected={v === value}
            onClick={() => {
              if (disabled) return
              onChange(v)
            }}
            style={{
              height: WHEEL_ROW_PX,
              scrollSnapAlign: 'start',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: v === value ? 800 : 600,
              fontVariantNumeric: 'tabular-nums',
              color: v === value ? '#111827' : '#9ca3af',
              flexShrink: 0,
              boxSizing: 'border-box',
              cursor: disabled ? 'default' : 'pointer',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {v}
          </div>
        ))}
        {Array.from({ length: WHEEL_PAD_ROWS }, (_, i) => (
          <div key={`wheel-pad-bottom-${i}`} aria-hidden style={wheelPadRowStyle} />
        ))}
      </div>
      {/* Center highlight band */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: WHEEL_ROW_PX,
          marginTop: -WHEEL_ROW_PX / 2,
          borderTop: '1px solid #d1d5db',
          borderBottom: '1px solid #d1d5db',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

function parseDvrLocalParts(iso: string): { date: string; h: string; m: string; s: string } {
  const v = iso.trim()
  if (!v) return { date: '', h: '00', m: '00', s: '00' }
  const [date = '', rest = ''] = v.split('T')
  if (!date) return { date: '', h: '00', m: '00', s: '00' }
  if (!rest) return { date, h: '00', m: '00', s: '00' }
  const [h = '00', m = '00', sRaw = '00'] = rest.split(':')
  const sx = sRaw.replace(/\D/g, '').slice(0, 2) || '00'
  return {
    date,
    h: pad2(Math.min(23, Math.max(0, parseInt(h, 10) || 0))),
    m: pad2(Math.min(59, Math.max(0, parseInt(m, 10) || 0))),
    s: pad2(Math.min(59, Math.max(0, parseInt(sx, 10) || 0))),
  }
}

function ymdTodayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const PICKER_PORTAL_Z = 63000

/**
 * Opens a separate prompt (portal) with date and time side-by-side. Draft state: either can be set first;
 * Done fills missing date with today or missing time with 00:00.
 */
export function DvrSingleDateTimePicker(props: {
  legend: string
  /** Muted text on the same row as `legend` (e.g. “Optional”). */
  legendHint?: string
  value: string
  onChange: (v: string) => void
  isNarrow: boolean
  warn?: boolean
  /** Show “Clear” in the dialog footer (e.g. optional subject time on a track point). */
  clearable?: boolean
}) {
  type Draft = { date: string; h: string; m: string }
  const parsed = parseDvrLocalParts(props.value)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>({ date: parsed.date, h: parsed.h, m: parsed.m })
  const [cursor, setCursor] = useState(() => new Date())

  const openPrompt = useCallback(() => {
    const p = parseDvrLocalParts(props.value)
    setDraft({ date: p.date, h: p.h, m: p.m })
    if (p.date) {
      const [y, m, d] = p.date.split('-').map(Number)
      setCursor(new Date(y!, (m ?? 1) - 1, d ?? 1))
    } else {
      setCursor(new Date())
    }
    setPickerOpen(true)
  }, [props.value])

  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      setPickerOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pickerOpen])

  const commit = useCallback(() => {
    const date = draft.date.trim() || ymdTodayLocal()
    const h = draft.h || '00'
    const m = draft.m || '00'
    props.onChange(`${date}T${h}:${m}:00`)
    setPickerOpen(false)
  }, [draft, props.onChange])

  const cy = cursor.getFullYear()
  const cmi = cursor.getMonth()
  const firstDow = new Date(cy, cmi, 1).getDay()
  const dim = new Date(cy, cmi + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= dim; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  while (cells.length < 42) cells.push(null)

  const monthTitle = cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const ymdSelected = (day: number) => `${cy}-${pad2(cmi + 1)}-${pad2(day)}`

  const ts = props.value.trim() ? parseDateTimeLocal(props.value) : null
  const summary = ts != null ? formatAppDateTime(ts) : null

  const openBtnStyle: CSSProperties = {
    ...field,
    minHeight: props.isNarrow ? 48 : 44,
    fontSize: props.isNarrow ? 16 : 14,
    textAlign: 'left',
    cursor: 'pointer',
    fontWeight: ts != null ? 700 : 600,
    color: ts != null ? '#111827' : '#6b7280',
    touchAction: 'manipulation',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
  }

  const navBtn: CSSProperties = {
    ...btn,
    padding: '2px 8px',
    minWidth: 32,
    fontSize: 15,
    lineHeight: 1,
  }

  const portal =
    pickerOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="presentation"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: PICKER_PORTAL_Z,
              display: 'grid',
              placeItems: 'center',
              padding: 'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
              boxSizing: 'border-box',
              background: 'rgba(17, 24, 39, 0.45)',
            }}
            onClick={() => setPickerOpen(false)}
          >
            <div
              role="dialog"
              aria-label={props.legend}
              style={{
                width: 'min(520px, 100%)',
                maxHeight: 'min(640px, 92dvh)',
                overflow: 'auto',
                background: 'white',
                borderRadius: 16,
                border: '1px solid #e5e7eb',
                boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
                boxSizing: 'border-box',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '12px 14px',
                  borderBottom: '1px solid #e5e7eb',
                  flexShrink: 0,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 15 }}>{props.legend}</div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  style={{ ...btn, padding: '6px 10px', minWidth: 40 }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  padding: 14,
                  display: 'flex',
                  flexDirection: props.isNarrow ? 'column' : 'row',
                  gap: 16,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <button
                      type="button"
                      style={navBtn}
                      onClick={() => setCursor(new Date(cy, cmi - 1, 1))}
                      aria-label="Previous month"
                    >
                      ‹
                    </button>
                    <div style={{ fontWeight: 900, fontSize: 13, color: '#111827' }}>{monthTitle}</div>
                    <button
                      type="button"
                      style={navBtn}
                      onClick={() => setCursor(new Date(cy, cmi + 1, 1))}
                      aria-label="Next month"
                    >
                      ›
                    </button>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(7, 1fr)',
                      gap: 2,
                      marginTop: 8,
                      textAlign: 'center',
                      fontSize: 10,
                      color: '#6b7280',
                      fontWeight: 800,
                    }}
                  >
                    {WEEKDAY_LABELS.map((w) => (
                      <div key={w}>{w}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginTop: 4 }}>
                    {cells.map((day, i) =>
                      day == null ? (
                        <div key={`e-${i}`} aria-hidden style={{ minHeight: 26 }} />
                      ) : (
                        <button
                          key={`${cy}-${cmi}-${day}`}
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({ ...d, date: ymdSelected(day) }))
                          }
                          style={{
                            minHeight: props.isNarrow ? 30 : 28,
                            padding: 0,
                            borderRadius: 6,
                            border:
                              draft.date === ymdSelected(day)
                                ? '2px solid #111827'
                                : '1px solid #e5e7eb',
                            background: draft.date === ymdSelected(day) ? '#111827' : 'white',
                            color: draft.date === ymdSelected(day) ? 'white' : '#111827',
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: 'pointer',
                            touchAction: 'manipulation',
                            lineHeight: 1,
                          }}
                        >
                          {day}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div style={{ flex: '1 1 160px', minWidth: 0, width: '100%' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                      alignItems: 'stretch',
                      maxWidth: 280,
                      margin: props.isNarrow ? '0 auto' : 0,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#6b7280', textAlign: 'center' }}>
                        Hour
                      </span>
                      <TimeWheel
                        values={HOUR_OPTIONS_24}
                        value={draft.h}
                        onChange={(h) => setDraft((d) => ({ ...d, h }))}
                        ariaLabel={`${props.legend} — hour 00–23`}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#6b7280', textAlign: 'center' }}>
                        Minute
                      </span>
                      <TimeWheel
                        values={MINUTE_OPTIONS_60}
                        value={draft.m}
                        onChange={(m) => setDraft((d) => ({ ...d, m }))}
                        ariaLabel={`${props.legend} — minute`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  justifyContent: 'flex-end',
                  padding: '12px 14px',
                  borderTop: '1px solid #e5e7eb',
                }}
              >
                <button type="button" style={btn} onClick={() => setPickerOpen(false)}>
                  Cancel
                </button>
                {props.clearable ? (
                  <button
                    type="button"
                    style={btn}
                    onClick={() => {
                      props.onChange('')
                      setPickerOpen(false)
                    }}
                  >
                    Clear
                  </button>
                ) : null}
                <button type="button" style={btnPrimary} onClick={commit}>
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div
      style={
        props.warn
          ? {
              padding: 10,
              borderRadius: 12,
              border: '1px solid #dc2626',
              background: '#fef2f2',
              boxSizing: 'border-box',
            }
          : undefined
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, color: '#111827', fontWeight: 800 }}>{props.legend}</span>
        {props.legendHint ? (
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{props.legendHint}</span>
        ) : null}
      </div>
      <button type="button" style={openBtnStyle} onClick={openPrompt} aria-haspopup="dialog">
        <span>{summary ?? 'Pick date and time'}</span>
        <span style={{ opacity: 0.65, flexShrink: 0, fontSize: 12, fontWeight: 700 }}>Set</span>
      </button>
      {portal}
    </div>
  )
}

type Step = 'accuracy' | 'calc'

type Props = {
  /** Single dialog: null = closed. Avoids two stacked modals (stacking / wrong screen on top). */
  step: Step | null
  onAccuracyAccurate: () => void
  onAccuracyNotAccurate: () => void
  onDismiss: () => void
  onCalcBack: () => void
  onCalcApply: (notesAppend: string) => void
}

export function ProbativeDvrFlowModals(props: Props) {
  const open = props.step != null
  const title =
    props.step === 'calc' ? 'DVR time calculator' : 'Probative footage — time check'

  const handleModalClose = useCallback(() => {
    props.onDismiss()
  }, [props.onDismiss])

  return (
    <Modal title={title} open={open} onClose={handleModalClose} zBase={62000}>
      {props.step === 'accuracy' ? (
        <AccuracyStep
          onAccurate={props.onAccuracyAccurate}
          onNotAccurate={props.onAccuracyNotAccurate}
          onCancel={props.onDismiss}
        />
      ) : props.step === 'calc' ? (
        <DvrCalculatorStep
          onBack={props.onCalcBack}
          onCancel={props.onDismiss}
          onApply={props.onCalcApply}
        />
      ) : null}
    </Modal>
  )
}

function AccuracyStep(props: {
  onAccurate: () => void
  onNotAccurate: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, color: '#374151', fontSize: 14, lineHeight: 1.5 }}>
        Was the DVR or recording timestamp <strong>accurate</strong> compared to real time when you reviewed it?
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button type="button" style={btn} onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" style={btnPrimary} onClick={props.onNotAccurate}>
          Not accurate
        </button>
        <button type="button" style={btnPrimary} onClick={props.onAccurate}>
          Accurate
        </button>
      </div>
    </div>
  )
}

export function DvrCalculatorStep(props: {
  onBack: () => void
  onCancel: () => void
  onApply: (notes: string) => void
  /** Wide toolbar embed: hide Back (no wizard step before calculator). */
  toolbarEmbed?: boolean
  /** Web toolbar: DVR time only (no manual offset block). */
  hideManualOffset?: boolean
  /** Override breakpoint-based narrow layout (toolbar vs modal). */
  isNarrowOverride?: boolean
}) {
  const mqNarrow = useMediaQuery(MOBILE_BREAKPOINT_QUERY)
  const isNarrow = props.isNarrowOverride ?? mqNarrow
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  const [manualDir, setManualDir] = useState<'slow' | 'fast'>('slow')
  const [manual, setManual] = useState({ years: 0, months: 0, days: 0, hours: 0, minutes: 0 })
  const [dvrLocal, setDvrLocal] = useState('')
  const [incidentLocal, setIncidentLocal] = useState('')
  const [error, setError] = useState('')
  type ResultPreview = {
    comparison: 'faster' | 'slower' | 'none'
    amountBold: string
    dvrIncidentTimeFirstDate?: string
    notePlain: string
  }
  const [resultPreview, setResultPreview] = useState<null | ResultPreview>(null)

  const deviceNowStr = useMemo(() => formatAppDateTime(nowTick), [nowTick])

  const resetFields = useCallback(() => {
    setManualDir('slow')
    setManual({ years: 0, months: 0, days: 0, hours: 0, minutes: 0 })
    setDvrLocal('')
    setIncidentLocal('')
    setError('')
    setResultPreview(null)
  }, [])

  useEffect(() => {
    resetFields()
  }, [resetFields])

  useEffect(() => {
    setResultPreview(null)
  }, [dvrLocal, incidentLocal, manual, manualDir])

  const dvrParsedMs = useMemo(() => parseDateTimeLocal(dvrLocal), [dvrLocal])
  const incidentParsedMs = useMemo(() => parseDateTimeLocal(incidentLocal), [incidentLocal])
  const incidentInFuture = incidentParsedMs != null && incidentParsedMs > nowTick
  const showManualOffset = !props.hideManualOffset && dvrParsedMs == null

  const computeResult = useCallback((): { ok: true; preview: ResultPreview } | { ok: false; error: string } => {
    const nowMs = Date.now()
    let driftMs: number
    const manualOk = manualOffsetHasInput(manual)
    if (dvrParsedMs != null) {
      driftMs = driftFromClocks(nowMs, dvrParsedMs)
    } else if (manualOk && !props.hideManualOffset) {
      driftMs = composeManualOffset(manual, manualDir)
    } else if (props.hideManualOffset) {
      return { ok: false, error: 'Enter the DVR date and time.' }
    } else {
      return { ok: false, error: 'Enter the DVR date and time, or fill at least one manual offset field.' }
    }

    const abs = Math.abs(driftMs)
    const parts = decomposeAbsMs(abs)
    const breakdown = formatDriftBreakdown(parts)

    const incidentMs = parseDateTimeLocal(incidentLocal)
    if (incidentMs != null && incidentMs > nowMs) {
      return {
        ok: false,
        error:
          "Incident time can't be in the future. It must be at or before the current real-world (device) time.",
      }
    }

    let comparison: ResultPreview['comparison']
    let amountBold: string
    let line1Plain: string

    if (driftMs === 0) {
      comparison = 'none'
      amountBold = ''
      line1Plain = 'DVR is in sync with real time'
    } else if (driftMs < 0) {
      comparison = 'slower'
      amountBold = breakdown
      line1Plain = `DVR is ${breakdown} slower than real time`
    } else {
      comparison = 'faster'
      amountBold = breakdown
      line1Plain = `DVR is ${breakdown} faster than real time`
    }

    let dvrIncidentTimeFirstDate: string | undefined
    let notePlain = line1Plain
    if (incidentMs != null) {
      const dvrSearch = incidentRealToDvrDisplay(incidentMs, driftMs)
      dvrIncidentTimeFirstDate = formatTimeThenDate(dvrSearch)
      notePlain = `${line1Plain}\nDVR incident time: ${dvrIncidentTimeFirstDate}`
    }

    return { ok: true, preview: { comparison, amountBold, dvrIncidentTimeFirstDate, notePlain } }
  }, [dvrParsedMs, incidentLocal, manual, manualDir, props.hideManualOffset])

  const handleCalculate = useCallback(() => {
    setError('')
    const r = computeResult()
    if (!r.ok) {
      setResultPreview(null)
      setError(r.error)
      return
    }
    setResultPreview(r.preview)
  }, [computeResult])

  const handleApply = useCallback(() => {
    setError('')
    const r = computeResult()
    if (!r.ok) {
      setError(r.error)
      return
    }
    const header = '[Probative — DVR time]'
    props.onApply([header, r.preview.notePlain].join('\n\n'))
  }, [props.onApply, computeResult])

  const manualHasInput = manualOffsetHasInput(manual)
  const showCalculate = !(manualHasInput && dvrParsedMs == null)
  const embed = props.toolbarEmbed === true
  const rootGap = embed ? 8 : 16
  const footerBtnPrimary: CSSProperties = embed
    ? { ...btnPrimary, padding: '6px 10px', fontSize: 12, minHeight: 0 }
    : isNarrow
      ? { ...btnPrimary, padding: '8px 6px', fontSize: 12 }
      : btnPrimary
  const footerBtnSecondary: CSSProperties = embed
    ? { ...btn, padding: '6px 10px', fontSize: 12, minHeight: 0 }
    : isNarrow
      ? { ...btn, padding: '8px 6px', fontSize: 12 }
      : btn

  return (
    <div style={{ display: 'grid', gap: rootGap }}>
      <div>
        <div style={label}>Current time</div>
        <div style={{ ...field, color: '#374151', fontWeight: 700 }}>{deviceNowStr}</div>
      </div>

      <DvrSingleDateTimePicker legend="DVR time" value={dvrLocal} onChange={setDvrLocal} isNarrow={isNarrow} />

      <div>
        <DvrSingleDateTimePicker
          legend="Incident time"
          value={incidentLocal}
          onChange={setIncidentLocal}
          isNarrow={isNarrow}
          warn={incidentInFuture}
        />
        {incidentInFuture ? (
          <div
            style={{
              marginTop: embed ? 4 : 6,
              fontSize: embed ? 11 : 12,
              color: '#b91c1c',
              lineHeight: 1.35,
              fontWeight: 600,
            }}
          >
            Incident time can&apos;t be later than real time right now. Use a time at or before the device clock above
            (the subject can&apos;t have been somewhere in the future).
          </div>
        ) : null}
      </div>

      {showManualOffset ? (
        <div
          style={{
            borderTop: '1px solid #e5e7eb',
            borderBottom: '1px solid #e5e7eb',
            padding: embed ? '8px 0' : '12px 0',
            display: 'grid',
            gap: embed ? 8 : 10,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 13 }}>Or enter offset manually</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={manualDir === 'slow'} onChange={() => setManualDir('slow')} />
              Slower than real time
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={manualDir === 'fast'} onChange={() => setManualDir('fast')} />
              Faster than real time
            </label>
          </div>
          <div style={numGrid}>
            {(['minutes', 'hours', 'days', 'months', 'years'] as const).map((k) => (
              <label key={k} style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'capitalize' }}>{k}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={manual[k] === 0 ? '' : manual[k]}
                  onChange={(e) => {
                    const v = e.target.value === '' ? 0 : Math.max(0, Math.floor(Number(e.target.value)))
                    setManual((m) => ({ ...m, [k]: Number.isFinite(v) ? v : 0 }))
                  }}
                  style={field}
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <div style={{ color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>{error}</div> : null}

      {resultPreview ? (
        <div
          style={{
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: embed ? 8 : 12,
            padding: embed ? 8 : 12,
          }}
        >
          <div
            style={{
              fontWeight: 900,
              fontSize: 12,
              marginBottom: embed ? 4 : 8,
              color: '#374151',
            }}
          >
            Result
          </div>
          <div style={{ fontSize: embed ? 12 : 13, lineHeight: embed ? 1.45 : 1.55, color: '#111827' }}>
            {resultPreview.comparison === 'none' ? (
              <div>
                DVR is <strong>in sync</strong> with real time
              </div>
            ) : (
              <div>
                DVR is <strong>{resultPreview.amountBold}</strong>{' '}
                {resultPreview.comparison === 'faster' ? 'faster' : 'slower'} than real time
              </div>
            )}
            {resultPreview.dvrIncidentTimeFirstDate ? (
              <div style={{ marginTop: embed ? 6 : 10 }}>
                DVR incident time: <strong>{resultPreview.dvrIncidentTimeFirstDate}</strong>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
          {showCalculate ? (
            <button
              type="button"
              style={footerBtnPrimary}
              onClick={handleCalculate}
              disabled={incidentInFuture}
            >
              Calculate
            </button>
          ) : null}
          <button
            type="button"
            style={footerBtnPrimary}
            onClick={handleApply}
            disabled={incidentInFuture}
          >
            Save
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!props.toolbarEmbed ? (
            <button type="button" style={footerBtnSecondary} onClick={props.onBack}>
              Back
            </button>
          ) : null}
          <button type="button" style={footerBtnSecondary} onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
