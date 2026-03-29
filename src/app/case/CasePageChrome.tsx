import { useEffect, useState, type CSSProperties } from 'react'
import type { Location, TrackPoint } from '../../lib/types'
import { statusColor } from '../../lib/types'
import { reverseGeocodeAddressText } from '../../lib/geocode'
import { formatAppDateTime, parseDatetimeLocalToTimestamp, timestampToDatetimeLocalValue } from '../../lib/timeFormat'

const btn: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 'var(--vc-radius-sm)',
  padding: 'var(--vc-space-sm) var(--vc-space-md)',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-sm)',
  whiteSpace: 'nowrap',
}

export function viewModeBtn(active: boolean): CSSProperties {
  return {
    ...btn,
    borderColor: active ? '#111827' : '#e5e7eb',
    background: active ? '#111827' : 'white',
    color: active ? 'white' : '#111827',
  }
}

const btnDanger: CSSProperties = {
  ...btn,
  borderColor: '#fecaca',
  background: '#fff1f2',
  color: '#9f1239',
}

const btnPrimary: CSSProperties = {
  ...btn,
  borderColor: '#111827',
  background: '#111827',
  color: 'white',
  fontWeight: 800,
}

export const card: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 'var(--vc-radius-xl)',
  padding: 'var(--vc-space-md)',
  background: 'white',
}

export const mapTopBar: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--vc-space-sm)',
  padding: 'var(--vc-space-sm) var(--vc-space-sm) var(--vc-space-md)',
  borderBottom: '1px solid #e5e7eb',
  background: '#ffffff',
  alignItems: 'center',
  flexWrap: 'wrap',
}

export { btn, btnDanger, btnPrimary }

export const label: CSSProperties = {
  fontSize: 12,
  color: '#111827',
  fontWeight: 800,
  marginBottom: 6,
}

export const field: CSSProperties = {
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'white',
  fontSize: 16,
}

/** Same row footprint as readonly case header; no stacked labels. */
export const caseMetaInlineNameEdit: CSSProperties = {
  margin: 0,
  marginLeft: -4,
  border: '1px solid #e5e7eb',
  borderRadius: 'var(--vc-radius-sm)',
  background: '#fff',
  font: 'inherit',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-control)',
  padding: 'var(--vc-space-sm) var(--vc-space-md)',
  boxSizing: 'border-box',
  flex: 'none',
  maxWidth: '100%',
  minWidth: 0,
  width: '100%',
  minHeight: 44,
  outline: 'none',
}

export const caseMetaInlineDescEdit: CSSProperties = {
  margin: 0,
  marginLeft: -4,
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  background: '#fff',
  font: 'inherit',
  fontSize: 16,
  color: '#111827',
  padding: '8px 10px',
  boxSizing: 'border-box',
  flex: '1 1 0',
  minWidth: 0,
  width: '100%',
  maxWidth: '100%',
  lineHeight: 1.4,
  resize: 'none',
  height: 'auto',
  minHeight: 72,
  maxHeight: 220,
  overflowY: 'auto',
  outline: 'none',
}

export const select: CSSProperties = {
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
  border: '1px solid #e5e7eb',
  borderRadius: 'var(--vc-radius-md)',
  padding: 'var(--vc-space-sm) var(--vc-space-md)',
  background: 'white',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-control)',
}

export const suggestionBtn: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 'var(--vc-radius-md)',
  padding: 'var(--vc-space-sm) var(--vc-space-md)',
  background: '#f9fafb',
  cursor: 'pointer',
  textAlign: 'left',
  fontWeight: 700,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  minWidth: 0,
}

const chip: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 999,
  padding: '6px 10px',
  background: 'white',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const pill: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 999,
  padding: '8px 10px',
  background: 'white',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

/** 3-col row: [spacer][centered arrow][Remove] — keeps arrow visually centered. */
const mapDrawerBarGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  boxSizing: 'border-box',
}

