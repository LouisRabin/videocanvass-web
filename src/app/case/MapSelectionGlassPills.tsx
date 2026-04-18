import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import type { CanvassStatus } from '../../lib/types'
import { statusColor, statusLabel } from '../../lib/types'
import { formatAddressLineForMapList } from '../casePageHelpers'
import { mapDrawerRemoveBtnStyle, btn } from './CasePageChrome'
import {
  vcGlassFgOnPanel,
  vcGlassFgMutedOnPanel,
  vcLiquidGlassPanel,
  vcLiquidGlassPanelNestedLight,
  vcLiquidGlassPanelOnMapBackdrop,
} from '../../lib/vcLiquidGlass'

type MapSelectionPillChrome = 'hud' | 'webDock'
type MapSelectionPillLayout = 'fill' | 'hug'

/** Narrow / basemap family: dark HUD on raw map. */
/** Web: same liquid glass as wide web left map tools column (`vcLiquidGlassPanel`). */
function mapSelectionPillShell(chrome: MapSelectionPillChrome, layout: MapSelectionPillLayout = 'fill'): CSSProperties {
  const widthBlock: CSSProperties =
    layout === 'hug'
      ? { width: 'max-content', maxWidth: '100%' }
      : { width: '100%', maxWidth: 'min(720px, 100%)', margin: '0 auto' }
  const shared: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
    minWidth: 0,
    ...widthBlock,
    boxSizing: 'border-box',
    borderRadius: 999,
    color: vcGlassFgOnPanel,
  }
  if (chrome === 'webDock') {
    return {
      ...shared,
      ...vcLiquidGlassPanel,
      padding: '8px 14px',
    }
  }
  return {
    ...shared,
    ...vcLiquidGlassPanelOnMapBackdrop,
    padding: '8px 10px',
  }
}

const pillDismissBtn: CSSProperties = {
  ...btn,
  padding: '4px 8px',
  fontSize: 13,
  fontWeight: 800,
  flexShrink: 0,
  borderRadius: 8,
}

/** Track step chip: route-color rim; lighter nested frost so it doesn’t stack dark on the pill shell. */
function mapTrackQuickChipShell(trackColor: string): CSSProperties {
  const tc = trackColor.trim() || '#3b82f6'
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    maxWidth: '100%',
    padding: '5px 12px 5px 8px',
    borderRadius: 999,
    boxSizing: 'border-box',
    ...vcLiquidGlassPanelNestedLight,
    border: `2px solid ${tc}`,
  }
}

