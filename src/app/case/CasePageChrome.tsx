import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Location, TrackPoint } from '../../lib/types'
import { statusColor } from '../../lib/types'
import { formatAppDateTime, parseDatetimeLocalToTimestamp, timestampToDatetimeLocalValue } from '../../lib/timeFormat'
import { DvrSingleDateTimePicker } from '../ProbativeDvrFlow'
import { formatAddressLineForMapList } from '../casePageHelpers'
import {
  vcGlassBtnPrimary,
  vcGlassBtnSecondary,
  vcGlassFgDarkReadable,
  vcGlassFgOnPanel,
  vcGlassFieldOnContentSurface,
  vcLiquidGlassInnerSurface,
  vcLiquidGlassPanel,
  vcLiquidGlassPanelDense,
} from '../../lib/vcLiquidGlass'

const btn: CSSProperties = {
  ...vcGlassBtnSecondary,
  borderRadius: 'var(--vc-radius-sm)',
  padding: 'var(--vc-space-sm) var(--vc-space-md)',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-sm)',
  whiteSpace: 'nowrap',
}

export function viewModeBtn(active: boolean): CSSProperties {
  return {
    ...btn,
    borderColor: active ? '#111827' : 'rgba(148, 163, 184, 0.45)',
    background: active ? '#111827' : 'rgba(226, 232, 240, 0.45)',
    color: active ? '#f8fafc' : '#111827',
  }
}

const btnDanger: CSSProperties = {
  ...btn,
  borderColor: '#fecaca',
  background: '#fff1f2',
  color: '#9f1239',
}

const btnPrimary: CSSProperties = {
  ...vcGlassBtnPrimary,
  borderRadius: 'var(--vc-radius-sm)',
  padding: 'var(--vc-space-sm) var(--vc-space-md)',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-sm)',
  whiteSpace: 'nowrap',
}

export const card: CSSProperties = {
  ...vcLiquidGlassInnerSurface,
  borderRadius: 'var(--vc-radius-xl)',
  padding: 'var(--vc-space-md)',
  color: vcGlassFgDarkReadable,
}

export const mapTopBar: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--vc-space-sm)',
  padding: 'var(--vc-space-sm) var(--vc-space-sm) var(--vc-space-md)',
  ...vcLiquidGlassPanel,
  borderRadius: 0,
  border: 'none',
  borderBottom: '1px solid rgba(255,255,255,0.14)',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
  color: vcGlassFgOnPanel,
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
  ...vcGlassFieldOnContentSurface,
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 16,
}

/** Same row footprint as readonly case header; no stacked labels. */
export const caseMetaInlineNameEdit: CSSProperties = {
  margin: 0,
  marginLeft: -4,
  border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 'var(--vc-radius-sm)',
  background: 'rgba(226, 232, 240, 0.88)',
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
  color: vcGlassFgDarkReadable,
}

export const caseMetaInlineDescEdit: CSSProperties = {
  margin: 0,
  marginLeft: -4,
  border: '1px solid rgba(255,255,255,0.35)',
  borderRadius: 8,
  background: 'rgba(226, 232, 240, 0.88)',
  font: 'inherit',
  fontSize: 16,
  color: vcGlassFgDarkReadable,
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
  ...vcGlassFieldOnContentSurface,
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
  borderRadius: 'var(--vc-radius-md)',
  padding: 'var(--vc-space-sm) var(--vc-space-md)',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-control)',
}

export const suggestionBtn: CSSProperties = {
  border: '1px solid rgba(15, 23, 42, 0.1)',
  borderRadius: 'var(--vc-radius-md)',
  padding: 'var(--vc-space-sm) var(--vc-space-md)',
  background: 'rgba(226, 232, 240, 0.55)',
  color: vcGlassFgDarkReadable,
  cursor: 'pointer',
  textAlign: 'left',
  fontWeight: 700,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
  minWidth: 0,
}