const mapDrawerPeekBar: CSSProperties = {
  ...mapDrawerBarGrid,
  padding: '3px 10px',
  background: 'rgba(255,255,255,0.45)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  borderRadius: 10,
  boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
}

/** Inner bar (expanded): background on sticky parent. */
const mapDrawerExpandedBarInner: CSSProperties = {
  ...mapDrawerBarGrid,
  padding: '4px 10px',
}

/** Stays under map overlay padding; pins arrow+Remove while sheet content scrolls. */
const mapDrawerStickyControls: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 6,
  background: 'rgba(249,250,251,0.97)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderBottom: '1px solid #e5e7eb',
  margin: 0,
}

const mapDrawerPeekArrowBtn: CSSProperties = {
  margin: 0,
  border: 'none',
  background: 'transparent',
  padding: '4px 18px',
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 800,
  color: '#64748b',
  lineHeight: 1,
  letterSpacing: '0.02em',
  borderRadius: 6,
  boxSizing: 'border-box',
}

const mapDrawerCollapseArrowBtn: CSSProperties = {
  margin: 0,
  border: 'none',
  background: 'transparent',
  padding: '6px 22px',
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 800,
  color: '#64748b',
  lineHeight: 1,
  letterSpacing: '0.02em',
  borderRadius: 6,
  boxSizing: 'border-box',
}

const mapDrawerRemoveBtnStyle: CSSProperties = {
  ...btnDanger,
  fontSize: 11,
  padding: '5px 10px',
  fontWeight: 800,
}

export const listHeaderRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 14px',
}

export const listRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 12,
  alignItems: 'center',
  padding: '12px 14px',
  borderBottom: '1px solid #f3f4f6',
}

export const listRowMainBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  textAlign: 'left',
  cursor: 'pointer',
}

const rowStatusBtn: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 999,
  padding: 'var(--vc-space-xs) var(--vc-space-sm)',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-xs)',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

export const statusBadge: CSSProperties = {
  padding: 'var(--vc-space-2xs) var(--vc-space-sm)',
  borderRadius: 999,
  fontSize: 'var(--vc-fs-xs)',
  fontWeight: 800,
}

/** Case header: full-width title (up to right chrome), smaller description stacked below (2 lines max each). */
export const caseHeaderReadonlyTitle: CSSProperties = {
  margin: 0,
  padding: '2px 4px',
  marginLeft: -4,
  border: 'none',
  background: 'none',
  font: 'inherit',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-md)',
  textAlign: 'left',
  cursor: 'pointer',
  color: 'inherit',
  borderRadius: 'var(--vc-radius-sm)',
  flex: 'none',
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
  lineHeight: 1.25,
  whiteSpace: 'normal',
  overflow: 'hidden',
  wordBreak: 'break-word',
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
}

export const caseHeaderReadonlyDesc: CSSProperties = {
  margin: 0,
  padding: '2px 4px',
  marginLeft: -4,
  border: 'none',
  background: 'none',
  font: 'inherit',
  fontWeight: 500,
  fontSize: 'var(--vc-fs-sm)',
  color: '#6b7280',
  textAlign: 'left',
  cursor: 'pointer',
  borderRadius: 'var(--vc-radius-sm)',
  flex: 'none',
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
  lineHeight: 1.3,
  whiteSpace: 'normal',
  overflow: 'hidden',
  wordBreak: 'break-word',
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
}