export function MapTrackQuickPickChip(props: {
  trackColor: string
  trackLabel: string
  stepIndex: number
  /** Slightly larger for modal header chrome */
  size?: 'default' | 'modal'
}) {
  const tc = props.trackColor.trim() || '#3b82f6'
  const rawName = (props.trackLabel || 'Track').trim() || 'Track'
  const modal = props.size === 'modal'
  const dot = modal ? 11 : 10
  const nameFs = modal ? 15 : 13
  const stepFs = modal ? 13 : 12
  const stepLine = `Step ${props.stepIndex}`
  const titleTip = `${rawName} · ${stepLine}`
  return (
    <div style={mapTrackQuickChipShell(tc)} title={titleTip}>
      <span
        aria-hidden
        style={{
          width: dot,
          height: dot,
          borderRadius: 999,
          background: tc,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontWeight: 900,
          fontSize: nameFs,
          lineHeight: 1.25,
          color: vcGlassFgOnPanel,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          flex: '1 1 auto',
        }}
      >
        {rawName}
      </span>
      <span
        style={{
          fontWeight: 800,
          fontSize: stepFs,
          lineHeight: 1.2,
          color: vcGlassFgMutedOnPanel,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          maxWidth: modal ? 280 : 220,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {stepLine}
      </span>
    </div>
  )
}

function stopActivate(e: MouseEvent | KeyboardEvent) {
  e.stopPropagation()
}

const ADDR_PILL_DBL_MS = 340
const ADDR_PILL_DBL_DIST_PX = 40

export function MapAddressSelectionPill(props: {
  addressText: string
  status: CanvassStatus
  canDelete: boolean
  /** Double-click the address block, or Enter/Space when focused — opens notes / detail modal. */
  onOpenNotes: () => void
  onRemove: () => void
  onDismissSelection: () => void
  /** `webDock` matches wide web left map tools pill; `hud` matches narrow map HUD. */
  pillChrome?: MapSelectionPillChrome
  /** `hug`: width follows content (mobile map); `fill`: stretch up to max width (web). */
  pillLayout?: MapSelectionPillLayout
}) {
  const line = formatAddressLineForMapList(props.addressText)
  const sc = statusColor(props.status)
  const dblTapRef = useRef<{ t: number; x: number; y: number } | null>(null)
  const layout = props.pillLayout ?? 'fill'
  const shell = mapSelectionPillShell(props.pillChrome ?? 'hud', layout)
  const mainFlex = layout === 'hug' ? ({ flex: '0 1 auto' } as const) : ({ flex: 1 } as const)

  const onMainClick = (e: MouseEvent) => {
    const now = Date.now()
    const cx = e.clientX
    const cy = e.clientY
    const prev = dblTapRef.current
    if (
      prev &&
      now - prev.t < ADDR_PILL_DBL_MS &&
      (cx - prev.x) ** 2 + (cy - prev.y) ** 2 < ADDR_PILL_DBL_DIST_PX ** 2
    ) {
      dblTapRef.current = null
      props.onOpenNotes()
      return
    }
    dblTapRef.current = { t: now, x: cx, y: cy }
  }

  return (
    <div style={shell}>
      <div
        role="button"
        tabIndex={0}
        title="Double-click for address notes"
        onClick={onMainClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            dblTapRef.current = null
            props.onOpenNotes()
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          ...mainFlex,
          minWidth: 0,
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: 10,
          padding: '2px 4px',
          margin: '-2px -4px',
        }}
      >
        <div style={{ ...mainFlex, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: 13,
              lineHeight: 1.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={line}
          >
            {line}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 800,
                color: 'rgba(248, 250, 252, 0.92)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: sc,
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {statusLabel(props.status)}
              </span>
            </span>
          </div>
        </div>
      </div>
      {props.canDelete ? (
        <button
          type="button"
          style={{ ...mapDrawerRemoveBtnStyle, flexShrink: 0 }}
          onClick={(e) => {
            stopActivate(e)
            props.onRemove()
          }}
          aria-label="Remove address from case"
        >
          Remove
        </button>
      ) : null}
      <button
        type="button"
        style={pillDismissBtn}
        onClick={(e) => {
          stopActivate(e)
          props.onDismissSelection()
        }}
        aria-label="Deselect address"
      >
        ✕
      </button>
    </div>
  )
}

export function MapTrackSelectionPill(props: {
  trackLabel: string
  stepIndex: number
  /** Route / track color (condensed mobile row). */
  trackColor: string
  canDelete: boolean
  onOpenDetail: () => void
  onRemove: () => void
  onDismissSelection: () => void
  /** Condensed mobile row: color, name, step, Remove, ✕ only. */
  condensed?: boolean
  pillChrome?: MapSelectionPillChrome
  pillLayout?: MapSelectionPillLayout
}) {
  const onMainActivate = () => props.onOpenDetail()
  const condensed = props.condensed === true
  const layout = props.pillLayout ?? 'fill'
  const shell = mapSelectionPillShell(props.pillChrome ?? 'hud', layout)
  const mainFlex = layout === 'hug' ? ({ flex: '0 1 auto' } as const) : ({ flex: 1 } as const)

  if (condensed) {
    return (
      <div style={shell}>
        <div
          role="button"
          tabIndex={0}
          onClick={onMainActivate}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onMainActivate()
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            ...mainFlex,
            minWidth: 0,
            cursor: 'pointer',
            borderRadius: 10,
            padding: '2px 4px',
            margin: '-2px -4px',
          }}
        >
          <MapTrackQuickPickChip
            trackColor={props.trackColor}
            trackLabel={props.trackLabel}
            stepIndex={props.stepIndex}
          />
        </div>
        {props.canDelete ? (
          <button
            type="button"
            style={{ ...mapDrawerRemoveBtnStyle, flexShrink: 0 }}
            onClick={(e) => {
              stopActivate(e)
              props.onRemove()
            }}
            aria-label="Remove this step"
          >
            Remove
          </button>
        ) : null}
        <button
          type="button"
          style={pillDismissBtn}
          onClick={(e) => {
            stopActivate(e)
            props.onDismissSelection()
          }}
          aria-label="Deselect step"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div style={shell}>
      <div
        role="button"
        tabIndex={0}
        onClick={onMainActivate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onMainActivate()
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          ...mainFlex,
          minWidth: 0,
          cursor: 'pointer',
          borderRadius: 10,
          padding: '2px 4px',
          margin: '-2px -4px',
        }}
      >
        <div style={{ ...mainFlex, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <MapTrackQuickPickChip
            trackColor={props.trackColor}
            trackLabel={props.trackLabel}
            stepIndex={props.stepIndex}
          />
        </div>
      </div>
      {props.canDelete ? (
        <button
          type="button"
          style={{ ...mapDrawerRemoveBtnStyle, flexShrink: 0 }}
          onClick={(e) => {
            stopActivate(e)
            props.onRemove()
          }}
          aria-label="Remove this step"
        >
          Remove
        </button>
      ) : null}
      <button
        type="button"
        style={pillDismissBtn}
        onClick={(e) => {
          stopActivate(e)
          props.onDismissSelection()
        }}
        aria-label="Deselect step"
      >
        ✕
      </button>
    </div>
  )
}
