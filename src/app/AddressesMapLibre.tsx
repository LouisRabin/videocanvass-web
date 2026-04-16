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
} from 'react'
import { flushSync } from 'react-dom'
import MapGL, { Layer, Marker, Source, useMap, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre'
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
  pointInPolygonLatLon,
  ringAreaSqMetersApprox,
} from '../lib/vectorTileBuilding'

// See docs/CODEMAP.md; geocode/footprint policy in docs/HANDOFF.md.

const MAP_LONG_PRESS_MS = 550
const MAP_LONG_PRESS_MOVE_PX2 = 64

/** Skip viewport preload / resize work while the WebView is backgrounded (battery + pointless queue work). */
function mapHeavyWorkPaused(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function mapContainerHasSize(map: GlMap): boolean {
  try {
    const r = map.getContainer().getBoundingClientRect()
    return r.width >= 2 && r.height >= 2
  } catch {
    return false
  }
}

/**
 * MapLibre's compact attribution initializes with `maplibregl-compact-show`, which shows full text.
 * Strip it so only the "i" chip shows until the user toggles (same as MapLibre's own collapse state).
 */
function collapseMaplibreAttributionToCompactChip(map: GlMap) {
  const el = map.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-attrib.maplibregl-compact')
  if (!el?.classList.contains('maplibregl-compact-show')) return
  el.classList.remove('maplibregl-compact-show')
  el.setAttribute('open', '')
}

/*
 * Table of contents (main component below):
 * - Exported type: UnifiedCaseMapHandle
 * - Memoized subcomponents: TrackWaypointMarkersMapLibre, TrackTimeLabelsMapLibre
 * - AddressesMapLibreInner: ref/imperative handle, map setup, sources/layers, clustering, events
 */

import {
  buildAddressClusterPointCollection,
  buildCanvassCollection,
  buildPinCollection,
  buildTrackWaypointClusterCollection,
  buildTracksData,
  extendBoundsWithLocations,
  extendBoundsWithPathPoints,
  MAP_CLUSTER_MAX_ZOOM,
  MAP_CLUSTER_RADIUS,
  MAP_DETAIL_MIN_ZOOM,
  MAP_RESUME_FOCUS_ZOOM,
  sortTrackPointsStable,
  VC_MAP_MAX_ZOOM,
  VIEWPORT_OUTLINE_PRELOAD_BOUNDS_PAD,
  VIEWPORT_OUTLINE_PRELOAD_DEBOUNCE_MS,
  VIEWPORT_OUTLINE_PRELOAD_MAX,
  patchCartoBuildingTopFootprintAlignment,
  resolveCaseMapBasemapStyle,
  type VcCaseMapBasemapId,
} from './addressesMapLibreHelpers'
import { TrackWaypointMarkersMapLibre } from './addressesMapLibre/TrackWaypointMarkers'

export type CaseExportSnapshotMode = 'full' | 'addresses' | 'tracks'

export type UnifiedCaseMapHandle = {
  flyTo: (lat: number, lon: number, zoom: number, opts?: { duration?: number }) => void
  fitBounds: (bounds: InstanceType<typeof L.LatLngBounds>) => void
  /** Fit map to the bounding box of the given WGS84 coordinates (padding + short animation). */
  fitToCoordinates: (coords: { lat: number; lon: number }[]) => void
  getZoom: () => number
  /** Current map center for Photon address-search bias when user has not used Locate me. */
  getCenter: () => { lat: number; lon: number } | null
  /** Cancel deferred canvass single-tap so a dismiss tap does not select/add after overlay/pointer guard handling. */
  clearPendingMapTap: () => void
  /** Ignore map click handling until `performance.now()` + ms (extends any existing deadline). */
  suppressMapClicksFor: (ms: number) => void
  /**
   * Temporarily adjusts layer visibility + DOM track decorations, fits to the same bounds as Fit all / Fit canvass / Fit paths, waits for idle, returns PNG data URL.
   * Restores view + layers afterward. May return null if the map/canvas is unavailable or tiles taint the canvas (CORS).
   */
  captureExportSnapshot: (opts: {
    mode: CaseExportSnapshotMode
    /** Leaflet bounds from the same helpers as Fit all / Fit canvass / Fit paths (includes address footprint extent). */
    leafletBounds: InstanceType<typeof L.LatLngBounds> | null
    /** When `mode` is `tracks`, render only this path (lines + pins) for the snapshot. */
    onlyTrackId?: string
  }) => Promise<string | null>
}

/** Layer ids owned by this map for export visibility toggling (ignore if missing in style). */
const EXPORT_CANVASS_LAYERS = [
  'canvass-fill',
  'canvass-outline',
  'canvass-pin-circles',
  'canvass-clusters',
  'canvass-cluster-count',
  'canvass-cluster-unclustered',
] as const
const EXPORT_TRACK_LINE_LAYERS = ['travel-line-layer-subject', 'travel-line-layer-coordinate'] as const
const EXPORT_TRACK_POINT_LAYERS = [
  'track-wpts-unclustered',
  'track-wpts-stepnum',
  'track-wpts-clusters',
  'track-wpts-cluster-count',
] as const
const EXPORT_HEAT_LAYER = 'visit-heat-layer'

const EXPORT_ALL_TOGGLE_LAYERS = [
  ...EXPORT_CANVASS_LAYERS,
  ...EXPORT_TRACK_LINE_LAYERS,
  ...EXPORT_TRACK_POINT_LAYERS,
  EXPORT_HEAT_LAYER,
] as const

function tryGetLayerVisibility(map: GlMap, layerId: string): string | undefined {
  try {
    const v = map.getLayoutProperty(layerId, 'visibility')
    return typeof v === 'string' ? v : undefined
  } catch {
    return undefined
  }
}

function trySetLayerVisibility(map: GlMap, layerId: string, visibility: 'visible' | 'none') {
  try {
    map.setLayoutProperty(layerId, 'visibility', visibility)
  } catch {
    /* layer may not exist (heatmap off, etc.) */
  }
}

/** MapLibre GeoJSON source with clustering (method optional for older typings). */
type GeoJsonClusterSourceLike = {
  getClusterExpansionZoom?: (clusterId: number) => Promise<number>
}

/**
 * Low-zoom: tap a merged cluster → ease to expansion zoom so individual pins/footprints can be picked.
 * Returns true when a cluster was hit (consumes the click).
 */
function tryHandleClusterClickZoom(map: GlMap, e: MapLayerMouseEvent): boolean {
  if (map.getZoom() >= MAP_DETAIL_MIN_ZOOM) return false
  let feats: ReturnType<GlMap['queryRenderedFeatures']>
  try {
    feats = map.queryRenderedFeatures([e.point.x, e.point.y], {
      layers: ['canvass-clusters', 'track-wpts-clusters'],
    })
  } catch {
    return false
  }
  const top = feats[0] as
    | {
        properties?: Record<string, unknown>
        geometry?: { type?: string; coordinates?: [number, number] }
        layer?: { id?: string }
      }
    | undefined
  if (!top?.properties) return false
  const cidRaw = top.properties.cluster_id
  const clusterId = typeof cidRaw === 'number' ? cidRaw : typeof cidRaw === 'string' ? Number(cidRaw) : NaN
  if (!Number.isFinite(clusterId)) return false

  const layerId = top.layer?.id ?? ''
  const sourceId = layerId.startsWith('canvass-') ? 'canvass-cluster-src' : 'track-wpts-cluster-src'
  const coords = top.geometry?.coordinates
  if (!coords || coords.length < 2) return false

  const src = map.getSource(sourceId) as GeoJsonClusterSourceLike | undefined
  const exp = src?.getClusterExpansionZoom?.(clusterId)
  const bump = () => {
    try {
      map.easeTo({
        center: coords,
        zoom: Math.min(map.getZoom() + 2, VC_MAP_MAX_ZOOM),
        duration: 320,
      })
    } catch {
      /* ignore */
    }
  }
  if (exp) {
    void exp
      .then((z) => {
        if (Number.isFinite(z)) {
          try {
            map.easeTo({
              center: coords,
              zoom: Math.min(z + 0.25, VC_MAP_MAX_ZOOM),
              duration: 380,
            })
          } catch {
            bump()
          }
        } else bump()
      })
      .catch(() => bump())
  } else {
    bump()
  }
  return true
}

function waitMapIdle(map: GlMap, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(t)
      map.off('idle', onIdle)
      resolve()
    }
    const t = setTimeout(finish, timeoutMs)
    const onIdle = () => finish()
    map.once('idle', onIdle)
  })
}

