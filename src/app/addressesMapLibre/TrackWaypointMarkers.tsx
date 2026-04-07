import { memo, useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { Marker, useMap } from 'react-map-gl/maplibre'
import type { Track, TrackPoint } from '../../lib/types'
import {
  buildWaypointProximityGroups,
  waypointGroupingToleranceToThresholds,
} from '../../lib/trackWaypointProximityGroups'
import { sortTrackPointsStable } from '../addressesMapLibreHelpers'

/** Above this many on-map points per track, show step numbers on a subset only (map legibility). */
const DENSE_WAYPOINT_COUNT = 40
const MAX_STEP_LABELS_PER_TRACK = 24

function shouldShowStepNumber(
  index: number,
  len: number,
  pointId: string,
  selectedPointId: string | null,
): boolean {
  if (len <= DENSE_WAYPOINT_COUNT) return true
  if (index === 0 || index === len - 1) return true
  if (selectedPointId === pointId) return true
  const stride = Math.max(1, Math.ceil(len / MAX_STEP_LABELS_PER_TRACK))
  return index % stride === 0
}

/** ~4–14 m spread from centroid so stacked GPS points separate visually when expanded */
function fanOutLatLon(
  centroidLat: number,
  centroidLon: number,
  index: number,
  count: number,
): { lat: number; lon: number } {
  if (count <= 1) return { lat: centroidLat, lon: centroidLon }
  const r = 0.000045 + 0.00001 * Math.min(count, 8)
  const ang = (2 * Math.PI * index) / count - Math.PI / 2
  const cosLat = Math.cos((centroidLat * Math.PI) / 180)
  const dLat = r * Math.cos(ang)
  const dLon = (r * Math.sin(ang)) / Math.max(0.2, Math.abs(cosLat))
  return { lat: centroidLat + dLat, lon: centroidLon + dLon }
}

function MapCanvasClickDismiss(props: { active: boolean; onDismiss: () => void }) {
  const maps = useMap()
  const onDismissRef = useRef(props.onDismiss)
  onDismissRef.current = props.onDismiss

  useEffect(() => {
    if (!props.active) return
    const mapRef = maps.current
    if (!mapRef) return
    const map = mapRef.getMap()
    const handle = (e: { originalEvent?: unknown }) => {
      const raw = (e.originalEvent as { target?: unknown } | undefined)?.target
      const el = raw instanceof Element ? raw : null
      if (el?.closest?.('.maplibregl-marker')) return
      onDismissRef.current()
    }
    map.on('click', handle)
    return () => {
      map.off('click', handle)
    }
  }, [props.active, maps])

  return null
}

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
  /** 0–100: higher = lump more consecutive steps (distance + time scale together). Default 20. */
  waypointGroupTolerance?: number
}) {
  const waypointDblTapRef = useRef<{ id: string; t: number; x: number; y: number } | null>(null)
  const WPT_DBL_MS = 340
  const WPT_DBL_DIST = 40
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null)

  const dismissExpanded = useCallback(() => setExpandedGroupKey(null), [])

  if (props.showMarkers === false) return null

  const tol = props.waypointGroupTolerance ?? 20
  const { maxNeighborMeters, maxNeighborTimeMs } = waypointGroupingToleranceToThresholds(tol)

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
    const stepIndexById = new Map<string, number>()
    for (let i = 0; i < pts.length; i++) stepIndexById.set(pts[i]!.id, i + 1)

    const groups = buildWaypointProximityGroups(pts, maxNeighborMeters, maxNeighborTimeMs)

    for (const g of groups) {
      if (g.points.length === 1) {
        const p = g.points[0]!
        const i = (stepIndexById.get(p.id) ?? 1) - 1
        const n = i + 1
        const ring = props.selectedPointId === p.id ? '0 0 0 3px #111827' : '0 0 0 2px #fff'
        const canManip = props.canManipulatePoint(p.id)
        const draggable = !!(canManip && props.draggable && props.onDragEndPoint && !props.blockMapCanvasPointerEvents)
        const interactive =
          (!!canManip && (!!props.onSelectPoint || draggable)) || !!props.onDoubleTapTrackPoint
        const showNum = shouldShowStepNumber(i, pts.length, p.id, props.selectedPointId)

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
              if (expandedGroupKey) setExpandedGroupKey(null)
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
              {showNum ? n : ''}
            </div>
          </Marker>,
        )
        continue
      }

      const multi = g.points
      const isExpanded = expandedGroupKey === g.key
      const stepNums = multi.map((p) => stepIndexById.get(p.id) ?? 0)
      const stepLo = Math.min(...stepNums)
      const stepHi = Math.max(...stepNums)
      const label = stepLo === stepHi ? `${stepLo}` : `${stepLo}–${stepHi}`
      const selectedInGroup = multi.some((p) => p.id === props.selectedPointId)
      const ring =
        selectedInGroup && !isExpanded ? '0 0 0 3px #111827' : '0 0 0 2px #fff'

      if (!isExpanded) {
        nodes.push(
          <Marker
            key={`wpt-grp-${g.key}`}
            longitude={g.centroidLon}
            latitude={g.centroidLat}
            anchor="center"
            draggable={false}
            style={{
              zIndex: selectedInGroup ? 38 : 24,
              pointerEvents: props.blockMapCanvasPointerEvents ? 'none' : 'auto',
            }}
            onClick={(ev) => {
              ev.originalEvent?.stopPropagation?.()
              if (props.blockMapCanvasPointerEvents) return
              if (props.mapLeftToolDockOpenRef?.current) return
              if (expandedGroupKey && expandedGroupKey !== g.key) setExpandedGroupKey(null)
              if (props.onDoubleTapTrackPoint) {
                const first = multi[0]!
                const oe = ev.originalEvent
                if (oe && 'clientX' in oe) {
                  const now = Date.now()
                  const cx = (oe as MouseEvent).clientX
                  const cy = (oe as MouseEvent).clientY
                  const prev = waypointDblTapRef.current
                  if (
                    prev &&
                    prev.id === first.id &&
                    now - prev.t < WPT_DBL_MS &&
                    (cx - prev.x) ** 2 + (cy - prev.y) ** 2 < WPT_DBL_DIST ** 2
                  ) {
                    waypointDblTapRef.current = null
                    props.onDoubleTapTrackPoint(first.id)
                    return
                  }
                  waypointDblTapRef.current = { id: first.id, t: now, x: cx, y: cy }
                }
              }
              setExpandedGroupKey(g.key)
            }}
          >
            <div
              title={`${multi.length} steps — tap to expand`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 22,
                padding: '0 5px',
                borderRadius: 999,
                background: base,
                color: '#fff',
                fontWeight: 900,
                fontSize: stepLo === stepHi ? 11 : 9,
                border: '2px solid #fff',
                boxShadow: `${ring}, 0 1px 4px rgba(0,0,0,0.25)`,
                cursor: props.blockMapCanvasPointerEvents ? 'default' : 'pointer',
                touchAction: 'manipulation',
              }}
            >
              {label}
            </div>
          </Marker>,
        )
        continue
      }

      for (let j = 0; j < multi.length; j++) {
        const p = multi[j]!
        const { lat, lon } = fanOutLatLon(g.centroidLat, g.centroidLon, j, multi.length)
        const i = (stepIndexById.get(p.id) ?? 1) - 1
        const n = i + 1
        const ring = props.selectedPointId === p.id ? '0 0 0 3px #111827' : '0 0 0 2px #fff'
        const canManip = props.canManipulatePoint(p.id)
        const draggable = !!(canManip && props.draggable && props.onDragEndPoint && !props.blockMapCanvasPointerEvents)
        const interactive =
          (!!canManip && (!!props.onSelectPoint || draggable)) || !!props.onDoubleTapTrackPoint
        const showNum = shouldShowStepNumber(i, pts.length, p.id, props.selectedPointId)

        nodes.push(
          <Marker
            key={`wpt-ml-exp-${g.key}-${p.id}`}
            longitude={lon}
            latitude={lat}
            anchor="center"
            draggable={draggable}
            style={{
              zIndex: props.selectedPointId === p.id ? 42 : 30 + j,
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
              {showNum ? n : ''}
            </div>
          </Marker>,
        )
      }
    }
  }

  return (
    <>
      <MapCanvasClickDismiss active={expandedGroupKey != null} onDismiss={dismissExpanded} />
      {nodes}
    </>
  )
})