export function LegendChip(props: {
  label: string
  color: string
  on: boolean
  onToggle: () => void
  /** Compact pill for one-line filter rows (list view). */
  dense?: boolean
  /** Allow label to wrap in narrow tool panels. */
  allowMultiline?: boolean
  /** Tighter two-column pills for the narrow map tool dock. */
  dockCompact?: boolean
}) {
  const dense = props.dense === true
  const multiline = props.allowMultiline === true
  const dockCompact = props.dockCompact === true
  return (
    <button
      type="button"
      onClick={props.onToggle}
      title={props.label}
      style={{
        ...chip,
        width: dense && !dockCompact ? 'auto' : '100%',
        flex: dense && !dockCompact ? '0 0 auto' : undefined,
        minWidth: dense && !dockCompact ? undefined : 0,
        maxWidth: dense && !dockCompact ? 'none' : '100%',
        boxSizing: 'border-box',
        justifyContent: 'flex-start',
        alignItems: multiline || dockCompact ? 'flex-start' : 'center',
        opacity: props.on ? 1 : 0.55,
        background: props.on ? '#f9fafb' : 'transparent',
        whiteSpace: multiline || dockCompact ? 'normal' : 'nowrap',
        padding: dockCompact ? '5px 6px' : dense ? '6px 10px' : chip.padding,
        gap: dockCompact ? 5 : dense ? 6 : chip.gap,
      }}
    >
      <span
        style={{
          width: dockCompact ? 7 : 10,
          height: dockCompact ? 7 : 10,
          borderRadius: 999,
          background: props.color,
          flexShrink: 0,
          display: 'inline-block',
          marginTop: multiline || dockCompact ? 2 : undefined,
        }}
      />
      <span
        style={{
          fontWeight: 900,
          fontSize: multiline ? 11 : dockCompact ? 10 : 12,
          lineHeight: dockCompact ? 1.2 : 1.25,
          wordBreak: multiline || dockCompact ? 'break-word' : undefined,
          overflowWrap: multiline || dockCompact ? 'anywhere' : undefined,
          minWidth: 0,
          textAlign: 'left',
        }}
      >
        {props.label}
      </span>
    </button>
  )
}