const chip: CSSProperties = {
  border: '1px solid rgba(15, 23, 42, 0.1)',
  borderRadius: 999,
  padding: '6px 10px',
  background: 'rgba(226, 232, 240, 0.55)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const pill: CSSProperties = {
  border: '1px solid rgba(15, 23, 42, 0.1)',
  borderRadius: 999,
  padding: '8px 10px',
  background: 'rgba(226, 232, 240, 0.55)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

export const mapDrawerRemoveBtnStyle: CSSProperties = {
  ...btnDanger,
  fontSize: 11,
  padding: '5px 10px',
  fontWeight: 800,
}

/** Shared chrome for full-web map-edge collapse/expand control. */
const mapPaneEdgeToggleBase: CSSProperties = {
  border: '1px solid rgba(148, 163, 184, 0.55)',
  background: 'rgba(226, 232, 240, 0.78)',
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
    let s: CSSProperties
    if (props.placement === 'verticalRail') {
      s = props.expanded ? mapPaneEdgeToggleVerticalRailCollapse : mapPaneEdgeToggleBase
    } else if (props.placement === 'drawerSheetTopSeam') {
      s = mapPaneEdgeToggleDrawerSheetTopSeam
    } else if (props.placement === 'drawerTopSeam') {
      s = mapPaneEdgeToggleDrawerBottomSeam
    } else {
      s = mapPaneEdgeToggleBase
    }
    if (props.placement === 'verticalRail' || props.placement === 'toolbarOverMap') {
      return {
        ...s,
        ...vcLiquidGlassPanelDense,
        color: vcGlassFgOnPanel,
      }
    }
    return s
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
  borderBottom: '1px solid rgba(15, 23, 42, 0.06)',
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
  border: '1px solid rgba(15, 23, 42, 0.1)',
  borderRadius: 999,
  padding: 'var(--vc-space-xs) var(--vc-space-sm)',
  background: 'rgba(226, 232, 240, 0.6)',
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
  color: vcGlassFgOnPanel,
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
  color: 'rgba(226, 232, 240, 0.82)',
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
  /** Map detail modal body only (no card chrome / wide drawer). */
  embedInModal?: boolean
}) {
  const canEdit = props.canEdit !== false
  const canDelete = props.canDelete !== false
  const embedInModal = props.embedInModal === true
  const wide = props.layout === 'wide' && !embedInModal
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
  const wideStepLabelShown =
    canEdit ? inlineStepLabelValue : formatAddressLineForMapList(inlineStepLabelValue)

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
          value={wideStepLabelShown}
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
            background: canEdit ? 'rgba(226, 232, 240, 0.65)' : 'transparent',
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
    background: 'rgba(241, 245, 249, 0.92)',
    paddingBottom: 10,
    marginBottom: 4,
    boxShadow: '0 1px 0 rgba(148, 163, 184, 0.35)',
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

  const timeBlock = (
    <div>
      {canEdit ? (
        <DvrSingleDateTimePicker
          legend="Subject time at this point"
          legendHint="Optional"
          value={timestampToDatetimeLocalValue(props.point.visitedAt)}
          onChange={(s) => {
            const v = parseDatetimeLocalToTimestamp(s)
            props.onUpdate(v == null ? { visitedAt: null, displayTimeOnMap: false } : { visitedAt: v })
          }}
          isNarrow={!wide}
          clearable
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 12, color: '#111827', fontWeight: 800 }}>Subject time at this point</span>
            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>Optional</span>
          </div>
          <div style={{ ...fieldBox, fontSize: 13, color: props.point.visitedAt == null ? '#6b7280' : '#111827' }}>
            {props.point.visitedAt == null ? '—' : formatAppDateTime(props.point.visitedAt)}
          </div>
        </>
      )}
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

  if (embedInModal) {
    return (
      <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        <div>
          <div style={label}>Notes</div>
          <textarea
            value={props.point.notes ?? ''}
            readOnly={!canEdit}
            onChange={(e) => props.onUpdate({ notes: e.target.value })}
            placeholder="What happened here?"
            style={{
              ...fieldBox,
              minHeight: 120,
              resize: 'vertical',
            }}
          />
        </div>
        {timeBlock}
        {toggles}
      </div>
    )
  }

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
        <div style={{ flexShrink: 0, background: 'rgba(241, 245, 249, 0.88)' }}>{wideHeaderOnly}</div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            background: 'rgba(241, 245, 249, 0.88)',
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
  /** Map detail modal body only (no card chrome / wide drawer). */
  embedInModal?: boolean
}) {
  const canEdit = props.canEdit !== false
  const canDelete = props.canDelete !== false
  const embedInModal = props.embedInModal === true
  const wide = props.layout === 'wide' && !embedInModal
  const ta: CSSProperties = {
    ...field,
    minHeight: wide ? 44 : 'clamp(104px, 26vh, 140px)',
    maxHeight: wide ? 72 : undefined,
    resize: 'vertical',
    maxWidth: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
  }

  const addressDisplay = formatAddressLineForMapList(props.location.addressText)

  const addressOnly = (
    <div style={{ fontWeight: 900, fontSize: 'var(--vc-fs-md)', lineHeight: 1.2, minWidth: 0 }}>{addressDisplay}</div>
  )

  const headerRow = (
    <div style={{ display: 'flex', gap: 'var(--vc-space-md)', alignItems: 'start' }}>
      <div style={{ fontWeight: 900, fontSize: 'var(--vc-fs-md)', lineHeight: 1.2, flex: 1, minWidth: 0 }}>{addressDisplay}</div>
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

  if (embedInModal) {
    return (
      <div style={{ display: 'grid', gap: 'var(--vc-space-md)', minWidth: 0 }}>
        {canvassResultsPills(false)}
        {buildingBlock}
        <div>
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
        {deleteAddressBtn}
      </div>
    )
  }

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
            background: 'rgba(241, 245, 249, 0.88)',
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
            background: 'rgba(241, 245, 249, 0.88)',
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
    background: 'rgba(241, 245, 249, 0.92)',
    paddingBottom: 10,
    marginBottom: 4,
    boxShadow: '0 1px 0 rgba(148, 163, 184, 0.35)',
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
        borderColor: props.active ? props.color : 'rgba(148, 163, 184, 0.45)',
        background: props.active ? `${props.color}33` : 'rgba(226, 232, 240, 0.55)',
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
        borderColor: props.active ? props.color : 'rgba(148, 163, 184, 0.45)',
        background: props.active ? `${props.color}33` : 'rgba(226, 232, 240, 0.55)',
      }}
    >
      {props.label}
    </button>
  )
}
