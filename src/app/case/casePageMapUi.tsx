import type { CSSProperties } from 'react'
import { vcGlassFgOnPanel } from '../../lib/vcLiquidGlass'

/** Icon size inside the 44×44 map glass chips (menu + basemap). */
export const MAP_LAYERS_GLYPH_PX = 22

/** Stacked layers glyph: narrow map tools menu only (`vcGlassFgOnPanel`, fillOpacity 0.92). */
export function VcCaseMapLayersGlyph(props: { size?: number }) {
  const size = props.size ?? MAP_LAYERS_GLYPH_PX
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ color: vcGlassFgOnPanel }}
    >
      <rect x="3" y="5" width="18" height="4.5" rx="2" fill="currentColor" fillOpacity={0.92} />
      <rect x="3" y="10.75" width="18" height="4.5" rx="2" fill="currentColor" fillOpacity={0.92} />
      <rect x="3" y="16.5" width="18" height="4.5" rx="2" fill="currentColor" fillOpacity={0.92} />
    </svg>
  )
}

/** Satellite silhouette: basemap cycle control only — same color/opacity recipe as `VcCaseMapLayersGlyph`. */
export function VcCaseMapBasemapSatelliteGlyph(props: { size?: number }) {
  const size = props.size ?? MAP_LAYERS_GLYPH_PX
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ color: vcGlassFgOnPanel }}
    >
      <rect x="2" y="9.5" width="6.5" height="5" rx="1.25" fill="currentColor" fillOpacity={0.92} />
      <rect x="9.25" y="7.5" width="5.5" height="9" rx="1.75" fill="currentColor" fillOpacity={0.92} />
      <rect x="15.5" y="9.5" width="6.5" height="5" rx="1.25" fill="currentColor" fillOpacity={0.92} />
      <rect x="10.5" y="3.5" width="3" height="3.5" rx="0.75" fill="currentColor" fillOpacity={0.92} />
    </svg>
  )
}

function EyeOpenIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={2} />
    </svg>
  )
}

function EyeClosedIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2 2l20 20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

export function TrackMapVisibilityButton(props: {
  visible: boolean
  trackLabel: string
  variant: 'mapDockGlass' | 'mapDockLight' | 'modal'
  onToggle: () => void
}) {
  const { visible, trackLabel, variant, onToggle } = props
  const glass = variant === 'mapDockGlass'
  const btn: CSSProperties = {
    flexShrink: 0,
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxSizing: 'border-box',
    ...(glass
      ? {
          border: '1px solid rgba(255,255,255,0.22)',
          background: visible ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
          color: visible ? '#f8fafc' : 'rgba(203,213,225,0.72)',
          opacity: visible ? 1 : 0.78,
        }
      : {
          border: '1px solid rgba(148, 163, 184, 0.45)',
          background: visible ? 'rgba(241, 245, 249, 0.92)' : 'rgba(226, 232, 240, 0.5)',
          color: visible ? '#111827' : '#9ca3af',
          opacity: visible ? 1 : 0.9,
        }),
  }
  return (
    <button
      type="button"
      aria-label={visible ? `Hide “${trackLabel}” on map` : `Show “${trackLabel}” on map`}
      aria-pressed={visible}
      title={visible ? 'Hide path on map' : 'Show path on map'}
      onClick={onToggle}
      style={btn}
    >
      {visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
    </button>
  )
}