export function TrackPointDrawer(props: {
  layout?: 'stack' | 'wide'
  point: TrackPoint
  /** Subject track name shown in the header before the step number. */
  trackLabel: string
  stepIndex: number
  canEdit?: boolean
  canDelete?: boolean
  onClose: () => void
  onUpdate: (
    patch: Partial<Pick<TrackPoint, 'addressText' | 'visitedAt' | 'notes' | 'displayTimeOnMap'>>,
  ) => void
  onDelete: () => void
}) {
  const canEdit = props.canEdit !== false
  const canDelete = props.canDelete !== false
  const wide = props.layout === 'wide'
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [mapAddressLine, setMapAddressLine] = useState<string | null>(null)
  const [mapAddressLoading, setMapAddressLoading] = useState(true)
  const fieldBox: CSSProperties = { ...field, maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }

  const { lat: stepLat, lon: stepLon } = props.point
  useEffect(() => {
    const ac = new AbortController()
    setMapAddressLoading(true)
    setMapAddressLine(null)
    void reverseGeocodeAddressText(stepLat, stepLon, ac.signal)
      .then((t) => {
        if (ac.signal.aborted) return
        setMapAddressLine(t)
      })
      .catch(() => {
        if (ac.signal.aborted) return
        setMapAddressLine(null)
      })
      .finally(() => {
        if (ac.signal.aborted) return
        setMapAddressLoading(false)
      })
    return () => ac.abort()
  }, [stepLat, stepLon])

  const coordFallback = `${stepLat.toFixed(6)}, ${stepLon.toFixed(6)}`
  const mapAddressDisplay = mapAddressLoading
    ? 'Looking up address…'
    : (mapAddressLine?.trim() || coordFallback)

  const stepTitleLine = (
    <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>
      {props.trackLabel ? `${props.trackLabel} · ` : null}Step {props.stepIndex}
    </div>
  )
  const stepAddressLine = (
    <div
      style={{
        fontSize: 11,
        color: mapAddressLoading ? '#9ca3af' : '#64748b',
        marginTop: 4,
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      Address from coordinates: {mapAddressDisplay}
    </div>
  )

  const headerCore = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {stepTitleLine}
      {stepAddressLine}
    </div>
  )

  const removeStepBtn = canDelete ? (
    <button
      type="button"
      style={mapDrawerRemoveBtnStyle}
      onClick={props.onDelete}
      aria-label="Remove this step"
    >
      Remove
    </button>
  ) : null

  const wideHeaderOnly = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%', boxSizing: 'border-box', padding: '12px 14px 0' }}>
      {headerCore}
    </div>
  )

  const header = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {headerCore}
      <button type="button" style={btn} onClick={props.onClose} aria-label="Close">
        ✕
      </button>
    </div>
  )

  const labelBlock = (
    <div>
      <div style={label}>Label</div>
      <input
        value={props.point.addressText}
        readOnly={!canEdit}
        onChange={(e) => props.onUpdate({ addressText: e.target.value })}
        style={fieldBox}
      />
      {canDelete && !wide ? (
        <div style={{ marginTop: 10 }}>
          <button type="button" style={btnDanger} onClick={props.onDelete}>
            Delete step
          </button>
        </div>
      ) : null}
    </div>
  )

  const notesBlock = (
    <div>
      <div style={label}>Notes</div>
      <textarea
        value={props.point.notes ?? ''}
        readOnly={!canEdit}
        onChange={(e) => props.onUpdate({ notes: e.target.value })}
        placeholder="What happened here?"
        style={{ ...fieldBox, minHeight: wide ? 80 : 120, resize: 'vertical' }}
      />
    </div>
  )

  const timeBlock = (
    <div>
      <div style={label}>Subject time at this point</div>
      <input
        type="datetime-local"
        step={1}
        value={timestampToDatetimeLocalValue(props.point.visitedAt)}
        readOnly={!canEdit}
        onChange={(e) => {
          const v = parseDatetimeLocalToTimestamp(e.target.value)
          props.onUpdate(v == null ? { visitedAt: null, displayTimeOnMap: false } : { visitedAt: v })
        }}
        style={fieldBox}
      />
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
        Optional. When the subject was here per your investigation—not filled in automatically.
      </div>
    </div>
  )

  const toggles = (
    <>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: wide ? 0 : 12, cursor: 'pointer', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={props.point.displayTimeOnMap === true}
          disabled={!canEdit || props.point.visitedAt == null}
          onChange={(e) => props.onUpdate({ displayTimeOnMap: e.target.checked })}
        />
        <span>Show time on map next to pin {props.point.visitedAt == null ? '(set a time first)' : ''}</span>
      </label>
    </>
  )

  if (wide) {
    if (!detailsOpen) {
      return (
        <div style={mapDrawerPeekBar}>
          <div />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              style={mapDrawerPeekArrowBtn}
              onClick={() => setDetailsOpen(true)}
              aria-label="Expand step details"
            >
              ▲
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
            {removeStepBtn}
          </div>
        </div>
      )
    }
    return (
      <div style={{ ...card, width: '100%', boxSizing: 'border-box', padding: 0, overflow: 'visible' }}>
        <div style={mapDrawerStickyControls}>
          <div style={mapDrawerExpandedBarInner}>
            <div />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                style={mapDrawerCollapseArrowBtn}
                onClick={() => setDetailsOpen(false)}
                aria-expanded
                aria-label="Collapse step details"
              >
                ▼
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
              {removeStepBtn}
            </div>
          </div>
        </div>
        {wideHeaderOnly}
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'flex-start',
            padding: '0 14px 14px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 12 }}>{labelBlock}</div>
          <div style={{ flex: '2 1 280px', minWidth: 0, display: 'grid', gap: 12 }}>{notesBlock}</div>
          <div style={{ flex: '1 1 240px', minWidth: 0, display: 'grid', gap: 12 }}>
            {timeBlock}
            {toggles}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={card}>
      {header}
      <div style={{ marginTop: 10 }}>{labelBlock}</div>
      <div style={{ marginTop: 10 }}>{notesBlock}</div>
      <div style={{ marginTop: 10 }}>{timeBlock}</div>
      <div style={{ marginTop: 0 }}>{toggles}</div>
    </div>
  )
}