function raf2(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

type MapTrackingInteraction = {
  trackPoints: TrackPoint[]
  visibleTrackIds: Record<string, boolean>
  canManipulateTrackPoint: (pointId: string) => boolean
  /** When provided and returns false, the step is skipped for hit-testing (still drawn). Used to keep imported coordinates out of Subject tracking picking. */
  canPickTrackPoint?: (pointId: string) => boolean
  onPickPoint: (pointId: string) => void
  onAddPoint: (lat: number, lon: number) => void
  addDisabled: boolean
  pickRadiusPx?: number
}

const MAP_TIME_LABEL_OFFSET_MAX = 800
/**
 * When no custom drag position is saved (0,0), place the time chip off the pin so it does not cover the step marker.
 * Screen space: +x right, +y down. Marker uses anchor="bottom", so negative y pulls the label upward from the pin.
 */
const DEFAULT_MAP_TIME_LABEL_OFFSET_X = 40
const DEFAULT_MAP_TIME_LABEL_OFFSET_Y = -56

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
  onDoubleTapTrackPoint?: (pointId: string) => void
  onDragEndLabel?: (pointId: string, offsetX: number, offsetY: number) => void
  /** When false (zoomed out), time chips and tethers are hidden. */
  showLabels?: boolean
  mapLeftToolDockOpenRef?: MutableRefObject<boolean>
  blockMapCanvasPointerEvents?: boolean
}) {
  const maps = useMap()
  const mapRefFromCtx = maps.current
  const timeLabelDblTapRef = useRef<{ id: string; t: number; x: number; y: number } | null>(null)
  const TL_DBL_MS = 340
  const TL_DBL_DIST = 40
  const [moveTick, setMoveTick] = useState(0)
  const [dragLine, setDragLine] = useState<null | { id: string; lng: number; lat: number }>(null)

  useEffect(() => {
    const map = mapRefFromCtx?.getMap()
    if (!map) return
    const bump = () => {
      if (mapHeavyWorkPaused()) return
      setMoveTick((n) => n + 1)
    }
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
        let mx = p.mapTimeLabelOffsetX ?? 0
        let my = p.mapTimeLabelOffsetY ?? 0
        if (mx === 0 && my === 0) {
          mx = DEFAULT_MAP_TIME_LABEL_OFFSET_X
          my = DEFAULT_MAP_TIME_LABEL_OFFSET_Y
        }
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
        const draggable = !!(r.canManip && props.onDragEndLabel && !props.blockMapCanvasPointerEvents)
        const ring = sel ? '0 0 0 3px #111827' : '0 0 0 1px #e5e7eb'
        return (
          <Marker
            key={`time-lbl-${r.point.id}`}
            longitude={r.destLng}
            latitude={r.destLat}
            anchor="bottom"
            draggable={draggable}
            style={{ zIndex: r.z, pointerEvents: props.blockMapCanvasPointerEvents ? 'none' : 'auto' }}
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
                  const pid = r.point.id
                  const prev = timeLabelDblTapRef.current
                  if (
                    prev &&
                    prev.id === pid &&
                    now - prev.t < TL_DBL_MS &&
                    (cx - prev.x) ** 2 + (cy - prev.y) ** 2 < TL_DBL_DIST ** 2
                  ) {
                    timeLabelDblTapRef.current = null
                    props.onDoubleTapTrackPoint(pid)
                    return
                  }
                  timeLabelDblTapRef.current = { id: pid, t: now, x: cx, y: cy }
                }
              }
              if (!r.canManip) return
              props.onSelectPoint(r.point.id)
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

/** Canvass features under the tap pixel, MapLibre paint order (top-most first). */
function collectCanvassLayerLocationsAtPointOrdered(
  map: GlMap,
  point: { x: number; y: number },
  mapPins: Location[],
  locations: Location[],
): Location[] {
  const pt: [number, number] = [point.x, point.y]
  const ordered: Location[] = []
  const seen = new Set<string>()
  let feats: unknown[]
  try {
    feats = map.queryRenderedFeatures(pt, {
      layers: [
        'canvass-pin-circles',
        'canvass-outline',
        'canvass-fill',
        'canvass-cluster-unclustered',
      ],
    })
  } catch {
    return ordered
  }
  if (!feats?.length) return ordered
  for (const f of feats) {
    const props = (f as { properties?: Record<string, unknown> }).properties
    const raw = props?.id
    const sid = typeof raw === 'string' ? raw : raw != null && typeof raw !== 'object' ? String(raw) : ''
    if (!sid) continue
    const loc = mapPins.find((xx) => xx.id === sid) ?? locations.find((xx) => xx.id === sid)
    if (loc && !seen.has(loc.id)) {
      seen.add(loc.id)
      ordered.push(loc)
    }
  }
  return ordered
}

function closedFootprintRingForHitTest(fp: NonNullable<Location['footprint']>): LatLon[] {
  if (fp.length < 3) return fp as LatLon[]
  const a = fp[0]!
  const b = fp[fp.length - 1]!
  if (a[0] === b[0] && a[1] === b[1]) return fp as LatLon[]
  return [...(fp as LatLon[]), a]
}

/** All visible pins whose saved footprint contains the tap (WGS84). */
function locationsWithFootprintContainingLngLat(
  mapPins: Location[],
  lngLat: { lat: number; lng: number },
): Location[] {
  const pt: LatLon = [lngLat.lat, lngLat.lng]
  const out: Location[] = []
  for (const l of mapPins) {
    if (!l.footprint || l.footprint.length < 3) continue
    if (pointInPolygonLatLon(pt, closedFootprintRingForHitTest(l.footprint))) out.push(l)
  }
  return out
}

/**
 * Prefer geography over WebGL stack: stacked footprints may not all appear in
 * `queryRenderedFeatures` at one pixel. Among pins whose footprint contains the tap, return the
 * only match, or the **smallest** ring if several overlap.
 */
function pickSingleLocationFromFootprintContainingLngLat(
  mapPins: Location[],
  lngLat: { lat: number; lng: number },
): Location | null {
  const containing = locationsWithFootprintContainingLngLat(mapPins, lngLat)
  if (containing.length === 0) return null
  if (containing.length === 1) return containing[0]!
  containing.sort((a, b) => ringAreaSqMetersApprox(a.footprint!) - ringAreaSqMetersApprox(b.footprint!))
  return containing[0]!
}

/**
 * When several canvass polygons overlap at a pixel, `queryRenderedFeatures` order is paint/stack
 * order — not geography. Prefer the footprint that **contains** the click lng/lat; if several
 * (bad overlaps), prefer the **smallest** parcel by ring area.
 */
function pickCanvassLocationFromRenderedHits(
  paintOrderCandidates: Location[],
  lngLat: { lat: number; lng: number },
): Location | null {
  if (!paintOrderCandidates.length) return null
  const pt: LatLon = [lngLat.lat, lngLat.lng]
  const withFp = paintOrderCandidates.filter((l) => l.footprint && l.footprint.length >= 3)
  const containing = withFp.filter((l) => pointInPolygonLatLon(pt, closedFootprintRingForHitTest(l.footprint!)))
  if (containing.length === 1) return containing[0]!
  if (containing.length > 1) {
    containing.sort(
      (a, b) => ringAreaSqMetersApprox(a.footprint!) - ringAreaSqMetersApprox(b.footprint!),
    )
    return containing[0]!
  }
  return paintOrderCandidates[0]!
}

/**
 * Canvass tap: **geo-first** over all `mapPins` with footprints (stacked buildings), then
 * `queryRenderedFeatures` + `pickCanvassLocationFromRenderedHits` for pins/bounds-only hits.
 */
function resolveCanvassTapLocation(
  map: GlMap | null | undefined,
  point: { x: number; y: number },
  mapPins: Location[],
  locations: Location[],
  lngLat: { lat: number; lng: number },
): Location | null {
  if (!map) return null
  const geoPick = pickSingleLocationFromFootprintContainingLngLat(mapPins, lngLat)
  if (geoPick) return geoPick
  const ordered = collectCanvassLayerLocationsAtPointOrdered(map, point, mapPins, locations)
  return pickCanvassLocationFromRenderedHits(ordered, lngLat)
}

type AddressesMapLibreProps = {
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
  /** Subset for lines/clusters/markers when parent simplifies dense tracks; defaults to `caseTrackPoints`. */
  caseTrackPointsForMap?: TrackPoint[]
  visibleTrackIds: Record<string, boolean>
  trackingMapPoints: Array<{ lat: number; lon: number }>
  getRouteColor: (trackId: string) => string
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
   * While floating address search is active (same conditions as the map shield in CasePage), ignore all map tap
   * resolution: canvass pick/add and tracking adds — not only on the Video canvassing tab.
   */
  addrSearchBlocksMapClicks?: boolean
  /** Parent sets `current` to a `performance.now()` deadline after dismissing search so deferred taps are ignored. */
  mapInteractionFreezeUntilRef?: MutableRefObject<number>
  /** Narrow map tools dock open: block all tap resolution (tracking pick/add, canvass add), not only `onSelectLocation`. */
  mapLeftToolDockOpenRef?: MutableRefObject<boolean>
  /**
   * When true: MapLibre drag/touch handlers off, no `onClick` callback, `pointer-events: none` on container/canvas,
   * and markers ignore hits. Used while the map tools dock is open so phones cannot select through WebGL/markers.
   */
  blockMapCanvasPointerEvents?: boolean
  onRequestCanvassAdd: (input: {
    lat: number
    lon: number
    addressText: string
    vectorTileBuildingRing?: LatLon[] | null
  }) => void
  onCanvassAddAddressResolved?: (result: { lat: number; lon: number; addressText: string }) => void
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
  /** Video canvassing: long-press map (not on selected address or any route step) → switch to Subject tracking. */
  onTabLongPressSwitchToTracking?: () => void
  /** Subject tracking: long-press empty map → switch to Video canvassing. */
  onTabLongPressSwitchToAddresses?: () => void
  /** Subject tracking: long-press an unselected route step or address → confirm, then switch to Video canvassing. */
  onTrackingUnselectedFeatureLongPress?: (payload: { kind: 'track' | 'loc'; id: string }) => void
  /** Double-tap a route step (map or marker): parent switches to Subject tracking and opens step notes. */
  onDoubleTapTrackPoint?: (pointId: string) => void
  /** Double-tap a canvass location: parent switches to Video canvassing and opens address notes. */
  onDoubleTapLocation?: (locationId: string) => void
  /** Visit-density heatmap (GeoJSON points with `weight`); drawn under canvass polygons. */
  visitHeatmapGeojson?: FeatureCollection | null
  showVisitHeatmap?: boolean
  basemap: VcCaseMapBasemapId
  /** When false, MapLibre attribution (“i”) is hidden — used on narrow phones to free corner space. */
  showAttributionControl?: boolean
}

const TRACK_HIT_LAYERS = ['track-wpts-stepnum', 'track-wpts-unclustered'] as const
const CANVASS_HIT_LAYERS = [
  'canvass-pin-circles',
  'canvass-outline',
  'canvass-fill',
  'canvass-cluster-unclustered',
] as const

function pickTrackPointIdAtPixel(map: GlMap, point: { x: number; y: number }): string | null {
  let feats: ReturnType<GlMap['queryRenderedFeatures']>
  try {
    feats = map.queryRenderedFeatures([point.x, point.y], { layers: [...TRACK_HIT_LAYERS] })
  } catch {
    return null
  }
  for (const f of feats) {
    const pid = f.properties?.pid
    // Hit any rendered waypoint (including import-coordinate steps). tryResolveTrackHit then
    // picks, blocks, or allows add — skipping import-only pids here caused new steps on top of them.
    if (typeof pid === 'string' && pid) return pid
  }
  return null
}

/** Track vs canvass from top-most rendered feature under the pixel (no pick radius). */
function resolveFeatureHitAtPoint(
  map: GlMap,
  point: { x: number; y: number },
  p: AddressesMapLibreProps,
  lngLat: { lat: number; lng: number },
): { kind: 'track'; id: string } | { kind: 'loc'; id: string } | null {
  const pointPx: [number, number] = [point.x, point.y]
  const wantTrack = p.caseTab === 'tracking' || p.placementClickAddsTrackPoint
  const wantLoc = p.caseTab === 'addresses' && !p.placementClickAddsTrackPoint

  const layers: string[] = []
  if (wantTrack) layers.push(...TRACK_HIT_LAYERS)
  if (wantLoc) layers.push(...CANVASS_HIT_LAYERS)
  if (!layers.length) return null

  let feats: ReturnType<GlMap['queryRenderedFeatures']>
  try {
    feats = map.queryRenderedFeatures(pointPx, { layers })
  } catch {
    return null
  }
  if (!feats?.length) {
    if (wantLoc) {
      const geoPick = pickSingleLocationFromFootprintContainingLngLat(p.mapPins, lngLat)
      if (geoPick) return { kind: 'loc', id: geoPick.id }
    }
    return null
  }

  const canvassCandidates: Location[] = []
  const canvassSeen = new Set<string>()

  for (const f of feats) {
    const layerId = (f as { layer?: { id?: string } }).layer?.id ?? ''
    if (
      wantTrack &&
      (layerId === 'track-wpts-stepnum' || layerId === 'track-wpts-unclustered')
    ) {
      const pid = f.properties?.pid
      if (typeof pid === 'string' && pid) {
        return { kind: 'track', id: pid }
      }
    }
    if (
      wantLoc &&
      (layerId === 'canvass-pin-circles' ||
        layerId === 'canvass-outline' ||
        layerId === 'canvass-fill' ||
        layerId === 'canvass-cluster-unclustered')
    ) {
      const raw = f.properties?.id
      const sid = typeof raw === 'string' ? raw : raw != null && typeof raw !== 'object' ? String(raw) : ''
      if (!sid) continue
      const loc = p.mapPins.find((l) => l.id === sid) ?? p.locations.find((l) => l.id === sid)
      if (loc && !canvassSeen.has(loc.id)) {
        canvassSeen.add(loc.id)
        canvassCandidates.push(loc)
      }
    }
  }

  if (wantLoc) {
    const geoPick = pickSingleLocationFromFootprintContainingLngLat(p.mapPins, lngLat)
    if (geoPick) return { kind: 'loc', id: geoPick.id }
    if (canvassCandidates.length) {
      const picked = pickCanvassLocationFromRenderedHits(canvassCandidates, lngLat)
      if (picked) return { kind: 'loc', id: picked.id }
    }
  }
  return null
}

function resolveDoubleTapDeepLink(
  map: GlMap,
  e: MapLayerMouseEvent,
  p: AddressesMapLibreProps,
): { kind: 'track'; id: string } | { kind: 'loc'; id: string } | null {
  return resolveFeatureHitAtPoint(map, e.point, p, e.lngLat)
}

const AddressesMapLibreInner = forwardRef<UnifiedCaseMapHandle | null, AddressesMapLibreProps>(
  function AddressesMapLibreInner(props, ref) {
    const { vectorRingLookupRef } = props
    const mapRef = useRef<MapRef>(null)
    const mapShellRef = useRef<HTMLDivElement>(null)
    const didFitRef = useRef(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const propsRef = useRef(props)
    // Keep ref in sync during render so map click handlers see the latest `trackingInteraction`
    // (useEffect runs too late for rapid taps before the next commit).
    propsRef.current = props

    /** Pair with `mapClickPendingTimerRef`: second tap in quick succession zooms; first tap is deferred. */
    const mapClickFirstTapRef = useRef<{ t: number; x: number; y: number; locId?: string } | null>(null)
    const mapClickPendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const mapClickPendingEventRef = useRef<MapLayerMouseEvent | null>(null)
    /** After hold-to-switch tab, ignore map clicks until this deadline (pointer-up still synthesizes a click). */
    const mapClickSuppressUntilRef = useRef(0)

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
      vectorRingLookupRef.current = lookup
      return () => {
        vectorRingLookupRef.current = null
      }
    })

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

    const mapStyle = useMemo(() => resolveCaseMapBasemapStyle(props.basemap), [props.basemap])

    useEffect(() => {
      const map = mapRef.current?.getMap()
      if (!map) return
      if (props.showAttributionControl === false) return
      const run = () => collapseMaplibreAttributionToCompactChip(map)
      run()
      const t = window.setTimeout(run, 80)
      const t2 = window.setTimeout(run, 240)
      return () => {
        window.clearTimeout(t)
        window.clearTimeout(t2)
      }
    }, [mapStyle, props.showAttributionControl])

    const canvassFc = useMemo(
      () => buildCanvassCollection(props.mapPins, props.selectedId, props.footprintLoadingIds),
      [props.mapPins, props.selectedId, props.footprintLoadingIds],
    )

    const pinsFc = useMemo(
      () => buildPinCollection(props.mapPins, props.selectedId, props.footprintLoadingIds),
      [props.mapPins, props.selectedId, props.footprintLoadingIds],
    )

    const addressClusterFc = useMemo(
      () => buildAddressClusterPointCollection(props.mapPins, props.selectedId),
      [props.mapPins, props.selectedId],
    )

    const outlineLoadingPins = useMemo(() => {
      return props.mapPins.filter(
        (l) => props.footprintLoadingIds.has(l.id) && !(l.footprint && l.footprint.length >= 3),
      )
    }, [props.mapPins, props.footprintLoadingIds])

    const trackPtsForMap = props.caseTrackPointsForMap ?? props.caseTrackPoints

    /** During PDF per-path map capture: show only that track so other paths are not in the screenshot. */
    const [exportPathSnapshotTrackId, setExportPathSnapshotTrackId] = useState<string | null>(null)
    const visibleTrackIdsForMap = useMemo(() => {
      if (exportPathSnapshotTrackId == null) return props.visibleTrackIds
      const next: Record<string, boolean> = {}
      for (const t of props.caseTracks) {
        next[t.id] = t.id === exportPathSnapshotTrackId
      }
      return next
    }, [exportPathSnapshotTrackId, props.caseTracks, props.visibleTrackIds])

    const canManipulateTrackPointOnMap = useCallback(
      (id: string) =>
        props.canManipulateTrackPoint(id) &&
        (!props.trackingInteraction.canPickTrackPoint || props.trackingInteraction.canPickTrackPoint(id)),
      [props.canManipulateTrackPoint, props.trackingInteraction.canPickTrackPoint],
    )

    const tracksData = useMemo(
      () => buildTracksData(props.caseTracks, trackPtsForMap, visibleTrackIdsForMap, props.getRouteColor),
      [props.caseTracks, trackPtsForMap, visibleTrackIdsForMap, props.getRouteColor],
    )

    const [mapZoom, setMapZoom] = useState(15)
    const showDetailOverlays = mapZoom >= MAP_DETAIL_MIN_ZOOM
    const lowZoomClusterUi = mapZoom < MAP_DETAIL_MIN_ZOOM
    const detailOverlayVisibility: 'visible' | 'none' = lowZoomClusterUi ? 'none' : 'visible'
    const clusterOverlayVisibility: 'visible' | 'none' = lowZoomClusterUi ? 'visible' : 'none'
    /** During PDF export “addresses only” snapshot: hide DOM track markers/labels (lines stay WebGL). */
    const [exportHideDomTrackDecor, setExportHideDomTrackDecor] = useState(false)
    const showTrackDomOverlays = showDetailOverlays && !exportHideDomTrackDecor

    useImperativeHandle(ref, () => ({
      flyTo(lat, lon, zoom, opts) {
        const map = mapRef.current?.getMap()
        if (!map) return
        const z = Math.min(zoom, VC_MAP_MAX_ZOOM)
        map.flyTo({ center: [lon, lat], zoom: z, duration: (opts?.duration ?? 0.6) * 1000 })
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
      fitToCoordinates(coords) {
        const map = mapRef.current?.getMap()
        if (!map || coords.length === 0) return
        let minLat = coords[0]!.lat
        let maxLat = coords[0]!.lat
        let minLon = coords[0]!.lon
        let maxLon = coords[0]!.lon
        for (const p of coords) {
          minLat = Math.min(minLat, p.lat)
          maxLat = Math.max(maxLat, p.lat)
          minLon = Math.min(minLon, p.lon)
          maxLon = Math.max(maxLon, p.lon)
        }
        if (minLat === maxLat && minLon === maxLon) {
          map.flyTo({ center: [minLon, minLat], zoom: Math.max(map.getZoom(), 15), duration: 450 })
          return
        }
        map.fitBounds(
          [
            [minLon, minLat],
            [maxLon, maxLat],
          ],
          { padding: 56, duration: 450 },
        )
      },
      getZoom() {
        return mapRef.current?.getMap()?.getZoom() ?? 11
      },
      getCenter() {
        const map = mapRef.current?.getMap()
        if (!map) return null
        const c = map.getCenter()
        return { lat: c.lat, lon: c.lng }
      },
      clearPendingMapTap() {
        if (mapClickPendingTimerRef.current) {
          clearTimeout(mapClickPendingTimerRef.current)
          mapClickPendingTimerRef.current = null
        }
        mapClickPendingEventRef.current = null
        mapClickFirstTapRef.current = null
      },
      suppressMapClicksFor(ms: number) {
        if (!(ms > 0)) return
        const until = performance.now() + ms
        if (until > mapClickSuppressUntilRef.current) {
          mapClickSuppressUntilRef.current = until
        }
      },
      async captureExportSnapshot(opts: {
        mode: CaseExportSnapshotMode
        leafletBounds: InstanceType<typeof L.LatLngBounds> | null
        onlyTrackId?: string
      }) {
        const map = mapRef.current?.getMap()
        const b = opts.leafletBounds
        if (!map || !b || !b.isValid()) return null
        const center = map.getCenter()
        const zoom = map.getZoom()
        const prevVis = new Map<string, string | undefined>()
        for (const id of EXPORT_ALL_TOGGLE_LAYERS) {
          prevVis.set(id, tryGetLayerVisibility(map, id))
        }
        const applyMode = (mode: CaseExportSnapshotMode) => {
          const showC = mode === 'full' || mode === 'addresses'
          const showT = mode === 'full' || mode === 'tracks'
          const showHeat = mode === 'full' || mode === 'addresses'
          const low = map.getZoom() < MAP_DETAIL_MIN_ZOOM
          const canvassDetailIds = ['canvass-fill', 'canvass-outline', 'canvass-pin-circles'] as const
          const canvassClusterIds = ['canvass-clusters', 'canvass-cluster-count', 'canvass-cluster-unclustered'] as const
          const trackDetailIds = ['track-wpts-unclustered', 'track-wpts-stepnum'] as const
          const trackClusterIds = ['track-wpts-clusters', 'track-wpts-cluster-count'] as const
          for (const id of canvassDetailIds) trySetLayerVisibility(map, id, showC && !low ? 'visible' : 'none')
          for (const id of canvassClusterIds) trySetLayerVisibility(map, id, showC && low ? 'visible' : 'none')
          for (const id of EXPORT_TRACK_LINE_LAYERS) trySetLayerVisibility(map, id, showT ? 'visible' : 'none')
          for (const id of trackDetailIds) trySetLayerVisibility(map, id, showT && !low ? 'visible' : 'none')
          for (const id of trackClusterIds) trySetLayerVisibility(map, id, showT && low ? 'visible' : 'none')
          trySetLayerVisibility(map, EXPORT_HEAT_LAYER, showHeat ? 'visible' : 'none')
        }
        let dataUrl: string | null = null
        try {
          applyMode(opts.mode)
          const singleTrackId = opts.mode === 'tracks' && opts.onlyTrackId ? opts.onlyTrackId : null
          flushSync(() => {
            setExportHideDomTrackDecor(opts.mode === 'addresses')
            setExportPathSnapshotTrackId(singleTrackId)
          })
          await raf2()
          const sw = b.getSouthWest()
          const ne = b.getNorthEast()
          map.fitBounds(
            [
              [sw.lng, sw.lat],
              [ne.lng, ne.lat],
            ],
            { padding: 48, duration: 0 },
          )
          await waitMapIdle(map, 8000)
          applyMode(opts.mode)
          await raf2()
          try {
            dataUrl = map.getCanvas().toDataURL('image/png')
          } catch {
            dataUrl = null
          }
        } catch {
          dataUrl = null
        } finally {
          for (const id of EXPORT_ALL_TOGGLE_LAYERS) {
            const prev = prevVis.get(id)
            try {
              if (prev === 'none' || prev === 'visible') {
                map.setLayoutProperty(id, 'visibility', prev)
              } else {
                map.setLayoutProperty(id, 'visibility', 'visible')
              }
            } catch {
              /* ignore */
            }
          }
          flushSync(() => {
            setExportHideDomTrackDecor(false)
            setExportPathSnapshotTrackId(null)
          })
          try {
            map.jumpTo({ center, zoom })
          } catch {
            /* ignore */
          }
        }
        return dataUrl
      },
    }))

    const trackWptClusterFc = useMemo(
      () =>
        buildTrackWaypointClusterCollection(
          props.caseTracks,
          trackPtsForMap,
          visibleTrackIdsForMap,
          props.getRouteColor,
        ),
      [props.caseTracks, trackPtsForMap, visibleTrackIdsForMap, props.getRouteColor],
    )

    const visitHeatmapFc = useMemo(() => {
      if (!props.showVisitHeatmap) return null
      const g = props.visitHeatmapGeojson
      if (!g?.features?.length) return null
      return g
    }, [props.showVisitHeatmap, props.visitHeatmapGeojson])

    const flushPreload = useCallback(() => {
      if (mapHeavyWorkPaused()) return
      const p = propsRef.current
      const map = mapRef.current?.getMap()
      if (!map || !mapContainerHasSize(map)) return
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

    const syncMapContainerPointerBlock = useCallback(() => {
      const map = mapRef.current?.getMap()
      if (!map) return
      const block = propsRef.current.blockMapCanvasPointerEvents
      const pe = block ? 'none' : ''
      map.getContainer().style.pointerEvents = pe
      map.getCanvasContainer().style.pointerEvents = pe
      map.getCanvas().style.pointerEvents = pe
    }, [])

    useEffect(() => {
      syncMapContainerPointerBlock()
      return () => {
        const map = mapRef.current?.getMap()
        if (!map) return
        map.getContainer().style.pointerEvents = ''
        map.getCanvasContainer().style.pointerEvents = ''
        map.getCanvas().style.pointerEvents = ''
      }
    }, [props.blockMapCanvasPointerEvents, syncMapContainerPointerBlock])

    const onStyledataPointerBlockHandler = useCallback(() => {
      const map = mapRef.current?.getMap()
      if (map) patchCartoBuildingTopFootprintAlignment(map)
      if (propsRef.current.blockMapCanvasPointerEvents) syncMapContainerPointerBlock()
    }, [syncMapContainerPointerBlock])

    useEffect(() => {
      return () => {
        mapRef.current?.getMap()?.off('styledata', onStyledataPointerBlockHandler)
      }
    }, [onStyledataPointerBlockHandler])

    const onLoad = useCallback(() => {
      const map0 = mapRef.current?.getMap()
      if (map0) {
        patchCartoBuildingTopFootprintAlignment(map0)
        queueMicrotask(() => patchCartoBuildingTopFootprintAlignment(map0))
        requestAnimationFrame(() => patchCartoBuildingTopFootprintAlignment(map0))
        map0.off('styledata', onStyledataPointerBlockHandler)
        map0.on('styledata', onStyledataPointerBlockHandler)
        if (propsRef.current.showAttributionControl !== false) {
          queueMicrotask(() => {
            requestAnimationFrame(() => collapseMaplibreAttributionToCompactChip(map0))
          })
        }
      }
      queueMicrotask(() => syncMapContainerPointerBlock())
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
              zoom: Math.min(Math.max(m.getZoom(), 16), VC_MAP_MAX_ZOOM),
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
    }, [schedulePreload, syncMapContainerPointerBlock, onStyledataPointerBlockHandler])

    const syncZoomAndPreload = useCallback(() => {
      if (mapHeavyWorkPaused()) return
      const map = mapRef.current?.getMap()
      if (!map || !mapContainerHasSize(map)) return
      setMapZoom(map.getZoom())
      schedulePreload()
      patchCartoBuildingTopFootprintAlignment(map)
    }, [schedulePreload])

    useEffect(() => {
      const onVis = () => {
        if (mapHeavyWorkPaused()) {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current)
            debounceRef.current = null
          }
          return
        }
        requestAnimationFrame(() => {
          const map = mapRef.current?.getMap()
          if (!map || !mapContainerHasSize(map)) return
          try {
            map.resize()
          } catch {
            /* ignore */
          }
          setMapZoom(map.getZoom())
          schedulePreload()
        })
      }
      document.addEventListener('visibilitychange', onVis)
      return () => document.removeEventListener('visibilitychange', onVis)
    }, [schedulePreload])

    useEffect(() => {
      const shell = mapShellRef.current
      if (!shell || typeof ResizeObserver === 'undefined') return
      let raf: number | null = null
      const run = () => {
        if (mapHeavyWorkPaused()) return
        const map = mapRef.current?.getMap()
        if (!map || !mapContainerHasSize(map)) return
        try {
          map.resize()
        } catch {
          /* ignore */
        }
        setMapZoom(map.getZoom())
        schedulePreload()
      }
      const ro = new ResizeObserver(() => {
        if (raf != null) cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          raf = null
          run()
        })
      })
      ro.observe(shell)
      return () => {
        ro.disconnect()
        if (raf != null) cancelAnimationFrame(raf)
      }
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
      const needListeners =
        (props.caseTab === 'addresses' && !!props.onTabLongPressSwitchToTracking) ||
        (props.caseTab === 'tracking' &&
          (!!props.onTabLongPressSwitchToAddresses || !!props.onTrackingUnselectedFeatureLongPress))
      if (!needListeners) return

      let alive = true
      let poll: ReturnType<typeof setInterval> | null = null
      let detachCanvasListeners: (() => void) | null = null

      const attach = (map: GlMap) => {
        const canvas = map.getCanvas()
        let holdTimer: ReturnType<typeof setTimeout> | null = null
        let downPt: { x: number; y: number } | null = null
        let client0: { x: number; y: number } | null = null

        const clearHold = () => {
          if (holdTimer) {
            clearTimeout(holdTimer)
            holdTimer = null
          }
          downPt = null
          client0 = null
        }

        const canvasPoint = (ev: PointerEvent) => {
          const r = canvas.getBoundingClientRect()
          return { x: ev.clientX - r.left, y: ev.clientY - r.top }
        }

        const suppressPendingClick = () => {
          if (mapClickPendingTimerRef.current) {
            clearTimeout(mapClickPendingTimerRef.current)
            mapClickPendingTimerRef.current = null
          }
          mapClickPendingEventRef.current = null
          mapClickFirstTapRef.current = null
          mapClickSuppressUntilRef.current = performance.now() + 900
        }

        const onDown = (ev: PointerEvent) => {
          const p = propsRef.current
          const addrs = p.caseTab === 'addresses' && !!p.onTabLongPressSwitchToTracking
          const trk = p.caseTab === 'tracking'
          if (!addrs && !trk) return
          if (addrs && p.placementClickAddsTrackPoint) return
          if (performance.now() < (p.mapInteractionFreezeUntilRef?.current ?? 0)) return
          if (p.addrSearchBlocksMapClicks) return
          if (p.blockMapCanvasPointerEvents) return
          if (p.mapLeftToolDockOpenRef?.current) return
          if (ev.pointerType === 'mouse' && ev.button !== 0) return
          clearHold()
          client0 = { x: ev.clientX, y: ev.clientY }
          downPt = canvasPoint(ev)
          holdTimer = window.setTimeout(() => {
            holdTimer = null
            const cur = propsRef.current
            if (!downPt) return

            const addrsNow = cur.caseTab === 'addresses' && !!cur.onTabLongPressSwitchToTracking
            const trkNow = cur.caseTab === 'tracking'
            if (!addrsNow && !trkNow) {
              downPt = null
              client0 = null
              return
            }
            if (addrsNow && cur.placementClickAddsTrackPoint) {
              downPt = null
              client0 = null
              return
            }

            const lngLatAtDown = map.unproject([downPt.x, downPt.y])
            const hit = resolveFeatureHitAtPoint(map, downPt, cur, {
              lat: lngLatAtDown.lat,
              lng: lngLatAtDown.lng,
            })
            const selAddr = cur.selectedId ?? null
            const selTrack = cur.selectedTrackPointId ?? null

            if (addrsNow) {
              if (hit?.kind === 'track') {
                downPt = null
                client0 = null
                return
              }
              if (hit?.kind === 'loc' && hit.id === selAddr) {
                downPt = null
                client0 = null
                return
              }
              suppressPendingClick()
              cur.onTabLongPressSwitchToTracking?.()
              downPt = null
              client0 = null
              return
            }

            // Subject tracking
            if (!hit) {
              suppressPendingClick()
              cur.onTabLongPressSwitchToAddresses?.()
              downPt = null
              client0 = null
              return
            }
            if (hit.kind === 'track') {
              if (hit.id === selTrack) {
                downPt = null
                client0 = null
                return
              }
              suppressPendingClick()
              cur.onTrackingUnselectedFeatureLongPress?.({ kind: 'track', id: hit.id })
              downPt = null
              client0 = null
              return
            }
            if (hit.id === selAddr) {
              downPt = null
              client0 = null
              return
            }
            suppressPendingClick()
            cur.onTrackingUnselectedFeatureLongPress?.({ kind: 'loc', id: hit.id })
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
    }, [
      props.caseTab,
      props.placementClickAddsTrackPoint,
      props.onTabLongPressSwitchToTracking,
      props.onTabLongPressSwitchToAddresses,
      props.onTrackingUnselectedFeatureLongPress,
    ])

    const tryResolveTrackHit = useCallback(
      (map: GlMap, clickPx: { x: number; y: number }, ti: MapTrackingInteraction): 'picked' | 'blocked' | 'none' => {
        const pid = pickTrackPointIdAtPixel(map, clickPx)
        if (!pid) return 'none'
        if (ti.canManipulateTrackPoint(pid)) {
          ti.onPickPoint(pid)
          return 'picked'
        }
        return 'blocked'
      },
      [],
    )

    const runMapClickInteraction = useCallback(
      (e: MapLayerMouseEvent) => {
        const p = propsRef.current
        if (p.blockMapCanvasPointerEvents) return
        if (p.mapLeftToolDockOpenRef?.current) return
        if (performance.now() < mapClickSuppressUntilRef.current) return
        if (performance.now() < (p.mapInteractionFreezeUntilRef?.current ?? 0)) return
        if (p.addrSearchBlocksMapClicks) return
        const map = mapRef.current?.getMap()
        if (map && tryHandleClusterClickZoom(map, e)) return
        const lat = e.lngLat.lat
        const lon = e.lngLat.lng
        const ti = p.trackingInteraction
        const vectorRingAtClick = (): LatLon[] | null => {
          if (!map) return null
          const declared = new Set((map.getStyle().layers ?? []).map((l) => l.id))
          const layers = CARTO_VECTOR_BUILDING_LAYER_IDS.filter((id) => declared.has(id))
          if (!layers.length) return null
          const feats = map.queryRenderedFeatures(e.point, { layers })
          return buildingFootprintRingFromRenderedFeatures(feats as Feature[], lat, lon)
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

        const preferGeom = p.caseTab === 'addresses' && !p.placementClickAddsTrackPoint
        const hitLoc = preferGeom ? resolveCanvassTapLocation(map, e.point, p.mapPins, p.locations, e.lngLat) : null
        if (hitLoc) {
          p.onSelectLocation(hitLoc.id)
          if (!hitLoc.footprint || hitLoc.footprint.length < 3) {
            p.onEnsureFootprint(hitLoc.id, hitLoc.lat, hitLoc.lon, hitLoc.addressText, vectorRing)
          }
          return
        }

        const provisional = `Lat ${lat.toFixed(5)}, Lon ${lon.toFixed(5)}`
        p.onRequestCanvassAdd({ lat, lon, addressText: provisional, vectorTileBuildingRing: vectorRing })
        void (async () => {
          const addressText = (await reverseGeocodeAddressText(lat, lon).catch(() => null)) ?? provisional
          const text = addressText ?? provisional
          propsRef.current.onCanvassAddAddressResolved?.({ lat, lon, addressText: text })
        })()
      },
      [tryResolveTrackHit],
    )

    const DOUBLE_TAP_MAX_MS = 340
    const DOUBLE_TAP_MAX_DIST_PX = 40
    const SINGLE_TAP_DEFER_MS = 270

    const onClick = useCallback(
      (e: MapLayerMouseEvent) => {
        const p = propsRef.current
        if (p.blockMapCanvasPointerEvents) return
        if (p.mapLeftToolDockOpenRef?.current) return
        if (performance.now() < (p.mapInteractionFreezeUntilRef?.current ?? 0)) return
        if (p.addrSearchBlocksMapClicks) return
        if (performance.now() < mapClickSuppressUntilRef.current) {
          if (mapClickPendingTimerRef.current) {
            clearTimeout(mapClickPendingTimerRef.current)
            mapClickPendingTimerRef.current = null
          }
          mapClickPendingEventRef.current = null
          mapClickFirstTapRef.current = null
          return
        }

        if (p.placementClickAddsTrackPoint) {
          runMapClickInteraction(e)
          return
        }

        const map = mapRef.current?.getMap()
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

          if (map && p.onDoubleTapTrackPoint && p.onDoubleTapLocation) {
            const target = resolveDoubleTapDeepLink(map, e, p)
            if (target?.kind === 'track') p.onDoubleTapTrackPoint(target.id)
            else if (target?.kind === 'loc') p.onDoubleTapLocation(target.id)
            else {
              const curZ = map.getZoom()
              map.easeTo({
                center: [e.lngLat.lng, e.lngLat.lat],
                zoom: Math.min(curZ + 1.25, VC_MAP_MAX_ZOOM),
                duration: 240,
              })
            }
            return
          }

          if (map) {
            const curZ = map.getZoom()
            map.easeTo({
              center: [e.lngLat.lng, e.lngLat.lat],
              zoom: Math.min(curZ + 1.25, VC_MAP_MAX_ZOOM),
              duration: 240,
            })
          }
          return
        }

        if (map && p.caseTab === 'addresses' && p.selectedId && !p.placementClickAddsTrackPoint) {
          const tapHit = resolveCanvassTapLocation(map, e.point, p.mapPins, p.locations, e.lngLat)
          const reTapSelected = tapHit?.id === p.selectedId
          if (reTapSelected) {
            const sel = p.selectedId
            const first = mapClickFirstTapRef.current
            if (
              p.onDoubleTapLocation &&
              first &&
              first.locId === sel &&
              now - first.t < DOUBLE_TAP_MAX_MS &&
              (x - first.x) ** 2 + (y - first.y) ** 2 < DOUBLE_TAP_MAX_DIST_PX ** 2
            ) {
              if (mapClickPendingTimerRef.current) {
                clearTimeout(mapClickPendingTimerRef.current)
                mapClickPendingTimerRef.current = null
              }
              mapClickPendingEventRef.current = null
              mapClickFirstTapRef.current = null
              p.onDoubleTapLocation(sel)
              return
            }
            if (mapClickPendingTimerRef.current) {
              clearTimeout(mapClickPendingTimerRef.current)
              mapClickPendingTimerRef.current = null
            }
            mapClickPendingEventRef.current = null
            runMapClickInteraction(e)
            mapClickFirstTapRef.current = { t: now, x, y, locId: sel }
            return
          }
        }

        if (map && p.caseTab === 'tracking') {
          const tidPeek = pickTrackPointIdAtPixel(map, e.point)
          const selTrack = p.selectedTrackPointId ?? null
          // Switching to another route step (or first selection): run immediately — the deferred path
          // made one click feel like two. Keep firstTap after pick so a second tap can still be a double-tap.
          if (tidPeek && tidPeek !== selTrack) {
            if (mapClickPendingTimerRef.current) {
              clearTimeout(mapClickPendingTimerRef.current)
              mapClickPendingTimerRef.current = null
            }
            mapClickPendingEventRef.current = null
            runMapClickInteraction(e)
            mapClickFirstTapRef.current = { t: performance.now(), x: e.point.x, y: e.point.y }
            return
          }
          if (tidPeek && tidPeek === selTrack) {
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

    const mapHandlersOn = !props.blockMapCanvasPointerEvents

    const hideAttrib = props.showAttributionControl === false

    return (
      <div
        ref={mapShellRef}
        data-vc-hide-map-attribution={hideAttrib ? 'true' : undefined}
        style={{
          width: '100%',
          height: '100%',
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={mapStyle}
        maxZoom={VC_MAP_MAX_ZOOM}
        /** Required for PDF export: default WebGL clears the drawing buffer after compositing, so `toDataURL` is often blank. */
        canvasContextAttributes={{ preserveDrawingBuffer: true }}
        style={{ width: '100%', height: '100%' }}
        doubleClickZoom={false}
        dragPan={mapHandlersOn}
        scrollZoom={mapHandlersOn}
        boxZoom={mapHandlersOn}
        dragRotate={mapHandlersOn}
        keyboard={mapHandlersOn}
        touchZoomRotate={mapHandlersOn}
        touchPitch={mapHandlersOn}
        attributionControl={props.showAttributionControl === false ? false : { compact: true }}
        onClick={mapHandlersOn ? onClick : undefined}
        onLoad={onLoad}
        onMoveEnd={syncZoomAndPreload}
        onZoomEnd={syncZoomAndPreload}
      >

        {visitHeatmapFc ? (
          <Source id="visit-heat" type="geojson" data={visitHeatmapFc}>
            <Layer
              id="visit-heat-layer"
              type="heatmap"
              paint={{
                'heatmap-weight': ['get', 'weight'],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.1],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 14, 14, 26],
                'heatmap-opacity': 0.5,
                'heatmap-color': [
                  'interpolate',
                  ['linear'],
                  ['heatmap-density'],
                  0,
                  'rgba(59,130,246,0)',
                  0.35,
                  'rgba(59,130,246,0.35)',
                  0.65,
                  'rgba(234,179,8,0.45)',
                  1,
                  'rgba(220,38,38,0.55)',
                ],
              }}
            />
          </Source>
        ) : null}

        <Source
          id="canvass-cluster-src"
          type="geojson"
          data={addressClusterFc}
          {...({
            cluster: true,
            clusterMaxZoom: MAP_CLUSTER_MAX_ZOOM,
            clusterRadius: MAP_CLUSTER_RADIUS,
          } as Record<string, unknown>)}
        >
          <Layer
            id="canvass-clusters"
            type="circle"
            filter={['has', 'point_count']}
            layout={{ visibility: clusterOverlayVisibility }}
            paint={{
              'circle-color': 'rgba(59,130,246,0.55)',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 24, 28],
            }}
          />
          <Layer
            id="canvass-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              visibility: clusterOverlayVisibility,
              'text-field': ['to-string', ['get', 'point_count']],
              'text-size': 12,
            }}
            paint={{
              'text-color': '#ffffff',
              'text-halo-color': 'rgba(15,23,42,0.55)',
              'text-halo-width': 1.25,
            }}
          />
          <Layer
            id="canvass-cluster-unclustered"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            layout={{ visibility: clusterOverlayVisibility }}
            paint={{
              'circle-radius': ['get', 'radius'],
              'circle-color': ['get', 'color'],
              'circle-stroke-width': ['get', 'strokeW'],
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.95,
            }}
          />
        </Source>

        <Source id="canvass-geo" type="geojson" data={canvassFc}>
          <Layer
            id="canvass-fill"
            type="fill"
            layout={{ visibility: detailOverlayVisibility }}
            paint={{
              'fill-color': ['get', 'fill'],
              'fill-opacity': ['get', 'fillOpacity'],
            }}
          />
          <Layer
            id="canvass-outline"
            type="line"
            layout={{ visibility: detailOverlayVisibility, 'line-join': 'round', 'line-cap': 'round' }}
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
            layout={{ visibility: detailOverlayVisibility }}
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
            style={{ zIndex: 2, pointerEvents: props.blockMapCanvasPointerEvents ? 'none' : 'auto' }}
            onClick={(e) => {
              const ev = (e as { originalEvent?: MouseEvent }).originalEvent
              ev?.stopPropagation?.()
              if (propsRef.current.blockMapCanvasPointerEvents) return
              if (propsRef.current.mapLeftToolDockOpenRef?.current) return
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
            id="travel-line-layer-subject"
            type="line"
            filter={['==', ['get', 'lineKind'], 'subject']}
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 4,
              'line-opacity': 0.95,
              'line-dasharray': [2, 2],
            }}
          />
          <Layer
            id="travel-line-layer-coordinate"
            type="line"
            filter={['==', ['get', 'lineKind'], 'coordinate']}
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 4,
              'line-opacity': 0.95,
            }}
          />
        </Source>

        <Source
          id="track-wpts-cluster-src"
          type="geojson"
          data={trackWptClusterFc}
          {...({
            cluster: true,
            clusterMaxZoom: MAP_CLUSTER_MAX_ZOOM,
            clusterRadius: MAP_CLUSTER_RADIUS,
          } as Record<string, unknown>)}
        >
          <Layer
            id="track-wpts-clusters"
            type="circle"
            filter={['has', 'point_count']}
            layout={{ visibility: clusterOverlayVisibility }}
            paint={{
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.92,
              'circle-radius': ['step', ['get', 'point_count'], 16, 8, 20, 20, 26],
            }}
          />
          <Layer
            id="track-wpts-cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              visibility: clusterOverlayVisibility,
              'text-field': ['to-string', ['get', 'point_count']],
              'text-size': 11,
            }}
            paint={{
              'text-color': '#ffffff',
              'text-halo-color': 'rgba(15,23,42,0.55)',
              'text-halo-width': 1.2,
            }}
          />
          <Layer
            id="track-wpts-unclustered"
            type="circle"
            filter={['!', ['has', 'point_count']]}
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
            layout={{
              'text-field': ['to-string', ['get', 'stepNum']],
              'text-size': 11,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
        </Source>

        <TrackWaypointMarkersMapLibre
          tracks={props.caseTracks}
          trackPoints={trackPtsForMap}
          visibleTrackIds={visibleTrackIdsForMap}
          selectedPointId={props.selectedTrackPointId ?? null}
          getRouteColor={props.getRouteColor}
          canManipulatePoint={canManipulateTrackPointOnMap}
          onSelectPoint={props.onSelectTrackPoint}
          draggable={props.caseTab === 'tracking'}
          onDragEndPoint={props.onTrackPointDragEnd}
          onDoubleTapTrackPoint={props.onDoubleTapTrackPoint}
          showMarkers={showTrackDomOverlays}
          mapLeftToolDockOpenRef={props.mapLeftToolDockOpenRef}
          blockMapCanvasPointerEvents={props.blockMapCanvasPointerEvents}
        />

        <TrackTimeLabelsMapLibre
          tracks={props.caseTracks}
          trackPoints={trackPtsForMap}
          visibleTrackIds={visibleTrackIdsForMap}
          getRouteColor={props.getRouteColor}
          canManipulatePoint={canManipulateTrackPointOnMap}
          selectedPointId={props.selectedTrackPointId ?? null}
          onSelectPoint={props.onSelectTrackPoint}
          onDoubleTapTrackPoint={props.onDoubleTapTrackPoint}
          onDragEndLabel={props.onTrackTimeLabelDragEnd}
          showLabels={showTrackDomOverlays}
          mapLeftToolDockOpenRef={props.mapLeftToolDockOpenRef}
          blockMapCanvasPointerEvents={props.blockMapCanvasPointerEvents}
        />
      </MapGL>
      </div>
    )
  },
)

export const AddressesMapLibre = memo(AddressesMapLibreInner)
