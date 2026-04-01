import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Location, TrackPoint } from '../../lib/types'
import { statusColor } from '../../lib/types'
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

const mapDrawerRemoveBtnStyle: CSSProperties = {
  ...btnDanger,
  fontSize: 11,
  padding: '5px 10px',
  fontWeight: 800,
}

/** Shared chrome for full-web map-edge collapse/expand control. */
const mapPaneEdgeToggleBase: CSSProperties = {
  border: '1px solid #d1d5db',
  background: 'rgba(255,255,255,0.92)',
  color: '#6b7280',
  width: 18,
  height: 38,
  padding: 0,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  borderRadius: '0 9px 9px 0',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

/** Bottom map / notes seam: flat edge on bottom (flush with seam), rounded top into map — same 9px radius language as vertical tab, dimensions swapped vs `mapPaneEdgeToggleBase`. */
const mapPaneEdgeToggleDrawerBottomSeam: CSSProperties = {
  ...mapPaneEdgeToggleBase,
  width: 38,
  height: 18,
  borderRadius: '9px 9px 0 0',
}

/** Wide map notes expanded: flat top flush with map above sheet, rounded bottom into the white panel. */
const mapPaneEdgeToggleDrawerSheetTopSeam: CSSProperties = {
  ...mapPaneEdgeToggleBase,
  width: 38,
  height: 18,
  borderRadius: '0 0 9px 9px',
}

/** Collapse tools: straight edge toward map (`right`), curve into tools column (`left`) — only when tools are expanded. */
const mapPaneEdgeToggleVerticalRailCollapse: CSSProperties = {
  ...mapPaneEdgeToggleBase,
  borderRadius: '9px 0 0 9px',
}

export type MapPaneEdgeTogglePlacement =
  | 'verticalRail'
  | 'drawerTopSeam'
  | 'drawerSheetTopSeam'
  | 'toolbarOverMap'
const mapPaneEdgeAnchorVerticalRail: CSSProperties = {
  position: 'absolute',
  zIndex: 60,
  pointerEvents: 'auto',
  // Pull past the pane edge by the case workspace grid gap so the straight side meets the map column.
  right: 'calc(-1 * clamp(4px, 0.9vw, 10px))',
  top: '50%',
  transform: 'translateY(-50%)',
}
/**
 * Bottom drawer seam: horizontally centered; `translate(-50%, -100%)` so the tab’s flat bottom edge
 * is flush with the map/drawer boundary and the rounded top sits on the map.
 */
const mapPaneEdgeAnchorDrawerTop: CSSProperties = {
  position: 'absolute',
  zIndex: 55,
  pointerEvents: 'auto',
  left: '50%',
  top: 0,
  transform: 'translate(-50%, -100%)',
}
/** Top of expanded notes/track sheet (inside overlay): tab hangs below map seam into the sheet. */
const mapPaneEdgeAnchorDrawerSheetTop: CSSProperties = {
  position: 'absolute',
  zIndex: 55,
  pointerEvents: 'auto',
  left: '50%',
  top: 0,
  transform: 'translateX(-50%)',
}
/** Collapsed map tools: left map edge, vertically centered (mirror of verticalRail but `left` instead of `right`). */
const mapPaneEdgeAnchorToolbarOverMap: CSSProperties = {
  position: 'absolute',
  zIndex: 55,
  pointerEvents: 'auto',
  left: 0,
  top: '50%',
  transform: 'translateY(-50%)',
}

/** Shared edge anchor contract so toggles remain visible regardless of parent overflow behavior. */
export function MapPaneEdgeAnchor(props: {
  placement: MapPaneEdgeTogglePlacement
  children: ReactNode
}) {
  const placementStyle =
    props.placement === 'verticalRail'
      ? mapPaneEdgeAnchorVerticalRail
      : props.placement === 'toolbarOverMap'
        ? mapPaneEdgeAnchorToolbarOverMap
        : props.placement === 'drawerSheetTopSeam'
          ? mapPaneEdgeAnchorDrawerSheetTop
          : mapPaneEdgeAnchorDrawerTop
  return (
    <div style={placementStyle}>
      <div style={{ pointerEvents: 'auto' }}>{props.children}</div>
    </div>
  )
}

/**
 * Universal full-web edge toggle: same chrome for rail + drawer seam; only arrow orientation differs.
 * - verticalRail: › / ‹ (sideways). When expanded (collapse tools), flat edge faces the map (`borderRadius` 9px 0 0 9px); compact expand uses default pill.
 * - drawerTopSeam: compact / bottom seam only — flat bottom, rounded top (38×18).
 * - drawerSheetTopSeam: expanded sheet — flat top toward map, rounded bottom into sheet (38×18); same chevrons as drawerTopSeam.
 * - toolbarOverMap: vertical D-tab (flat edge on the left); › / ‹; left map edge, vertically centered.
 */
export function MapPaneEdgeToggle(props: {
  /** True when the panel/sheet content is open (shows “collapse” arrow). */
  expanded: boolean
  onClick: () => void
  ariaLabel: string
  placement: MapPaneEdgeTogglePlacement
}) {
  const toggleStyle = (() => {
    if (props.placement === 'verticalRail') {
      return props.expanded ? mapPaneEdgeToggleVerticalRailCollapse : mapPaneEdgeToggleBase
    }
    if (props.placement === 'drawerSheetTopSeam') {
      return mapPaneEdgeToggleDrawerSheetTopSeam
    }
    if (props.placement === 'drawerTopSeam') {
      return mapPaneEdgeToggleDrawerBottomSeam
    }
    return mapPaneEdgeToggleBase
  })()

  const drawerChevron = (
    <span
      style={{
        display: 'inline-block',
        lineHeight: 1,
        fontSize: 12,
        transform: props.expanded ? 'rotate(90deg)' : 'rotate(-90deg)',
      }}
      aria-hidden
    >
      ›
    </span>
  )

  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      aria-expanded={props.expanded}
      onClick={props.onClick}
      style={toggleStyle}
    >
      {props.placement === 'verticalRail' || props.placement === 'toolbarOverMap' ? (
        props.expanded ? (
          '‹'
        ) : (
          '›'
        )
      ) : (
        drawerChevron
      )}
    </button>
  )
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
  /** Optional controlled open state for wide map drawer details. */
  detailsOpen?: boolean
  onDetailsOpenChange?: (open: boolean) => void
}) {
  const canEdit = props.canEdit !== false
  const canDelete = props.canDelete !== false
  const wide = props.layout === 'wide'
  /** Wide header label: local draft + debounced persist so each keystroke does not await Supabase. */
  const [inlineLabelDraft, setInlineLabelDraft] = useState(props.point.addressText)
  const inlineLabelFocusRef = useRef(false)
  const inlineLabelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onUpdateRef = useRef(props.onUpdate)
  onUpdateRef.current = props.onUpdate
  const fieldBox: CSSProperties = { ...field, maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }

  useEffect(() => {
    if (inlineLabelDebounceRef.current) {
      clearTimeout(inlineLabelDebounceRef.current)
      inlineLabelDebounceRef.current = null
    }
    inlineLabelFocusRef.current = false
    setInlineLabelDraft(props.point.addressText)
  }, [props.point.id])

  useEffect(() => {
    if (!inlineLabelFocusRef.current) {
      setInlineLabelDraft(props.point.addressText)
    }
  }, [props.point.addressText])

  useEffect(() => {
    return () => {
      if (inlineLabelDebounceRef.current) clearTimeout(inlineLabelDebounceRef.current)
    }
  }, [])

  const flushInlineLabelToStore = useCallback(
    (value: string) => {
      if (!wide || !canEdit) return
      onUpdateRef.current({ addressText: value })
    },
    [wide, canEdit],
  )

  const scheduleInlineLabelPersist = useCallback(
    (value: string) => {
      if (inlineLabelDebounceRef.current) clearTimeout(inlineLabelDebounceRef.current)
      inlineLabelDebounceRef.current = setTimeout(() => {
        inlineLabelDebounceRef.current = null
        flushInlineLabelToStore(value)
      }, 400)
    },
    [flushInlineLabelToStore],
  )

  const stepNameLooksDefault = /^step\s+\d+$/i.test(inlineLabelDraft.trim())
  const inlineStepLabelValue = wide && stepNameLooksDefault ? '' : inlineLabelDraft

  const stepTitleLine = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>
        {props.trackLabel ? `${props.trackLabel} · ` : null}Step {props.stepIndex}
      </span>
      {wide ? (
        <input
          value={inlineStepLabelValue}
          placeholder="Label"
          readOnly={!canEdit}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onFocus={() => {
            inlineLabelFocusRef.current = true
          }}
          onBlur={(e) => {
            inlineLabelFocusRef.current = false
            if (inlineLabelDebounceRef.current) {
              clearTimeout(inlineLabelDebounceRef.current)
              inlineLabelDebounceRef.current = null
            }
            const v = e.currentTarget.value
            setInlineLabelDraft(v)
            flushInlineLabelToStore(v)
          }}
          onChange={(e) => {
            const v = e.target.value
            setInlineLabelDraft(v)
            scheduleInlineLabelPersist(v)
          }}
          aria-label="Step label"
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            background: canEdit ? 'white' : 'transparent',
            padding: '0 6px',
            margin: 0,
            minWidth: 0,
            width: 'clamp(100px, 24vw, 260px)',
            fontSize: 12,
            fontWeight: 800,
            color: '#64748b',
            lineHeight: 1.35,
            cursor: canEdit ? 'text' : 'default',
            boxSizing: 'border-box',
          }}
        />
      ) : null}
    </div>
  )
  const headerCore = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {stepTitleLine}
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
  const collapseWideDetailsBtn = (
    <button
      type="button"
      style={btn}
      onClick={() => props.onDetailsOpenChange?.(false)}
      aria-label="Collapse step details"
    >
      ✕
    </button>
  )

  const wideHeaderOnly = (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 12px 0',
      }}
    >
      {headerCore}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
        {removeStepBtn}
        {collapseWideDetailsBtn}
      </div>
    </div>
  )

  const stackHeaderSticky: CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    background: 'white',
    paddingBottom: 10,
    marginBottom: 4,
    boxShadow: '0 1px 0 #e5e7eb',
  }

  const header = (
    <div style={stackHeaderSticky}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {headerCore}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
          {removeStepBtn}
          <button type="button" style={btn} onClick={props.onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
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
        style={{
          ...fieldBox,
          minHeight: wide ? 44 : 120,
          maxHeight: wide ? 72 : undefined,
          resize: 'vertical',
        }}
        rows={wide ? 2 : undefined}
      />
    </div>
  )

  const openSubjectTimePicker = () => {
    if (!canEdit) return
    const el = document.getElementById(`track-point-time-${props.point.id}`) as
      | (HTMLInputElement & { showPicker?: () => void })
      | null
    if (!el) return
    if (typeof el.showPicker === 'function') {
      el.showPicker()
    } else {
      el.focus()
      el.click()
    }
  }

  const timeBlock = (
    <div>
      <div style={label}>Subject time at this point</div>
      <button
        type="button"
        onClick={openSubjectTimePicker}
        disabled={!canEdit}
        style={{
          ...fieldBox,
          width: 'auto',
          maxWidth: '100%',
          textAlign: 'left',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 999,
          minHeight: 0,
          fontSize: 13,
          lineHeight: 1.2,
          cursor: canEdit ? 'pointer' : 'default',
          color: props.point.visitedAt == null ? '#6b7280' : '#111827',
          fontWeight: props.point.visitedAt == null ? 600 : 700,
        }}
      >
        <span>{props.point.visitedAt == null ? 'Pick date and time' : formatAppDateTime(props.point.visitedAt)}</span>
        <span aria-hidden style={{ opacity: 0.7, fontSize: 12 }}>📅</span>
      </button>
      <input
        id={`track-point-time-${props.point.id}`}
        type="datetime-local"
        step={1}
        value={timestampToDatetimeLocalValue(props.point.visitedAt)}
        readOnly={!canEdit}
        onChange={(e) => {
          const v = parseDatetimeLocalToTimestamp(e.target.value)
          props.onUpdate(v == null ? { visitedAt: null, displayTimeOnMap: false } : { visitedAt: v })
        }}
        style={{
          position: 'absolute',
          opacity: 0,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }}
        tabIndex={-1}
        aria-hidden
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
    if (!(props.detailsOpen ?? false)) {
      return null
    }
    const wideDrawerFrame: CSSProperties = {
      ...card,
      position: 'relative',
      width: 'min(980px, calc(100% - 48px))',
      margin: '0 auto',
      maxHeight: 'min(244px, 30svh)',
      boxSizing: 'border-box',
      padding: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }
    return (
      <div style={wideDrawerFrame}>
        <div style={{ flexShrink: 0, background: 'white' }}>{wideHeaderOnly}</div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            background: 'white',
            borderBottomLeftRadius: 'var(--vc-radius-xl)',
            borderBottomRightRadius: 'var(--vc-radius-xl)',
            padding: '10px 12px 12px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'flex-start',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                flex: '2 1 300px',
                maxWidth: 'min(500px, 100%)',
                minWidth: 0,
                display: 'grid',
                gap: 10,
              }}
            >
              {notesBlock}
            </div>
            <div style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 10 }}>
              {timeBlock}
              {toggles}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={card}>
      {header}
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
  /** Optional controlled open state for wide map drawer details. */
  detailsOpen?: boolean
  onDetailsOpenChange?: (open: boolean) => void
}) {
  const canEdit = props.canEdit !== false
  const canDelete = props.canDelete !== false
  const wide = props.layout === 'wide'
  const ta: CSSProperties = {
    ...field,
    minHeight: wide ? 44 : 'clamp(104px, 26vh, 140px)',
    maxHeight: wide ? 72 : undefined,
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

  const canvassResultsPills = (twoRows: boolean, compact?: boolean) => {
    const wrap: CSSProperties = twoRows
      ? compact
        ? {
            marginTop: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, max-content)',
            gap: 6,
            justifyContent: 'start',
            alignContent: 'start',
          }
        : {
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
    const fw = twoRows && !compact
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
      {wide ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 6,
          }}
        >
          <span style={{ ...label, marginBottom: 0, display: 'inline-block' }}>Notes</span>
          <span
            style={{
              color: '#6b7280',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.3,
              textAlign: 'right',
            }}
          >
            Updated {formatAppDateTime(props.location.updatedAt)}
          </span>
        </div>
      ) : (
        <div style={label}>Notes</div>
      )}
      <textarea
        value={props.location.notes}
        readOnly={!canEdit}
        onChange={(e) => props.onUpdate({ notes: e.target.value })}
        placeholder="What did you observe?"
        rows={wide ? 2 : undefined}
        style={ta}
      />
      {!wide ? (
        <div style={{ marginTop: 'var(--vc-space-md)', color: '#374151', fontSize: 'var(--vc-fs-sm)' }}>
          Updated {formatAppDateTime(props.location.updatedAt)}
        </div>
      ) : null}
    </div>
  )

  const removeAddressBarBtn = canDelete ? (
    <button type="button" style={mapDrawerRemoveBtnStyle} onClick={props.onDelete} aria-label="Remove address from case">
      Remove
    </button>
  ) : null
  const collapseWideDetailsBtn = (
    <button type="button" style={btn} onClick={() => props.onDetailsOpenChange?.(false)} aria-label="Collapse address details">
      ✕
    </button>
  )

  if (wide) {
    if (!(props.detailsOpen ?? false)) {
      return null
    }
    const wideDrawerFrame: CSSProperties = {
      ...card,
      position: 'relative',
      width: 'min(980px, calc(100% - 48px))',
      margin: '0 auto',
      maxHeight: 'min(244px, 30svh)',
      boxSizing: 'border-box',
      padding: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }
    return (
      <div style={wideDrawerFrame}>
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
            padding: '10px 12px 0',
            boxSizing: 'border-box',
            background: 'white',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>{addressOnly}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
            {removeAddressBarBtn}
            {collapseWideDetailsBtn}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            padding: '10px 12px 12px',
            boxSizing: 'border-box',
            background: 'white',
            borderBottomLeftRadius: 'var(--vc-radius-xl)',
            borderBottomRightRadius: 'var(--vc-radius-xl)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
              width: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ flex: '0 0 auto', minWidth: 0 }}>{canvassResultsPills(true, true)}</div>
            <div style={{ flex: '1 1 0', minWidth: 0 }}>{notesOnly}</div>
          </div>
          {buildingBlock ? (
            <div style={{ marginTop: 'var(--vc-space-sm)', width: '100%', minWidth: 0 }}>{buildingBlock}</div>
          ) : null}
        </div>
      </div>
    )
  }

  const stackNotesHeaderSticky: CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    background: 'white',
    paddingBottom: 10,
    marginBottom: 4,
    boxShadow: '0 1px 0 #e5e7eb',
  }

  return (
    <div style={card}>
      <div style={stackNotesHeaderSticky}>{headerRow}</div>
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