export function LocationDrawer(props: {
  layout?: 'stack' | 'wide'
  location: Location
  buildingOutlineLoading: boolean
  buildingOutlineFailed: boolean
  /** When false, status and notes are read-only and delete is hidden. */
  canEdit?: boolean
  canDelete?: boolean
  onClose: () => void
  onUpdate: (patch: Partial<Pick<Location, 'status' | 'notes'>>) => void
  /** When set, choosing Probative (from another status) runs the DVR time flow instead of an immediate update. */
  onProbativeRequest?: () => void
  onDelete: () => void
}) {
  const canEdit = props.canEdit !== false
  const canDelete = props.canDelete !== false
  const wide = props.layout === 'wide'
  const [addressDetailsOpen, setAddressDetailsOpen] = useState(false)
  const ta: CSSProperties = {
    ...field,
    minHeight: wide ? 'clamp(88px, 22vh, 120px)' : 'clamp(104px, 26vh, 140px)',
    resize: 'vertical',
    maxWidth: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  }

  const addressOnly = (
    <div style={{ fontWeight: 900, fontSize: 'var(--vc-fs-md)', lineHeight: 1.2, minWidth: 0 }}>{props.location.addressText}</div>
  )

  const headerRow = (
    <div style={{ display: 'flex', gap: 'var(--vc-space-md)', alignItems: 'start' }}>
      <div style={{ fontWeight: 900, fontSize: 'var(--vc-fs-md)', lineHeight: 1.2, flex: 1, minWidth: 0 }}>{props.location.addressText}</div>
      <button type="button" style={btn} onClick={props.onClose} aria-label="Close">
        ✕
      </button>
    </div>
  )

  const canvassResultsPills = (twoRows: boolean) => {
    const wrap: CSSProperties = twoRows
      ? {
          marginTop: 'var(--vc-space-md)',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--vc-space-sm)',
        }
      : {
          marginTop: 'var(--vc-space-md)',
          display: 'flex',
          gap: 'var(--vc-space-sm)',
          flexWrap: 'wrap',
        }
    const fw = twoRows
    return (
      <div style={wrap}>
        <StatusPill
          label="No cameras"
          color={statusColor('noCameras')}
          active={props.location.status === 'noCameras'}
          disabled={!canEdit}
          fullWidth={fw}
          onClick={() => props.onUpdate({ status: 'noCameras' })}
        />
        <StatusPill
          label="Needs Follow up"
          color={statusColor('camerasNoAnswer')}
          active={props.location.status === 'camerasNoAnswer'}
          disabled={!canEdit}
          fullWidth={fw}
          onClick={() => props.onUpdate({ status: 'camerasNoAnswer' })}
        />
        <StatusPill
          label="Not probative"
          color={statusColor('notProbativeFootage')}
          active={props.location.status === 'notProbativeFootage'}
          disabled={!canEdit}
          fullWidth={fw}
          onClick={() => props.onUpdate({ status: 'notProbativeFootage' })}
        />
        <StatusPill
          label="Probative"
          color={statusColor('probativeFootage')}
          active={props.location.status === 'probativeFootage'}
          disabled={!canEdit}
          fullWidth={fw}
          onClick={() => {
            if (props.location.status !== 'probativeFootage' && props.onProbativeRequest) {
              props.onProbativeRequest()
              return
            }
            props.onUpdate({ status: 'probativeFootage' })
          }}
        />
      </div>
    )
  }

  const buildingBlock =
    props.buildingOutlineLoading ? (
      <div style={{ marginTop: 'var(--vc-space-md)', color: '#374151', fontSize: 'var(--vc-fs-sm)', fontWeight: 800 }}>
        Loading building outline in background...
      </div>
    ) : props.buildingOutlineFailed ? (
      <div style={{ marginTop: 'var(--vc-space-md)', color: '#374151', fontSize: 'var(--vc-fs-sm)', fontWeight: 800 }}>
        Building outline unavailable for this point (status and notes still save normally).
      </div>
    ) : null

  const deleteAddressBtn = canDelete ? (
    <div style={{ marginTop: 'var(--vc-space-md)' }}>
      <button type="button" style={btnDanger} onClick={props.onDelete}>
        Delete address
      </button>
    </div>
  ) : null

  const notesOnly = (
    <div style={{ marginTop: wide ? 0 : 'var(--vc-space-md)' }}>
      <div style={label}>Notes</div>
      <textarea
        value={props.location.notes}
        readOnly={!canEdit}
        onChange={(e) => props.onUpdate({ notes: e.target.value })}
        placeholder="What did you observe?"
        style={ta}
      />
      <div style={{ marginTop: 'var(--vc-space-md)', color: '#374151', fontSize: 'var(--vc-fs-sm)' }}>
        Updated {formatAppDateTime(props.location.updatedAt)}
      </div>
    </div>
  )

  const removeAddressBarBtn = canDelete ? (
    <button type="button" style={mapDrawerRemoveBtnStyle} onClick={props.onDelete} aria-label="Remove address from case">
      Remove
    </button>
  ) : null

  if (wide) {
    if (!addressDetailsOpen) {
      return (
        <div style={mapDrawerPeekBar}>
          <div />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              style={mapDrawerPeekArrowBtn}
              onClick={() => setAddressDetailsOpen(true)}
              aria-label="Expand address details"
            >
              ▲
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
            {removeAddressBarBtn}
          </div>
        </div>
      )
    }
    return (
      <div style={{ ...card, position: 'relative', width: '100%', boxSizing: 'border-box', padding: 0, overflow: 'visible' }}>
        <div style={mapDrawerStickyControls}>
          <div style={mapDrawerExpandedBarInner}>
            <div />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                style={mapDrawerCollapseArrowBtn}
                onClick={() => setAddressDetailsOpen(false)}
                aria-expanded
                aria-label="Collapse address details"
              >
                ▼
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
              {removeAddressBarBtn}
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 14px 14px', boxSizing: 'border-box' }}>
          {addressOnly}
          {canvassResultsPills(true)}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--vc-space-lg)',
              alignItems: 'flex-start',
              marginTop: 'var(--vc-space-md)',
            }}
          >
            <div style={{ flex: '2 1 min(300px, 100%)', minWidth: 0 }}>
              {buildingBlock}
            </div>
            <div style={{ flex: '1 1 min(260px, 100%)', minWidth: 0 }}>{notesOnly}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={card}>
      {headerRow}
      {canvassResultsPills(false)}
      {buildingBlock}
      {deleteAddressBtn}
      {notesOnly}
    </div>
  )
}

