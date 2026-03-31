import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
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

/** Inline DVR calculator (e.g. web map-tools rail). Same UI as the modal calculator step. */
export function DvrCalculatorPanel(props: { onBack: () => void; onCancel: () => void; onApply: (notes: string) => void }) {
  return (
    <CalculatorStep onBack={props.onBack} onCancel={props.onCancel} onApply={props.onApply} />
  )
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
        <CalculatorStep
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

function CalculatorStep(props: { onBack: () => void; onCancel: () => void; onApply: (notes: string) => void }) {
  const isNarrow = useMediaQuery(MOBILE_BREAKPOINT_QUERY)
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
  const showManualOffset = dvrParsedMs == null

  const computeResult = useCallback((): { ok: true; preview: ResultPreview } | { ok: false; error: string } => {
    const nowMs = Date.now()
    let driftMs: number
    const manualOk = manualOffsetHasInput(manual)
    if (dvrParsedMs != null) {
      driftMs = driftFromClocks(nowMs, dvrParsedMs)
    } else if (manualOk) {
      driftMs = composeManualOffset(manual, manualDir)
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
  }, [dvrParsedMs, incidentLocal, manual, manualDir])

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

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <div style={label}>Current time</div>
        <div style={{ ...field, color: '#374151', fontWeight: 700 }}>{deviceNowStr}</div>
      </div>

      <div>
        <div style={label}>DVR time</div>
        <input
          type="datetime-local"
          step={1}
          value={dvrLocal}
          onChange={(e) => setDvrLocal(e.target.value)}
          style={field}
        />
      </div>

      <div>
        <div style={label}>Incident time</div>
        <input
          type="datetime-local"
          step={1}
          value={incidentLocal}
          onChange={(e) => setIncidentLocal(e.target.value)}
          style={{
            ...field,
            ...(incidentInFuture
              ? { borderColor: '#dc2626', boxShadow: '0 0 0 1px #dc2626', background: '#fef2f2' }
              : {}),
          }}
          aria-invalid={incidentInFuture}
        />
        {incidentInFuture ? (
          <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c', lineHeight: 1.4, fontWeight: 600 }}>
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
            padding: '12px 0',
            display: 'grid',
            gap: 10,
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
            {(['years', 'months', 'days', 'hours', 'minutes'] as const).map((k) => (
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
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 8, color: '#374151' }}>Result</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: '#111827' }}>
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
              <div style={{ marginTop: 10 }}>
                DVR incident time: <strong>{resultPreview.dvrIncidentTimeFirstDate}</strong>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          gap: isNarrow ? 6 : 10,
          flexWrap: isNarrow ? 'nowrap' : 'wrap',
          justifyContent: isNarrow ? 'stretch' : 'flex-end',
          overflowX: isNarrow ? 'auto' : undefined,
          WebkitOverflowScrolling: isNarrow ? 'touch' : undefined,
        }}
      >
        {showCalculate ? (
          <button
            type="button"
            style={
              isNarrow
                ? {
                    ...btnPrimary,
                    flex: '1 1 0',
                    minWidth: 0,
                    padding: '8px 6px',
                    fontSize: 12,
                  }
                : btnPrimary
            }
            onClick={handleCalculate}
            disabled={incidentInFuture}
          >
            Calculate
          </button>
        ) : null}
        <button
          type="button"
          style={
            isNarrow
              ? { ...btn, flex: '1 1 0', minWidth: 0, padding: '8px 6px', fontSize: 12 }
              : btn
          }
          onClick={props.onBack}
        >
          Back
        </button>
        <button
          type="button"
          style={
            isNarrow
              ? { ...btn, flex: '1 1 0', minWidth: 0, padding: '8px 6px', fontSize: 12 }
              : btn
          }
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          style={
            isNarrow
              ? {
                  ...btnPrimary,
                  flex: '1 1 0',
                  minWidth: 0,
                  padding: '8px 6px',
                  fontSize: 12,
                }
              : btnPrimary
          }
          onClick={handleApply}
          disabled={incidentInFuture}
        >
          Save
        </button>
      </div>
    </div>
  )
}
