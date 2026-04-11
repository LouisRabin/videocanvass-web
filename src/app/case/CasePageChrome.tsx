import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { Location, TrackPoint } from '../../lib/types'
import { statusColor, statusLabel } from '../../lib/types'
import { formatAppDateTime, parseDatetimeLocalToTimestamp, timestampToDatetimeLocalValue } from '../../lib/timeFormat'
import { DvrSingleDateTimePicker } from '../ProbativeDvrFlow'
import { formatAddressLineForMapList, formatLatLonForStepUi } from '../casePageHelpers'
import {
  vcGlassBtnPrimary,
  vcGlassBtnSecondary,
  vcGlassFgDarkReadable,
  vcGlassFgOnPanel,
  vcGlassFieldOnContentSurface,
  vcLiquidGlassInnerSurface,
} from '../../lib/vcLiquidGlass'

const btn: CSSProperties = {
  ...vcGlassBtnSecondary,
  borderRadius: 'var(--vc-radius-sm)',
  padding: 'var(--vc-space-sm) var(--vc-space-md)',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-sm)',
  whiteSpace: 'nowrap',
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
  marginLeft: 0,
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
  textAlign: 'center',
}

export const caseMetaInlineDescEdit: CSSProperties = {
  margin: 0,
  marginLeft: 0,
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
  textAlign: 'center',
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
  marginLeft: 0,
  border: 'none',
  background: 'none',
  font: 'inherit',
  fontWeight: 800,
  fontSize: 'var(--vc-fs-md)',
  textAlign: 'center',
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
  marginLeft: 0,
  border: 'none',
  background: 'none',
  font: 'inherit',
  fontWeight: 500,
  fontSize: 'var(--vc-fs-sm)',
  color: 'rgba(226, 232, 240, 0.82)',
  textAlign: 'center',
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

/**
 * Status filter chips: two equal columns (or one when `columnCount` is 1) sized so every chip is at least as
 * wide as the widest chip’s content — avoids truncating long labels like “Probative Footage”.
 */
export function UniformFilterChipGrid(props: {
  children: ReactNode
  columnCount?: 1 | 2
  /** Include anything that changes chip text width (e.g. counts). */
  measureKey: string
  id?: string
  role?: string
  'aria-label'?: string
}) {
  const columnCount = props.columnCount === 1 ? 1 : 2
  const hostRef = useRef<HTMLDivElement>(null)
  const [colMinPx, setColMinPx] = useState(0)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const run = () => {
      const buttons = host.querySelectorAll<HTMLButtonElement>(':scope > button')
      if (buttons.length === 0) return
      let m = 0
      buttons.forEach((b) => {
        const wPrev = b.style.width
        const mwPrev = b.style.maxWidth
        b.style.width = 'max-content'
        b.style.maxWidth = 'none'
        m = Math.max(m, Math.ceil(b.getBoundingClientRect().width))
        b.style.width = wPrev
        b.style.maxWidth = mwPrev
      })
      setColMinPx((prev) => (prev === m ? prev : m))
    }
    run()
    requestAnimationFrame(run)
    const ro = new ResizeObserver(() => {
      run()
      requestAnimationFrame(run)
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, [props.measureKey, columnCount])

  /**
   * Fixed pixel tracks after measure. Before `colMinPx` is set, avoid `1fr` under `width: max-content`
   * parents — it resolves to 0 and the grid (and filter panel) collapse so nothing “pops up”.
   */
  const track =
    colMinPx > 0
      ? columnCount === 1
        ? `minmax(${colMinPx}px, 1fr)`
        : `repeat(2, ${colMinPx}px)`
      : columnCount === 1
        ? 'auto'
        : 'repeat(2, auto)'

  const gridWidthPx =
    colMinPx > 0 ? (columnCount === 2 ? colMinPx * 2 + 6 : colMinPx) : undefined

  return (
    <div
      ref={hostRef}
      id={props.id}
      role={props.role}
      aria-label={props['aria-label']}
      style={{
        display: 'grid',
        gridTemplateColumns: track,
        gap: 6,
        width: gridWidthPx != null ? `${gridWidthPx}px` : 'max-content',
        minWidth: 'min-content',
        overflow: 'visible',
        alignItems: 'stretch',
        boxSizing: 'border-box',
      }}
    >
      {props.children}
    </div>
  )
}

export function LegendChip(props: {
  label: string
  /** When set, `label` is the name only; count is shown in a non-shrinking segment (narrow filter chips). */
  count?: number
  color: string
  on: boolean
  onToggle: () => void
  /** Compact pill for one-line filter rows (list view). */
  dense?: boolean
  /** Allow label to wrap (rare); filter chips omit this so “Result (n)” stays one line. */
  allowMultiline?: boolean
  /** Tighter two-column pills for the narrow map tool dock. */
  dockCompact?: boolean
  /** Merged onto the root button last (e.g. flex row: `flex`, `minWidth`, `maxWidth`). */
  rootStyle?: CSSProperties
}) {
  const dense = props.dense === true
  const multiline = props.allowMultiline === true
  const dockCompact = props.dockCompact === true
  const count = props.count
  const on = props.on
  const titleText = count != null ? `${props.label} (${count})` : props.label
  /** Fixed-width swatch track + flex `gap` (dock): one flex gap between track and label so spacing cannot drift. */
  const swatchTrackPx = 14
  const dotPx = dockCompact ? 7 : 10
  const labelGapPx = 6
  /** Map / list filter dock: equal vertical + horizontal padding on every chip. */
  const dockChipPad = '7px 8px'
  const labelTextStyle: CSSProperties = {
    fontWeight: 900,
    fontSize: multiline ? 11 : dockCompact ? 10 : 12,
    lineHeight: dockCompact ? 1.2 : 1.25,
    wordBreak: multiline ? 'break-word' : undefined,
    overflowWrap: multiline ? 'anywhere' : undefined,
    minWidth: 0,
    textAlign: 'left',
    color: on ? vcGlassFgDarkReadable : 'rgba(15, 23, 42, 0.58)',
    whiteSpace: multiline ? 'normal' : 'nowrap',
  }
  const countSuffixStyle: CSSProperties = {
    ...labelTextStyle,
    overflow: 'visible',
    whiteSpace: 'nowrap',
  }
  const dotStyle: CSSProperties = {
    width: dotPx,
    height: dotPx,
    borderRadius: 999,
    background: props.color,
    flexShrink: 0,
    display: 'block',
  }
  return (
    <button
      type="button"
      onClick={props.onToggle}
      title={titleText}
      style={{
        ...chip,
        width: dense && !dockCompact ? 'auto' : '100%',
        flex: dense && !dockCompact ? '0 0 auto' : undefined,
        minWidth: dockCompact ? 'min-content' : dense && !dockCompact ? undefined : 0,
        maxWidth: dockCompact || (dense && !dockCompact) ? 'none' : '100%',
        boxSizing: 'border-box',
        ...(dockCompact
          ? {
              display: 'flex',
              alignItems: multiline ? 'flex-start' : 'center',
              justifyContent: 'flex-start',
              gap: 0,
            }
          : {
              display: 'inline-flex',
              justifyContent: 'flex-start',
              alignItems: multiline ? 'flex-start' : 'center',
              gap: dense ? 6 : chip.gap,
            }),
        /** Match `chip` / row status pills: slate frost, not paper white (reads on map HUD + list). */
        background: on ? 'rgba(203, 213, 225, 0.82)' : 'rgba(148, 163, 184, 0.36)',
        borderColor: on ? 'rgba(15, 23, 42, 0.16)' : 'rgba(15, 23, 42, 0.12)',
        boxShadow: on
          ? 'inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 4px rgba(15, 23, 42, 0.08)'
          : 'inset 0 1px 0 rgba(255,255,255,0.12)',
        whiteSpace: multiline ? 'normal' : 'nowrap',
        padding: dockCompact ? dockChipPad : dense ? '6px 10px' : chip.padding,
        ...props.rootStyle,
        ...(dockCompact
          ? {
              overflow: 'hidden' as const,
              /** After `rootStyle` so callers cannot force `minWidth: 0` and squash chips below label+count. */
              minWidth: 'min-content' as const,
            }
          : {}),
      }}
    >
      {dockCompact ? (
        <span
          style={{
            display: 'grid',
            gridTemplateColumns: `${swatchTrackPx}px minmax(0, 1fr)`,
            columnGap: labelGapPx,
            alignItems: multiline ? 'start' : 'center',
            width: '100%',
            minWidth: 'min-content',
            boxSizing: 'border-box',
          }}
        >
          <span
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: multiline ? 'start' : 'center',
            }}
          >
            <span style={dotStyle} />
          </span>
          {count != null ? (
            <span
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                alignItems: 'center',
                width: 'max-content',
                minWidth: 'min-content',
                overflow: 'visible',
                gap: 5,
              }}
            >
              <span
                style={{
                  ...labelTextStyle,
                  minWidth: 'auto',
                  flexShrink: 0,
                  overflow: 'visible',
                }}
              >
                {props.label}
              </span>
              <span style={{ ...countSuffixStyle, flexShrink: 0, minWidth: 'max-content' }}>{`(${count})`}</span>
            </span>
          ) : (
            <span
              style={{
                ...labelTextStyle,
                width: '100%',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: multiline ? undefined : 'ellipsis',
              }}
            >
              {props.label}
            </span>
          )}
        </span>
      ) : (
        <>
          <span
            style={{
              ...dotStyle,
              marginTop: multiline ? 2 : undefined,
            }}
          />
          <span style={labelTextStyle}>
            {count != null ? (
              <>
                {props.label}
                <span style={{ marginLeft: 5 }}>{`(${count})`}</span>
              </>
            ) : (
              props.label
            )}
          </span>
        </>
      )}
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

  const coordLine = formatLatLonForStepUi(props.point.lat, props.point.lon)
  const notesBlock = (
    <div>
      <div style={label}>Notes</div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#64748b',
          marginBottom: 6,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        {coordLine}
      </div>
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
        {notesBlock}
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
          label={statusLabel('noCameras')}
          color={statusColor('noCameras')}
          active={props.location.status === 'noCameras'}
          disabled={!canEdit}
          fullWidth={fw}
          onClick={() => props.onUpdate({ status: 'noCameras' })}
        />
        <StatusPill
          label={statusLabel('camerasNoAnswer')}
          color={statusColor('camerasNoAnswer')}
          active={props.location.status === 'camerasNoAnswer'}
          disabled={!canEdit}
          fullWidth={fw}
          onClick={() => props.onUpdate({ status: 'camerasNoAnswer' })}
        />
        <StatusPill
          label={statusLabel('notProbativeFootage')}
          color={statusColor('notProbativeFootage')}
          active={props.location.status === 'notProbativeFootage'}
          disabled={!canEdit}
          fullWidth={fw}
          onClick={() => props.onUpdate({ status: 'notProbativeFootage' })}
        />
        <StatusPill
          label={statusLabel('probativeFootage')}
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
