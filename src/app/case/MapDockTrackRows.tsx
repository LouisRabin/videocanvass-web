import type { CSSProperties, ReactNode } from 'react'
import type { Track } from '../../lib/types'
import { field } from './CasePageChrome'
import { TrackMapVisibilityButton } from './casePageMapUi'

type MapDockTrackRowsProps = {
  isNarrow: boolean
  caseTracks: Track[]
  visibleTrackIds: Record<string, boolean>
  /** Highlight row when this id matches (subject tracking target); use `null` in import dock. */
  trackForMapAdd: string | null
  /** `htmlFor` / id prefix for color inputs (avoid duplicate ids across docks). */
  colorInputIdPrefix?: string
  resolvedTrackColors: Map<string, string>
  defaultLineColor: string
  onToggleTrackVisibility: (trackId: string) => void
  canEditTrack: (t: Track) => boolean
  canDeleteTrack: (t: Track) => boolean
  onRouteColorChange: (trackId: string, color: string) => void
  onRequestDeleteTrack: (t: Track) => void
  renderNameField: (t: Track, canEditT: boolean, inputStyle: CSSProperties) => ReactNode
}

export function MapDockTrackRows(props: MapDockTrackRowsProps) {
  const {
    isNarrow,
    caseTracks,
    visibleTrackIds,
    trackForMapAdd,
    colorInputIdPrefix = 'map-dock-track-color',
    resolvedTrackColors,
    defaultLineColor,
    onToggleTrackVisibility,
    canEditTrack,
    canDeleteTrack,
    onRouteColorChange,
    onRequestDeleteTrack,
    renderNameField,
  } = props

  if (caseTracks.length === 0) return null

  return (
    <>
      {caseTracks.map((t) => {
        const on = visibleTrackIds[t.id] !== false
        const canEditT = canEditTrack(t)
        const canDelT = canDeleteTrack(t)
        const lineColor = resolvedTrackColors.get(t.id) ?? defaultLineColor
        const colorPickerId = `${colorInputIdPrefix}-${t.id}`
        return (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
              padding: '6px 8px',
              border: isNarrow ? '1px solid rgba(148, 163, 184, 0.45)' : '1px solid rgba(255,255,255,0.2)',
              borderRadius: 10,
              background: isNarrow ? 'rgba(226, 232, 240, 0.4)' : 'rgba(255,255,255,0.08)',
              boxSizing: 'border-box',
              boxShadow: trackForMapAdd === t.id ? `inset 0 0 0 1px ${lineColor}` : undefined,
            }}
          >
            <TrackMapVisibilityButton
              visible={on}
              trackLabel={t.label}
              variant={isNarrow ? 'mapDockLight' : 'mapDockGlass'}
              onToggle={() => onToggleTrackVisibility(t.id)}
            />
            <label
              htmlFor={colorPickerId}
              title={canEditT ? 'Change path color' : 'No permission to change color'}
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `2px solid ${lineColor}`,
                background: lineColor,
                cursor: canEditT ? 'pointer' : 'default',
                position: 'relative',
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
            >
              <input
                id={colorPickerId}
                type="color"
                value={lineColor}
                disabled={!canEditT}
                onChange={(e) => onRouteColorChange(t.id, e.target.value)}
                style={{
                  opacity: 0,
                  position: 'absolute',
                  width: '180%',
                  height: '180%',
                  left: '-40%',
                  top: '-40%',
                  cursor: canEditT ? 'pointer' : 'default',
                  border: 'none',
                  padding: 0,
                }}
              />
            </label>
            {renderNameField(t, canEditT, {
              ...field,
              flex: 1,
              minWidth: 0,
              padding: '8px 10px',
            })}
            {canDelT ? (
              <button
                type="button"
                aria-label={`Delete ${t.label}`}
                title="Delete track"
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  padding: 0,
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  background: '#fff1f2',
                  color: '#9f1239',
                  cursor: 'pointer',
                  fontSize: 'clamp(14px, 1.4vw, 18px)',
                  fontWeight: 900,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => onRequestDeleteTrack(t)}
              >
                ✕
              </button>
            ) : (
              <span style={{ width: 32, flexShrink: 0 }} aria-hidden />
            )}
          </div>
        )
      })}
    </>
  )
}