function StatusPill(props: {
  label: string
  color: string
  active: boolean
  disabled?: boolean
  onClick: () => void
  /** Use in 2×2 grid so canvass results fit in two rows on the map drawer. */
  fullWidth?: boolean
}) {
  const fw = props.fullWidth === true
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        ...pill,
        width: fw ? '100%' : undefined,
        boxSizing: 'border-box',
        justifyContent: fw ? 'flex-start' : undefined,
        opacity: props.disabled ? 0.5 : 1,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        borderColor: props.active ? props.color : '#e5e7eb',
        background: props.active ? `${props.color}33` : 'white',
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: props.color, display: 'inline-block' }} />
      <span style={{ fontWeight: 900, fontSize: 'var(--vc-fs-sm)' }}>{props.label}</span>
    </button>
  )
}

export function RowStatusButton(props: {
  label: string
  color: string
  active: boolean
  disabled?: boolean
  onClick: () => void
  /** Fill grid cell so list canvass results stay in two rows. */
  stretch?: boolean
}) {
  const st = props.stretch === true
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        ...rowStatusBtn,
        width: st ? '100%' : undefined,
        boxSizing: 'border-box',
        opacity: props.disabled ? 0.5 : 1,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        borderColor: props.active ? props.color : '#e5e7eb',
        background: props.active ? `${props.color}33` : 'white',
      }}
    >
      {props.label}
    </button>
  )
}
