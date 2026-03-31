import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import MapGL, { Layer, Marker, NavigationControl, Source, useMap, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre'
import type { Map as GlMap } from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import L from 'leaflet'

import type { LatLon, Location, Track, TrackPoint } from '../lib/types'
import { formatAppDateTime } from '../lib/timeFormat'
import { statusColor } from '../lib/types'
import { reverseGeocodeAddressText } from '../lib/geocode'
import {
  buildingFootprintRingFromRenderedFeatures,
  CARTO_VECTOR_BUILDING_LAYER_IDS,
} from '../lib/vectorTileBuilding'

// See docs/CODEMAP.md; geocode/footprint policy in HANDOFF.md.

const MAP_LONG_PRESS_MS = 550
const MAP_LONG_PRESS_MOVE_PX2 = 64
/*
 * Table of contents (main component below):
 * - Exported types: UnifiedCaseMapHandle, MapTrackingInteraction, AddressesMapLibreProps
 * - Memoized subcomponents: TrackWaypointMarkersMapLibre, TrackTimeLabelsMapLibre
 * - AddressesMapLibreInner: ref/imperative handle, map setup, sources/layers, clustering, events
 */

import {
  buildCanvassCollection,
  buildCanvassLocationClusterCollection,
  buildPinCollection,
  buildTrackWaypointClusterCollection,
  buildTracksData,
  CARTO_VOYAGER_STYLE,
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS_PX,
  easeClusterExpansion,
  extendBoundsWithLocations,
  extendBoundsWithPathPoints,
  MAP_DETAIL_MIN_ZOOM,
  MAP_RESUME_FOCUS_ZOOM,
  sortTrackPointsStable,
  VIEWPORT_OUTLINE_PRELOAD_BOUNDS_PAD,
  VIEWPORT_OUTLINE_PRELOAD_DEBOUNCE_MS,
  VIEWPORT_OUTLINE_PRELOAD_MAX,
} from './addressesMapLibreHelpers'

export type UnifiedCaseMapHandle = {
  flyTo: (lat: number, lon: number, zoom: number, opts?: { duration?: number }) => void
  fitBounds: (bounds: InstanceType<typeof L.LatLngBounds>) => void
  getZoom: () => number
  /** Cancel deferred canvass single-tap so a dismiss tap does not select/add after overlay/pointer guard handling. */
  clearPendingMapTap: () => void
}

export type MapTrackingInteraction = {
  trackPoints: TrackPoint[]
  visibleTrackIds: Record<string, boolean>
  canManipulateTrackPoint: (pointId: string) => boolean
  onPickPoint: (pointId: string) => void
  onAddPoint: (lat: number, lon: number) => void
  addDisabled: boolean
  pickRadiusPx?: number
}

type TrackHitResult = { kind: 'none' } | { kind: 'blocked' } | { kind: 'picked'; pointId: string }

/** Geometric hit-test only — does not call `onPickPoint` (safe for long-press gating). */
function resolveTrackHitAtPixel(
  map: GlMap,
  clickPx: { x: number; y: number },
  ti: MapTrackingInteraction,
): TrackHitResult {
  const r = ti.pickRadiusPx ?? 28
  const r2 = r * r
  let bestManip: { id: string; d2: number } | null = null
  let anyPin = false
  for (const pt of ti.trackPoints) {
    if (pt.showOnMap === false) continue
    if (ti.visibleTrackIds[pt.trackId] === false) continue
    const lp = map.project([pt.lon, pt.lat])
    const dx = lp.x - clickPx.x
    const dy = lp.y - clickPx.y
    const d2 = dx * dx + dy * dy
    if (d2 > r2) continue
    anyPin = true
    if (ti.canManipulateTrackPoint(pt.id) && (!bestManip || d2 < bestManip.d2)) bestManip = { id: pt.id, d2 }
  }
  if (bestManip) return { kind: 'picked', pointId: bestManip.id }
  if (anyPin) return { kind: 'blocked' }
  return { kind: 'none' }
}

const TrackWaypointMarkersMapLibre = memo(function TrackWaypointMarkersMapLibre(props: {
  tracks: Track[]
  trackPoints: TrackPoint[]
  visibleTrackIds: Record<string, boolean>
  selectedPointId: string | null
  getRouteColor: (trackId: string) => string
  canManipulatePoint: (pointId: string) => boolean
  onSelectPoint: (pointId: string) => void
  draggable: boolean
  onDragEndPoint?: (pointId: string, lat: number, lon: number) => void
  /** Video canvassing mode: long-press a step to switch to Subject tracking. */
  onLongPressPoint?: (pointId: string) => void
  /** When false, low-zoom cluster layers replace these markers. */
  showMarkers?: boolean
}) {
  const longPressSuppressClickUntilRef = useRef(0)
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
      const draggable = !!(canManip && props.draggable && props.onDragEndPoint)
      const interactive = canManip && (!!props.onSelectPoint || draggable)
      const scheduleLongPress =
        canManip && props.onLongPressPoint
          ? (ev: ReactPointerEvent<HTMLDivElement>) => {
              const sx = ev.clientX
              const sy = ev.clientY
              let tid = window.setTimeout(() => {
                tid = 0
                longPressSuppressClickUntilRef.current = Date.now() + 450
                props.onLongPressPoint!(p.id)
              }, MAP_LONG_PRESS_MS)
              const clear = () => {
                if (tid) {
                  clearTimeout(tid)
                  tid = 0
                }
              }
              const onMove = (e: PointerEvent) => {
                if ((e.clientX - sx) ** 2 + (e.clientY - sy) ** 2 > MAP_LONG_PRESS_MOVE_PX2) clear()
              }
              const onUp = () => {
                clear()
                window.removeEventListener('pointermove', onMove)
              }
              window.addEventListener('pointermove', onMove)
              window.addEventListener('pointerup', onUp, { once: true })
              window.addEventListener('pointercancel', onUp, { once: true })
            }
          : undefined

      nodes.push(
        <Marker
          key={`wpt-ml-${p.id}`}
          longitude={p.lon}
          latitude={p.lat}
          anchor="center"
          draggable={draggable}
          style={{ zIndex: props.selectedPointId === p.id ? 40 : 20 + Math.min(i, 15) }}
          onClick={(ev) => {
            ev.originalEvent?.stopPropagation?.()
            if (Date.now() < longPressSuppressClickUntilRef.current) return
            if (canManip) props.onSelectPoint(p.id)
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
            onPointerDown={scheduleLongPress}
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

const MAP_TIME_LABEL_OFFSET_MAX = 800

function clampTimeLabelOffset(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-MAP_TIME_LABEL_OFFSET_MAX, Math.min(MAP_TIME_LABEL_OFFSET_MAX, Math.round(n)))
}

function formatTrackSubjectTime(ts: number): string {
  return formatAppDateTime(ts)
}

/** Time chips + dashed tethers; positions use screen-pixel offsets from the pin (`mapTimeLabelOffset*`). */
const TrackTimeLabelsMapLibre = memo(function TrackTimeLabelsMapLibre(props: {
  tracks: Track[]
  trackPoints: TrackPoint[]
  visibleTrackIds: Record<string, boolean>
  getRouteColor: (trackId: string) => string
  canManipulatePoint: (pointId: string) => boolean
  selectedPointId: string | null
  onSelectPoint: (id: string) => void
  onDragEndLabel?: (pointId: string, offsetX: number, offsetY: number) => void
  /** When false (zoomed out), time chips and tethers are hidden. */
  showLabels?: boolean
}) {
  const maps = useMap()
  const mapRefFromCtx = maps.current
  const [moveTick, setMoveTick] = useState(0)
  const [dragLine, setDragLine] = useState<null | { id: string; lng: number; lat: number }>(null)

  useEffect(() => {
    const map = mapRefFromCtx?.getMap()
    if (!map) return
    const bump = () => setMoveTick((n) => n + 1)
    bump()
    map.on('moveend', bump)
    map.on('zoomend', bump)
    return () => {
      map.off('moveend', bump)
      map.off('zoomend', bump)
    }
  }, [mapRefFromCtx])

  type Row = {
    point: TrackPoint
    base: string
    stepNum: number
    timeStr: string
    pinLng: number
    pinLat: number
    destLng: number
    destLat: number
    canManip: boolean
    z: number
  }

  const rows = useMemo((): Row[] => {
    if (props.showLabels === false) return []
    void moveTick
    const gl = mapRefFromCtx?.getMap()
    const byTrack = new Map<string, TrackPoint[]>()
    for (const p of props.trackPoints) {
      if (props.visibleTrackIds[p.trackId] === false) continue
      const arr = byTrack.get(p.trackId) ?? []
      arr.push(p)
      byTrack.set(p.trackId, arr)
    }
    const out: Row[] = []
    for (const track of props.tracks) {
      if (props.visibleTrackIds[track.id] === false) continue
      const pts = (byTrack.get(track.id) ?? []).slice().sort(sortTrackPointsStable).filter((p) => p.showOnMap !== false)
      const base = props.getRouteColor(track.id)
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!
        if (!p.displayTimeOnMap || p.visitedAt == null) continue
        const mx = p.mapTimeLabelOffsetX ?? 0
        const my = p.mapTimeLabelOffsetY ?? 0
        let destLng = p.lon
        let destLat = p.lat
        if (gl) {
          const anchor = gl.project([p.lon, p.lat])
          const u = gl.unproject([anchor.x + mx, anchor.y + my])
          destLng = u.lng
          destLat = u.lat
        }
        const d = dragLine?.id === p.id ? dragLine : null
        if (d) {
          destLng = d.lng
          destLat = d.lat
        }
        const canManip = !props.canManipulatePoint || props.canManipulatePoint(p.id)
        out.push({
          point: p,
          base,
          stepNum: i + 1,
          timeStr: formatTrackSubjectTime(p.visitedAt),
          pinLng: p.lon,
          pinLat: p.lat,
          destLng,
          destLat,
          canManip,
          z: 35 + Math.min(i, 12),
        })
      }
    }
    return out
  }, [
    moveTick,
    mapRefFromCtx,
    dragLine,
    props.tracks,
    props.trackPoints,
    props.visibleTrackIds,
    props.getRouteColor,
    props.canManipulatePoint,
    props.showLabels,
  ])

  const linesFc = useMemo(
    () =>
      ({
        type: 'FeatureCollection' as const,
        features: rows.map((r) => ({
          type: 'Feature' as const,
          properties: { color: r.base },
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [r.pinLng, r.pinLat],
              [r.destLng, r.destLat],
            ],
          },
        })),
      }) satisfies FeatureCollection,
    [rows],
  )

  if (!rows.length) return null

  return (
    <>
      <Source id="track-time-label-lines" type="geojson" data={linesFc}>
        <Layer
          id="track-time-label-tether"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-opacity': 0.78,
            'line-dasharray': [2, 2],
          }}
        />
      </Source>
      {rows.map((r) => {
        const sel = props.selectedPointId === r.point.id
        const draggable = !!(r.canManip && props.onDragEndLabel)
        const ring = sel ? '0 0 0 3px #111827' : '0 0 0 1px #e5e7eb'
        return (
          <Marker
            key={`time-lbl-${r.point.id}`}
            longitude={r.destLng}
            latitude={r.destLat}
            anchor="bottom"
            draggable={draggable}
            style={{ zIndex: r.z }}
            onClick={(ev) => {
              ev.originalEvent?.stopPropagation?.()
              if (r.canManip) props.onSelectPoint(r.point.id)
            }}
            onDrag={(ev) => {
              const ll = ev.lngLat
              setDragLine({ id: r.point.id, lng: ll.lng, lat: ll.lat })
            }}
            onDragEnd={(ev) => {
              setDragLine(null)
              const gl = mapRefFromCtx?.getMap()
              if (!gl || !props.onDragEndLabel || !draggable) return
              const ap = gl.project([r.pinLng, r.pinLat])
              const ll = ev.lngLat
              const ep = gl.project([ll.lng, ll.lat])
              props.onDragEndLabel(
                r.point.id,
                clampTimeLabelOffset(ep.x - ap.x),
                clampTimeLabelOffset(ep.y - ap.y),
              )
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px 3px 4px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.97)',
                border: '1px solid #e5e7eb',
                boxShadow: `${ring}, 0 1px 3px rgba(0,0,0,0.14)`,
                whiteSpace: 'nowrap',
                cursor: draggable ? 'grab' : 'pointer',
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: r.base,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              >
                {r.stepNum}
              </div>
              <span style={{ color: '#111827', fontSize: 10, fontWeight: 800 }}>{r.timeStr}</span>
            </div>
          </Marker>
        )
      })}
    </>
  )
})

/** Prefer hit-testing rendered canvass layers so taps match what the user sees (pin / fill / outline). */
function locationFromCanvassRenderedLayers(
  map: GlMap,
  point: { x: number; y: number },
  mapPins: Location[],
  locations: Location[],
): Location | null {
  const layerIds = ['canvass-pin-circles', 'canvass-fill', 'canvass-outline'] as const
  const pt: [number, number] = [point.x, point.y]
  for (const layerId of layerIds) {
    let feats: unknown[]
    try {
      feats = map.queryRenderedFeatures(pt, { layers: [layerId] })
    } catch {
      continue
    }
    if (!feats?.length) continue
    for (const f of feats) {
      const props = (f as { properties?: Record<string, unknown> }).properties
      const raw = props?.id
      const sid = typeof raw === 'string' ? raw : raw != null && typeof raw !== 'object' ? String(raw) : ''
      if (!sid) continue
      const loc = mapPins.find((x) => x.id === sid) ?? locations.find((x) => x.id === sid)
      if (loc) return loc
    }
  }
  return null
}

export type AddressesMapLibreProps = {
  caseTab: 'addresses' | 'tracking'
  defaultCenter: [number, number]
  /**
   * When set on first load, center the map here at street-level zoom instead of fitting all pins/paths.
   * Parent persists the last selected canvass location or track step per case (localStorage).
   */
  resumeMapFocus?: { lat: number; lon: number } | null
  mapPins: Location[]
  locations: Location[]
  selectedId: string | null
  footprintLoadingIds: Set<string>
  /** When set, resolves a building ring from the current map view (for queued fetches without a click hint). */
  vectorRingLookupRef: MutableRefObject<((lat: number, lon: number) => LatLon[] | null) | null>
  caseTracks: Track[]
  caseTrackPoints: TrackPoint[]
  visibleTrackIds: Record<string, boolean>
  trackingMapPoints: Array<{ lat: number; lon: number }>
  getRouteColor: (trackId: string) => string
  findHit: (lat: number, lon: number) => Location | null
  findByAddressText: (text: string) => Location | null
  onSelectLocation: (id: string) => void
  onEnsureFootprint: (
    locationId: string,
    lat: number,
    lon: number,
    addressText?: string | null,
    vectorTileBuildingRing?: LatLon[] | null,
  ) => void
  /**
   * While address autocomplete is focused / loading / showing suggestions, ignore canvass map taps
   * (selection and empty-map add). Parent normally blocks pointer events with a map shield while the field is focused.
   */
  suppressCanvassMapAdd?: boolean
  onRequestCanvassAdd: (input: {
    lat: number
    lon: number
    addressText: string
    vectorTileBuildingRing?: LatLon[] | null
  }) => void
  onCanvassAddAddressResolved?: (result: {
    lat: number
    lon: number
    addressText: string
    existingLocationId?: string
  }) => void
  outlineDoneRef: MutableRefObject<Set<string>>
  outlineInFlightRef: MutableRefObject<Set<string>>
  outlineQueuedRef: MutableRefObject<Set<string>>
  footprintFailedIds: Set<string>
  onEnqueueViewport: (
    locationId: string,
    lat: number,
    lon: number,
    addressText?: string | null,
    vectorTileBuildingRing?: LatLon[] | null,
  ) => void
  /** When true, map taps add / pick route steps like Subject tracking, even on the Video canvassing tab (probative placement). */
  placementClickAddsTrackPoint?: boolean
  /** Shared for picking route steps in both modes; map tap adds steps when `caseTab === 'tracking'` or `placementClickAddsTrackPoint`. */
  trackingInteraction: MapTrackingInteraction
  selectedTrackPointId?: string | null
  canManipulateTrackPoint: (pointId: string) => boolean
  onSelectTrackPoint: (id: string) => void
  onTrackPointDragEnd?: (pointId: string, lat: number, lon: number) => void
  onTrackTimeLabelDragEnd?: (pointId: string, offsetX: number, offsetY: number) => void
  /** Video canvassing: user held a route step — offer switching to Subject tracking. */
  onTrackStepLongPress?: (pointId: string) => void
  /** Subject tracking: user held a canvass location — offer switching to Video canvassing. */
  onCanvassLocationLongPress?: (locationId: string) => void
  /**
   * Optional: global hold on the map canvas (empty space) to toggle modes.
   * This is separate from pin/marker long-press so users can switch without targeting a specific point.
   */
  onGlobalMapLongPressToggle?: () => void
}

const AddressesMapLibreInner = forwardRef<UnifiedCaseMapHandle | null, AddressesMapLibreProps>(
  function AddressesMapLibreInner(props, ref) {
    const mapRef = useRef<MapRef>(null)
    const didFitRef = useRef(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const propsRef = useRef(props)
    // Keep ref in sync during render so map click handlers see the latest `trackingInteraction`
    // (useEffect runs too late for rapid taps before the next commit).
    propsRef.current = props

    /** After any map long-press gesture, skip the next synthetic map click (release / deferred tap). */
    const suppressNextMapClickRef = useRef(false)

    /** Pair with `mapClickPendingTimerRef`: second tap in quick succession zooms; first tap is deferred. */
    const mapClickFirstTapRef = useRef<{ t: number; x: number; y: number } | null>(null)
    const mapClickPendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    /** After dismiss-from-search UI, block canvass add/select until deferred map tap window passes (see SINGLE_TAP_DEFER_MS). */
    const suppressCanvassTapUntilRef = useRef(0)
    const mapClickPendingEventRef = useRef<MapLayerMouseEvent | null>(null)

    useEffect(() => {
      const lookup = (lat: number, lon: number): LatLon[] | null => {
        const map = mapRef.current?.getMap()
        if (!map) return null
        try {
          const style = map.getStyle()
          const declared = new Set((style?.layers ?? []).map((ly) => ly.id))
          const layers = CARTO_VECTOR_BUILDING_LAYER_IDS.filter((id) => declared.has(id))
          if (!layers.length) return null
          const pt = map.project([lon, lat])
          const feats = map.queryRenderedFeatures([pt.x, pt.y], { layers })
          return buildingFootprintRingFromRenderedFeatures(feats as Feature[], lat, lon)
        } catch {
          return null
        }
      }
      props.vectorRingLookupRef.current = lookup
      return () => {
        props.vectorRingLookupRef.current = null
      }
    })

    useImperativeHandle(ref, () => ({
      flyTo(lat, lon, zoom, opts) {
        const map = mapRef.current?.getMap()
        if (!map) return
        map.flyTo({ center: [lon, lat], zoom, duration: (opts?.duration ?? 0.6) * 1000 })
      },
      fitBounds(bounds) {
        const map = mapRef.current?.getMap()
        if (!map) return
        const sw = bounds.getSouthWest()
        const ne = bounds.getNorthEast()
        map.fitBounds(
          [
            [sw.lng, sw.lat],
            [ne.lng, ne.lat],
          ],
          { padding: 48, duration: 380 },
        )
      },
      getZoom() {
        return mapRef.current?.getMap()?.getZoom() ?? 11
      },
      clearPendingMapTap() {
        if (mapClickPendingTimerRef.current) {
          clearTimeout(mapClickPendingTimerRef.current)
          mapClickPendingTimerRef.current = null
        }
        mapClickPendingEventRef.current = null
        mapClickFirstTapRef.current = null
        suppressCanvassTapUntilRef.current = performance.now() + 450
      },
    }))

    const initialViewState = useMemo(() => {
      const r = props.resumeMapFocus
      if (r) {
        return { longitude: r.lon, latitude: r.lat, zoom: MAP_RESUME_FOCUS_ZOOM }
      }
      return {
        longitude: props.defaultCenter[1],
        latitude: props.defaultCenter[0],
        zoom: 15,
      }
    }, [props.resumeMapFocus, props.defaultCenter])

    const canvassFc = useMemo(
      () => buildCanvassCollection(props.mapPins, props.selectedId, props.footprintLoadingIds),
      [props.mapPins, props.selectedId, props.footprintLoadingIds],
    )

    const pinsFc = useMemo(
      () => buildPinCollection(props.mapPins, props.selectedId, props.footprintLoadingIds),
      [props.mapPins, props.selectedId, props.footprintLoadingIds],
    )

    const outlineLoadingPins = useMemo(() => {
      return props.mapPins.filter(
        (l) => props.footprintLoadingIds.has(l.id) && !(l.footprint && l.footprint.length >= 3),
      )
    }, [props.mapPins, props.footprintLoadingIds])

    const tracksData = useMemo(
      () => buildTracksData(props.caseTracks, props.caseTrackPoints, props.visibleTrackIds, props.getRouteColor),
      [props.caseTracks, props.caseTrackPoints, props.visibleTrackIds, props.getRouteColor],
    )

    const [mapZoom, setMapZoom] = useState(15)
    const showDetailOverlays = mapZoom >= MAP_DETAIL_MIN_ZOOM

    const trackWptClusterFc = useMemo(
      () =>
        buildTrackWaypointClusterCollection(
          props.caseTracks,
          props.caseTrackPoints,
          props.visibleTrackIds,
          props.getRouteColor,
        ),
      [props.caseTracks, props.caseTrackPoints, props.visibleTrackIds, props.getRouteColor],
    )

    const canvassLocClusterFc = useMemo(() => buildCanvassLocationClusterCollection(props.mapPins), [props.mapPins])

    const flushPreload = useCallback(() => {
      const p = propsRef.current
      const map = mapRef.current?.getMap()
      if (!map) return
      const mb = map.getBounds()
      const lb = L.latLngBounds(L.latLng(mb.getSouth(), mb.getWest()), L.latLng(mb.getNorth(), mb.getEast()))
      if (!lb.isValid()) return
      const padded = lb.pad(VIEWPORT_OUTLINE_PRELOAD_BOUNDS_PAD)
      const c = map.getCenter()
      const clat = c.lat
      const clng = c.lng

      const candidates = p.mapPins.filter((loc) => {
        if (loc.footprint && loc.footprint.length >= 3) return false
        if (p.outlineDoneRef.current.has(loc.id)) return false
        if (p.outlineInFlightRef.current.has(loc.id)) return false
        if (p.outlineQueuedRef.current.has(loc.id)) return false
        if (p.footprintFailedIds.has(loc.id)) return false
        return padded.contains(L.latLng(loc.lat, loc.lon))
      })
      candidates.sort((a, b) => {
        const da = (a.lat - clat) ** 2 + (a.lon - clng) ** 2
        const db = (b.lat - clat) ** 2 + (b.lon - clng) ** 2
        return da - db
      })
      const n = Math.min(VIEWPORT_OUTLINE_PRELOAD_MAX, candidates.length)
      for (let i = 0; i < n; i++) {
        const loc = candidates[i]!
        p.onEnqueueViewport(loc.id, loc.lat, loc.lon, loc.addressText, null)
      }
    }, [])

    const schedulePreload = useCallback(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        flushPreload()
      }, VIEWPORT_OUTLINE_PRELOAD_DEBOUNCE_MS)
    }, [flushPreload])

    const onLoad = useCallback(() => {
      if (didFitRef.current) return
      didFitRef.current = true
      const map = mapRef.current?.getMap()
      if (!map) return
      const p = propsRef.current
      const focus = p.resumeMapFocus
      if (focus) {
        map.jumpTo({ center: [focus.lon, focus.lat], zoom: MAP_RESUME_FOCUS_ZOOM })
        setMapZoom(map.getZoom())
        setTimeout(schedulePreload, 650)
        return
      }
      let b = extendBoundsWithLocations(null, p.mapPins)
      b = extendBoundsWithPathPoints(b, p.trackingMapPoints)
      if (b && b.isValid()) {
        const sw = b.getSouthWest()
        const ne = b.getNorthEast()
        map.fitBounds(
          [
            [sw.lng, sw.lat],
            [ne.lng, ne.lat],
          ],
          { padding: 56, duration: 0 },
        )
        setMapZoom(map.getZoom())
        setTimeout(schedulePreload, 650)
        return
      }
      const caseEmpty = p.locations.length === 0 && p.caseTrackPoints.length === 0
      if (caseEmpty && navigator.geolocation) {
        setMapZoom(map.getZoom())
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const m = mapRef.current?.getMap()
            if (!m) return
            m.flyTo({
              center: [pos.coords.longitude, pos.coords.latitude],
              zoom: Math.max(m.getZoom(), 16),
              duration: 600,
            })
            setMapZoom(m.getZoom())
            setTimeout(schedulePreload, 650)
          },
          () => {
            setTimeout(schedulePreload, 650)
          },
          { enableHighAccuracy: true, timeout: 8000 },
        )
        return
      }
      setMapZoom(map.getZoom())
      setTimeout(schedulePreload, 650)
    }, [schedulePreload])

    const syncZoomAndPreload = useCallback(() => {
      const map = mapRef.current?.getMap()
      if (map) setMapZoom(map.getZoom())
      schedulePreload()
    }, [schedulePreload])

    useEffect(() => {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
      }
    }, [])

    useEffect(() => {
      schedulePreload()
    }, [props.mapPins, schedulePreload])

    useEffect(() => {
      return () => {
        if (mapClickPendingTimerRef.current) clearTimeout(mapClickPendingTimerRef.current)
      }
    }, [])

    useEffect(() => {
      if (props.caseTab !== 'tracking' || !props.onCanvassLocationLongPress) return

      let alive = true
      let poll: ReturnType<typeof setInterval> | null = null
      let detachCanvasListeners: (() => void) | null = null

      const attach = (map: GlMap) => {
        const canvas = map.getCanvas()
        let holdTimer: ReturnType<typeof setTimeout> | null = null
        let downPt: { x: number; y: number } | null = null
        let client0: { x: number; y: number } | null = null
        let capturedId: number | null = null

        const releaseCapture = () => {
          if (capturedId == null) return
          try {
            canvas.releasePointerCapture(capturedId)
          } catch {
            /* ignore */
          }
          capturedId = null
        }

        const clearHold = () => {
          if (holdTimer) {
            clearTimeout(holdTimer)
            holdTimer = null
          }
          releaseCapture()
          downPt = null
          client0 = null
        }

        const canvasPoint = (ev: PointerEvent) => {
          const r = canvas.getBoundingClientRect()
          return { x: ev.clientX - r.left, y: ev.clientY - r.top }
        }

        const onDown = (ev: PointerEvent) => {
          const p = propsRef.current
          if (p.caseTab !== 'tracking' || !p.onCanvassLocationLongPress) return
          if (ev.pointerType === 'mouse' && ev.button !== 0) return
          clearHold()
          try {
            canvas.setPointerCapture(ev.pointerId)
            capturedId = ev.pointerId
          } catch {
            /* ignore */
          }
          client0 = { x: ev.clientX, y: ev.clientY }
          downPt = canvasPoint(ev)
          holdTimer = window.setTimeout(() => {
            holdTimer = null
            const cur = propsRef.current
            if (!downPt || cur.caseTab !== 'tracking' || !cur.onCanvassLocationLongPress) return
            const hit = locationFromCanvassRenderedLayers(map, downPt, cur.mapPins, cur.locations)
            if (hit) {
              if (mapClickPendingTimerRef.current) {
                clearTimeout(mapClickPendingTimerRef.current)
                mapClickPendingTimerRef.current = null
              }
              mapClickPendingEventRef.current = null
              mapClickFirstTapRef.current = null
              suppressNextMapClickRef.current = true
              cur.onCanvassLocationLongPress(hit.id)
            }
            downPt = null
            client0 = null
          }, MAP_LONG_PRESS_MS)
        }

        const onMove = (ev: PointerEvent) => {
          if (!client0) return
          if ((ev.clientX - client0.x) ** 2 + (ev.clientY - client0.y) ** 2 > MAP_LONG_PRESS_MOVE_PX2) clearHold()
        }

        const onUp = () => clearHold()

        canvas.addEventListener('pointerdown', onDown)
        canvas.addEventListener('pointermove', onMove)
        canvas.addEventListener('pointerup', onUp)
        canvas.addEventListener('pointercancel', onUp)

        return () => {
          clearHold()
          canvas.removeEventListener('pointerdown', onDown)
          canvas.removeEventListener('pointermove', onMove)
          canvas.removeEventListener('pointerup', onUp)
          canvas.removeEventListener('pointercancel', onUp)
        }
      }

      const tryAttach = () => {
        const map = mapRef.current?.getMap()
        if (!map || !alive) return false
        if (detachCanvasListeners) detachCanvasListeners()
        detachCanvasListeners = attach(map)
        return true
      }

      if (!tryAttach()) {
        poll = setInterval(() => {
          if (tryAttach() && poll) {
            clearInterval(poll)
            poll = null
          }
        }, 50)
      }

      return () => {
        alive = false
        if (poll) clearInterval(poll)
        if (detachCanvasListeners) detachCanvasListeners()
        detachCanvasListeners = null
      }
    }, [props.caseTab, props.onCanvassLocationLongPress])

    const tryResolveTrackHit = useCallback(
      (map: GlMap, clickPx: { x: number; y: number }, ti: MapTrackingInteraction): 'picked' | 'blocked' | 'none' => {
        const h = resolveTrackHitAtPixel(map, clickPx, ti)
        if (h.kind === 'picked') {
          ti.onPickPoint(h.pointId)
          return 'picked'
        }
        if (h.kind === 'blocked') return 'blocked'
        return 'none'
      },
      [],
    )

    // Global hold: empty map only (pointer events work for touch and mouse).
    useEffect(() => {
      if (!props.onGlobalMapLongPressToggle) return

      let alive = true
      let poll: ReturnType<typeof setInterval> | null = null
      let detachCanvasListeners: (() => void) | null = null

      const attach = (map: GlMap) => {
        const canvas = map.getCanvas()
        let holdTimer: ReturnType<typeof setTimeout> | null = null
        let downPt: { x: number; y: number } | null = null
        let client0: { x: number; y: number } | null = null
        let capturedId: number | null = null

        const releaseCapture = () => {
          if (capturedId == null) return
          try {
            canvas.releasePointerCapture(capturedId)
          } catch {
            /* ignore */
          }
          capturedId = null
        }

        const clearHold = () => {
          if (holdTimer) {
            clearTimeout(holdTimer)
            holdTimer = null
          }
          releaseCapture()
          downPt = null
          client0 = null
        }

        const canvasPoint = (ev: PointerEvent) => {
          const r = canvas.getBoundingClientRect()
          return { x: ev.clientX - r.left, y: ev.clientY - r.top }
        }

        const onDown = (ev: PointerEvent) => {
          const cur = propsRef.current
          if (!cur.onGlobalMapLongPressToggle) return
          if (ev.pointerType === 'mouse' && ev.button !== 0) return
          clearHold()
          try {
            canvas.setPointerCapture(ev.pointerId)
            capturedId = ev.pointerId
          } catch {
            /* ignore */
          }
          client0 = { x: ev.clientX, y: ev.clientY }
          downPt = canvasPoint(ev)
          holdTimer = window.setTimeout(() => {
            holdTimer = null
            const cur2 = propsRef.current
            if (!downPt || !cur2.onGlobalMapLongPressToggle || !map) {
              clearHold()
              return
            }

            const trackHit = resolveTrackHitAtPixel(map, downPt, cur2.trackingInteraction)
            if (trackHit.kind !== 'none') {
              clearHold()
              return
            }
            if (locationFromCanvassRenderedLayers(map, downPt, cur2.mapPins, cur2.locations)) {
              clearHold()
              return
            }

            if (mapClickPendingTimerRef.current) {
              clearTimeout(mapClickPendingTimerRef.current)
              mapClickPendingTimerRef.current = null
            }
            mapClickPendingEventRef.current = null
            mapClickFirstTapRef.current = null

            suppressNextMapClickRef.current = true
            cur2.onGlobalMapLongPressToggle()
            clearHold()
          }, MAP_LONG_PRESS_MS)
        }

        const onMove = (ev: PointerEvent) => {
          if (!client0) return
          if ((ev.clientX - client0.x) ** 2 + (ev.clientY - client0.y) ** 2 > MAP_LONG_PRESS_MOVE_PX2) clearHold()
        }

        const onUp = () => clearHold()

        canvas.addEventListener('pointerdown', onDown)
        canvas.addEventListener('pointermove', onMove)
        canvas.addEventListener('pointerup', onUp)
        canvas.addEventListener('pointercancel', onUp)

        return () => {
          clearHold()
          canvas.removeEventListener('pointerdown', onDown)
          canvas.removeEventListener('pointermove', onMove)
          canvas.removeEventListener('pointerup', onUp)
          canvas.removeEventListener('pointercancel', onUp)
        }
      }

      const tryAttach = () => {
        const map = mapRef.current?.getMap()
        if (!map || !alive) return false
        if (detachCanvasListeners) detachCanvasListeners()
        detachCanvasListeners = attach(map)
        return true
      }

      if (!tryAttach()) {
        poll = setInterval(() => {
          if (tryAttach() && poll) {
            clearInterval(poll)
            poll = null
          }
        }, 50)
      }

      return () => {
        alive = false
        if (poll) clearInterval(poll)
        if (detachCanvasListeners) detachCanvasListeners()
        detachCanvasListeners = null
      }
    }, [props.onGlobalMapLongPressToggle])

    const runMapClickInteraction = useCallback(
      (e: MapLayerMouseEvent) => {
        const p = propsRef.current
        if (suppressNextMapClickRef.current) {
          suppressNextMapClickRef.current = false
          return
        }
        if (
          p.caseTab === 'addresses' &&
          (p.suppressCanvassMapAdd || performance.now() < suppressCanvassTapUntilRef.current)
        )
          return
        const map = mapRef.current?.getMap()
        const lat = e.lngLat.lat
        const lon = e.lngLat.lng
        const ti = p.trackingInteraction
        const z = map?.getZoom() ?? MAP_DETAIL_MIN_ZOOM
        const lowZoom = !!(map && z < MAP_DETAIL_MIN_ZOOM)

        const vectorRingAtClick = (): LatLon[] | null => {
          if (!map) return null
          const declared = new Set((map.getStyle().layers ?? []).map((l) => l.id))
          const layers = CARTO_VECTOR_BUILDING_LAYER_IDS.filter((id) => declared.has(id))
          if (!layers.length) return null
          const feats = map.queryRenderedFeatures(e.point, { layers })
          return buildingFootprintRingFromRenderedFeatures(feats as Feature[], lat, lon)
        }

        if (lowZoom && map) {
          if (p.caseTab === 'tracking' || p.placementClickAddsTrackPoint) {
            const tClusters = map.queryRenderedFeatures(e.point, { layers: ['track-wpts-cluster-circle'] })
            if (tClusters[0] && easeClusterExpansion(map, 'track-wpts-cluster-src', tClusters[0] as Feature)) return
            const tPts = map.queryRenderedFeatures(e.point, { layers: ['track-wpts-unclustered', 'track-wpts-stepnum'] })
            for (const f of tPts) {
              const pid = f.properties?.pid
              if (typeof pid === 'string' && pid) {
                ti.onPickPoint(pid)
                return
              }
            }
          }
          const cClusters = map.queryRenderedFeatures(e.point, { layers: ['canvass-loc-cluster-circle'] })
          if (cClusters[0] && easeClusterExpansion(map, 'canvass-loc-cluster-src', cClusters[0] as Feature)) return
          const cPts = map.queryRenderedFeatures(e.point, { layers: ['canvass-loc-unclustered'] })
          const locId = cPts[0]?.properties?.locId
          if (typeof locId === 'string' && locId) {
            p.onSelectLocation(locId)
            const hitLoc = p.mapPins.find((x) => x.id === locId) ?? p.findHit(lat, lon)
            if (hitLoc && (!hitLoc.footprint || hitLoc.footprint.length < 3)) {
              const vectorRing = vectorRingAtClick()
              p.onEnsureFootprint(hitLoc.id, hitLoc.lat, hitLoc.lon, hitLoc.addressText, vectorRing)
            }
            return
          }
        }

        if ((p.caseTab === 'tracking' || p.placementClickAddsTrackPoint) && map) {
          const th = tryResolveTrackHit(map, e.point, ti)
          if (th === 'picked' || th === 'blocked') return
          if (ti.addDisabled) return
          ti.onAddPoint(lat, lon)
          return
        }

        let vectorRing: LatLon[] | null = null
        if (map) {
          vectorRing = vectorRingAtClick()
        }

        let hitLoc: Location | null = null
        if (map) {
          hitLoc = locationFromCanvassRenderedLayers(map, e.point, p.mapPins, p.locations)
        }
        if (!hitLoc) {
          hitLoc = p.findHit(lat, lon)
        }
        if (hitLoc) {
          p.onSelectLocation(hitLoc.id)
          if (!hitLoc.footprint || hitLoc.footprint.length < 3) {
            p.onEnsureFootprint(hitLoc.id, hitLoc.lat, hitLoc.lon, hitLoc.addressText, vectorRing)
          }
          return
        }

        if (map) {
          const th = tryResolveTrackHit(map, e.point, ti)
          if (th === 'picked' || th === 'blocked') return
        }

        const provisional = `Lat ${lat.toFixed(5)}, Lon ${lon.toFixed(5)}`
        p.onRequestCanvassAdd({ lat, lon, addressText: provisional, vectorTileBuildingRing: vectorRing })
        void (async () => {
          const addressText = (await reverseGeocodeAddressText(lat, lon).catch(() => null)) ?? provisional
          const text = addressText ?? provisional
          const cur = propsRef.current
          const match = cur.findHit(lat, lon) ?? cur.findByAddressText(text)
          if (match) {
            cur.onCanvassAddAddressResolved?.({
              lat,
              lon,
              addressText: text,
              existingLocationId: match.id,
            })
            return
          }
          cur.onCanvassAddAddressResolved?.({ lat, lon, addressText: text })
        })()
      },
      [tryResolveTrackHit],
    )

    const DOUBLE_TAP_MAX_MS = 340
    const DOUBLE_TAP_MAX_DIST_PX = 40
    const SINGLE_TAP_DEFER_MS = 270

    const onClick = useCallback(
      (e: MapLayerMouseEvent) => {
        if (suppressNextMapClickRef.current) {
          suppressNextMapClickRef.current = false
          if (mapClickPendingTimerRef.current) {
            clearTimeout(mapClickPendingTimerRef.current)
            mapClickPendingTimerRef.current = null
          }
          mapClickPendingEventRef.current = null
          mapClickFirstTapRef.current = null
          return
        }

        const p = propsRef.current
        if (p.caseTab === 'tracking' || p.placementClickAddsTrackPoint) {
          runMapClickInteraction(e)
          return
        }

        const map = mapRef.current?.getMap()
        if (map && p.selectedId) {
          const quick = locationFromCanvassRenderedLayers(map, e.point, p.mapPins, p.locations)
          const geomHit = p.findHit(e.lngLat.lat, e.lngLat.lng)
          const reTapSelected =
            (quick?.id === p.selectedId) || (geomHit?.id === p.selectedId)
          if (reTapSelected) {
            if (mapClickPendingTimerRef.current) {
              clearTimeout(mapClickPendingTimerRef.current)
              mapClickPendingTimerRef.current = null
            }
            mapClickPendingEventRef.current = null
            mapClickFirstTapRef.current = null
            runMapClickInteraction(e)
            return
          }
        }

        const now = performance.now()
        const { x, y } = e.point
        const first = mapClickFirstTapRef.current
        const isSecondOfDouble =
          first != null &&
          now - first.t < DOUBLE_TAP_MAX_MS &&
          (x - first.x) ** 2 + (y - first.y) ** 2 < DOUBLE_TAP_MAX_DIST_PX ** 2

        if (isSecondOfDouble) {
          if (mapClickPendingTimerRef.current) {
            clearTimeout(mapClickPendingTimerRef.current)
            mapClickPendingTimerRef.current = null
          }
          mapClickPendingEventRef.current = null
          mapClickFirstTapRef.current = null
          const map = mapRef.current?.getMap()
          if (map) {
            const curZ = map.getZoom()
            map.easeTo({
              center: [e.lngLat.lng, e.lngLat.lat],
              zoom: Math.min(curZ + 1.25, 22),
              duration: 240,
            })
          }
          return
        }

        if (mapClickPendingTimerRef.current) {
          clearTimeout(mapClickPendingTimerRef.current)
          mapClickPendingTimerRef.current = null
          const prevEv = mapClickPendingEventRef.current
          mapClickPendingEventRef.current = null
          if (prevEv) runMapClickInteraction(prevEv)
        }

        mapClickFirstTapRef.current = { t: now, x, y }
        mapClickPendingEventRef.current = e
        mapClickPendingTimerRef.current = setTimeout(() => {
          mapClickPendingTimerRef.current = null
          mapClickPendingEventRef.current = null
          mapClickFirstTapRef.current = null
          runMapClickInteraction(e)
        }, SINGLE_TAP_DEFER_MS)
      },
      [runMapClickInteraction],
    )

    return (
      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={CARTO_VOYAGER_STYLE}
        style={{ width: '100%', height: '100%' }}
        doubleClickZoom={false}
        onClick={onClick}
        onLoad={onLoad}
        onMoveEnd={syncZoomAndPreload}
        onZoomEnd={syncZoomAndPreload}
      >
        <NavigationControl position="top-left" showCompass={false} />

        <Source id="canvass-geo" type="geojson" data={canvassFc}>
          <Layer
            id="canvass-fill"
            type="fill"
            paint={{
              'fill-color': ['get', 'fill'],
              'fill-opacity': ['get', 'fillOpacity'],
            }}
          />
          <Layer
            id="canvass-outline"
            type="line"
            paint={{
              'line-color': ['get', 'line'],
              'line-width': ['get', 'lineWidth'],
              'line-opacity': ['get', 'lineOpacity'],
            }}
          />
        </Source>

        <Source id="canvass-pins" type="geojson" data={pinsFc}>
          <Layer
            id="canvass-pin-circles"
            type="circle"
            minzoom={MAP_DETAIL_MIN_ZOOM}
            paint={{
              'circle-radius': ['get', 'radius'],
              'circle-color': ['get', 'color'],
              'circle-stroke-width': ['get', 'strokeW'],
              'circle-stroke-color': '#ffffff',
            }}
          />
        </Source>

        {outlineLoadingPins.map((l) => (
          <Marker
            key={`outline-load-${l.id}`}
            longitude={l.lon}
            latitude={l.lat}
            anchor="center"
            style={{ zIndex: 2 }}
            onClick={(e) => {
              const ev = (e as { originalEvent?: MouseEvent }).originalEvent
              ev?.stopPropagation?.()
              props.onSelectLocation(l.id)
            }}
          >
            <div className="canvass-footprint-loading-wrap" style={{ color: statusColor(l.status) }}>
              <span className="canvass-footprint-loading-core" aria-hidden="true" />
              <span className="canvass-footprint-loading-dot" aria-hidden="true" />
            </div>
          </Marker>
        ))}

        <Source id="travel-lines" type="geojson" data={tracksData.lines}>
          <Layer
            id="travel-line-layer"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 4,
              'line-opacity': 0.95,
            }}
          />
        </Source>

        <Source
          id="canvass-loc-cluster-src"
          type="geojson"
          data={canvassLocClusterFc}
          cluster
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          clusterRadius={CLUSTER_RADIUS_PX}
        >
          <Layer
            id="canvass-loc-cluster-circle"
            type="circle"
            filter={['has', 'point_count']}
            maxzoom={MAP_DETAIL_MIN_ZOOM}
            paint={{
              'circle-color': '#374151',
              'circle-radius': 22,
              'circle-opacity': 0.92,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            }}
          />
          <Layer
            id="canvass-loc-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            maxzoom={MAP_DETAIL_MIN_ZOOM}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 13,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
          <Layer
            id="canvass-loc-unclustered"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            maxzoom={MAP_DETAIL_MIN_ZOOM}
            paint={{
              'circle-color': ['get', 'color'],
              'circle-radius': 9,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.95,
            }}
          />
        </Source>

        <Source
          id="track-wpts-cluster-src"
          type="geojson"
          data={trackWptClusterFc}
          cluster
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          clusterRadius={CLUSTER_RADIUS_PX}
        >
          <Layer
            id="track-wpts-cluster-circle"
            type="circle"
            filter={['has', 'point_count']}
            maxzoom={MAP_DETAIL_MIN_ZOOM}
            paint={{
              'circle-color': '#1e3a8a',
              'circle-radius': 22,
              'circle-opacity': 0.92,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            }}
          />
          <Layer
            id="track-wpts-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            maxzoom={MAP_DETAIL_MIN_ZOOM}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 13,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
          <Layer
            id="track-wpts-unclustered"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            maxzoom={MAP_DETAIL_MIN_ZOOM}
            paint={{
              'circle-color': ['get', 'color'],
              'circle-radius': 11,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.95,
            }}
          />
          <Layer
            id="track-wpts-stepnum"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            maxzoom={MAP_DETAIL_MIN_ZOOM}
            layout={{
              'text-field': ['to-string', ['get', 'stepNum']],
              'text-size': 11,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
        </Source>

        <TrackWaypointMarkersMapLibre
          tracks={props.caseTracks}
          trackPoints={props.caseTrackPoints}
          visibleTrackIds={props.visibleTrackIds}
          selectedPointId={props.selectedTrackPointId ?? null}
          getRouteColor={props.getRouteColor}
          canManipulatePoint={props.canManipulateTrackPoint}
          onSelectPoint={props.onSelectTrackPoint}
          draggable={props.caseTab === 'tracking'}
          onDragEndPoint={props.onTrackPointDragEnd}
          onLongPressPoint={props.caseTab === 'addresses' ? props.onTrackStepLongPress : undefined}
          showMarkers={showDetailOverlays}
        />

        <TrackTimeLabelsMapLibre
          tracks={props.caseTracks}
          trackPoints={props.caseTrackPoints}
          visibleTrackIds={props.visibleTrackIds}
          getRouteColor={props.getRouteColor}
          canManipulatePoint={props.canManipulateTrackPoint}
          selectedPointId={props.selectedTrackPointId ?? null}
          onSelectPoint={props.onSelectTrackPoint}
          onDragEndLabel={props.onTrackTimeLabelDragEnd}
          showLabels={showDetailOverlays}
        />
      </MapGL>
    )
  },
)

export const AddressesMapLibre = memo(AddressesMapLibreInner)
