import { memo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Marker } from 'react-map-gl/maplibre'
import type { Track, TrackPoint } from '../../lib/types'
import { sortTrackPointsStable } from '../addressesMapLibreHelpers'

export const TrackWaypointMarkersMapLibre = memo(function TrackWaypointMarkersMapLibre(props: {
  tracks: Track[]
  trackPoints: TrackPoint[]
  visibleTrackIds: Record<string, boolean>
  selectedPointId: string | null
  getRouteColor: (trackId: string) => string
  canManipulatePoint: (pointId: string) => boolean
  onSelectPoint: (pointId: string) => void
  draggable: boolean
  onDragEndPoint?: (pointId: string, lat: number, lon: number) => void
  onDoubleTapTrackPoint?: (pointId: string) => void
  /** When false, low-zoom cluster layers replace these markers. */
  showMarkers?: boolean
  mapLeftToolDockOpenRef?: MutableRefObject<boolean>
  blockMapCanvasPointerEvents?: boolean
}) {
  const waypointDblTapRef = useRef<{ id: string; t: number; x: number; y: number } | null>(null)
  const WPT_DBL_MS = 340
  const WPT_DBL_DIST = 40
  if (props.showMarkers === false) return null
  const byTrack = new Map<string, TrackPoint[]>()
  for (const p of props.trackPoints) {
    if (props.visibleTrackIds[p.trackId] === false) continue
    const arr = byTrack.get(p.trackId) ?? []
    arr.push(p)
    byTrack.set(p.trackId, arr)
  }
  const nodes: ReactNode[] = []
  for (const track of props.tracks) {
    if (props.visibleTrackIds[track.id] === false) continue
    const pts = (byTrack.get(track.id) ?? []).slice().sort(sortTrackPointsStable).filter((p) => p.showOnMap !== false)
    const base = props.getRouteColor(track.id)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!
      const n = i + 1
      const ring = props.selectedPointId === p.id ? '0 0 0 3px #111827' : '0 0 0 2px #fff'
      const canManip = props.canManipulatePoint(p.id)
      const draggable = !!(canManip && props.draggable && props.onDragEndPoint && !props.blockMapCanvasPointerEvents)
      const interactive =
        (!!canManip && (!!props.onSelectPoint || draggable)) || !!props.onDoubleTapTrackPoint

      nodes.push(
        <Marker
          key={`wpt-ml-${p.id}`}
          longitude={p.lon}
          latitude={p.lat}
          anchor="center"
          draggable={draggable}
          style={{
            zIndex: props.selectedPointId === p.id ? 40 : 20 + Math.min(i, 15),
            pointerEvents: props.blockMapCanvasPointerEvents ? 'none' : 'auto',
          }}
          onClick={(ev) => {
            ev.originalEvent?.stopPropagation?.()
            if (props.blockMapCanvasPointerEvents) return
            if (props.mapLeftToolDockOpenRef?.current) return
            if (props.onDoubleTapTrackPoint) {
              const oe = ev.originalEvent
              if (oe && 'clientX' in oe) {
                const now = Date.now()
                const cx = (oe as MouseEvent).clientX
                const cy = (oe as MouseEvent).clientY
                const prev = waypointDblTapRef.current
                if (
                  prev &&
                  prev.id === p.id &&
                  now - prev.t < WPT_DBL_MS &&
                  (cx - prev.x) ** 2 + (cy - prev.y) ** 2 < WPT_DBL_DIST ** 2
                ) {
                  waypointDblTapRef.current = null
                  props.onDoubleTapTrackPoint(p.id)
                  return
                }
                waypointDblTapRef.current = { id: p.id, t: now, x: cx, y: cy }
              }
            }
            if (!canManip) return
            props.onSelectPoint(p.id)
          }}
          onDragEnd={
            draggable && props.onDragEndPoint
              ? (ev) => {
                  const ll = ev.lngLat
                  if (ll) props.onDragEndPoint!(p.id, ll.lat, ll.lng)
                }
              : undefined
          }
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: 999,
              background: base,
              color: '#fff',
              fontWeight: 900,
              fontSize: 11,
              border: '2px solid #fff',
              boxShadow: `${ring}, 0 1px 4px rgba(0,0,0,0.25)`,
              cursor: interactive ? 'pointer' : 'default',
              touchAction: 'manipulation',
            }}
          >
            {n}
          </div>
        </Marker>,
      )
    }
  }
  return <>{nodes}</>
})
