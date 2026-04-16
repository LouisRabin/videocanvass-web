import type { Map as GlMap, StyleSpecification } from 'maplibre-gl'
import type { Feature, FeatureCollection, Position } from 'geojson'
import L from 'leaflet'

import type { Location, Track, TrackPoint } from '../lib/types'
import { statusColor } from '../lib/types'
import { formatAddressLineForMapList } from './casePageHelpers'

export const CARTO_VOYAGER_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'

/** Carto GL — free CDN, same vector stack family as Voyager (building query layers usually match). */
const CARTO_DARK_MATTER_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

/**
 * Esri World Imagery — public tile endpoint, no API key (follow Esri attribution terms).
 * Raster only: no vector `building` layers; footprint-from-basemap uses other fallbacks.
 */
const ESRI_WORLD_IMAGERY_STYLE: StyleSpecification = {
  version: 8,
  name: 'VideoCanvass Esri imagery',
  sources: {
    'esri-world-imagery': {
      type: 'raster',
      tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxzoom: 22,
    },
  },
  layers: [
    {
      id: 'esri-world-imagery-layer',
      type: 'raster',
      source: 'esri-world-imagery',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
}

export type VcCaseMapBasemapId = 'streets' | 'dark' | 'satellite'

export function resolveCaseMapBasemapStyle(id: VcCaseMapBasemapId): string | StyleSpecification {
  switch (id) {
    case 'dark':
      return CARTO_DARK_MATTER_STYLE
    case 'satellite':
      return ESRI_WORLD_IMAGERY_STYLE
    default:
      return CARTO_VOYAGER_STYLE
  }
}

/** Must match `CasePage.tsx`; see `docs/HANDOFF.md` (Address & footprint retrieval). */
export const VIEWPORT_OUTLINE_PRELOAD_DEBOUNCE_MS = 480
export const VIEWPORT_OUTLINE_PRELOAD_BOUNDS_PAD = 0.14
export const VIEWPORT_OUTLINE_PRELOAD_MAX = 24

/** At zoom &lt; this: React track waypoint markers and time chips are hidden (WebGL route pins still draw). */
export const MAP_DETAIL_MIN_ZOOM = 14
/** GeoJSON clustering is computed up to this zoom (exclusive of `MAP_DETAIL_MIN_ZOOM`). */
export const MAP_CLUSTER_MAX_ZOOM = MAP_DETAIL_MIN_ZOOM - 1
/** Screen pixels — Carto-scale case maps; tweak for denser/sparser clumps. */
export const MAP_CLUSTER_RADIUS = 56
/** Opening the case map on the last selected canvass pin or track step (localStorage). */
export const MAP_RESUME_FOCUS_ZOOM = 17
/** Cap scroll / gesture zoom so basemap tiles are not stretched past reliable coverage. */
export const VC_MAP_MAX_ZOOM = 19

/**
 * Carto GL stacks `building` + `building-top` (roof highlight). `building-top` uses a zoom-based
 * `fill-translate` in **screen pixels** so it never quite matches GeoJSON footprints from the same
 * tiles. We zero that translate everywhere it exists, and on **Voyager** we hide `building-top`
 * entirely so the visible mass is the untranslated `building` fill (same ring as saved outlines).
 * Dark Matter needs `building-top` (the base `building` fill is transparent at high zoom).
 */
export function patchCartoBuildingTopFootprintAlignment(map: GlMap) {
  try {
    if (!map.isStyleLoaded()) return
    if (!map.getLayer('building-top')) return
    const styleName = map.getStyle()?.name
    const isVoyager = styleName === 'Voyager'

    map.setPaintProperty('building-top', 'fill-translate', [0, 0])
    map.setLayoutProperty('building-top', 'visibility', isVoyager ? 'none' : 'visible')
  } catch {
    /* non-Carto style or paint schema change */
  }
}

export function sortTrackPointsStable(a: TrackPoint, b: TrackPoint): number {
  const ds = a.sequence - b.sequence
  if (ds !== 0) return ds
  const dt = (a.visitedAt ?? a.createdAt) - (b.visitedAt ?? b.createdAt)
  if (dt !== 0) return dt
  return a.id.localeCompare(b.id)
}

function locationBounds(loc: Pick<Location, 'lat' | 'lon' | 'bounds' | 'footprint'>): [[number, number], [number, number]] {
  if (loc.footprint && loc.footprint.length >= 3) {
    const b = L.latLngBounds(loc.footprint as [number, number][])
    const sw = b.getSouthWest()
    const ne = b.getNorthEast()
    return [
      [sw.lat, sw.lng],
      [ne.lat, ne.lng],
    ]
  }
  if (loc.bounds) {
    return [
      [loc.bounds.south, loc.bounds.west],
      [loc.bounds.north, loc.bounds.east],
    ]
  }
  const d = 0.0004
  return [
    [loc.lat - d, loc.lon - d],
    [loc.lat + d, loc.lon + d],
  ]
}

export function extendBoundsWithLocations(
  b: InstanceType<typeof L.LatLngBounds> | null,
  locs: Array<Pick<Location, 'lat' | 'lon' | 'bounds' | 'footprint'>>,
): InstanceType<typeof L.LatLngBounds> | null {
  let out: InstanceType<typeof L.LatLngBounds> | null = b
  for (const p of locs) {
    const [s, n] = locationBounds(p)
    const lb = L.latLngBounds(s, n)
    out = out ? out.extend(lb) : lb
  }
  return out
}

export function extendBoundsWithPathPoints(
  b: InstanceType<typeof L.LatLngBounds> | null,
  pts: Array<{ lat: number; lon: number }>,
): InstanceType<typeof L.LatLngBounds> | null {
  let out = b
  for (const p of pts) {
    const ll = L.latLng(p.lat, p.lon)
    out = out ? out.extend(ll) : L.latLngBounds(ll, ll)
  }
  return out
}

function rectRingLngLat(loc: Pick<Location, 'lat' | 'lon' | 'bounds' | 'footprint'>): Position[] {
  const [[sLat, wLon], [nLat, eLon]] = locationBounds(loc)
  return [
    [wLon, sLat],
    [eLon, sLat],
    [eLon, nLat],
    [wLon, nLat],
    [wLon, sLat],
  ]
}

export function buildCanvassCollection(
  mapPins: Location[],
  selectedId: string | null,
  footprintLoadingIds: Set<string>,
): FeatureCollection {
  const features: FeatureCollection['features'] = []
  for (const l of mapPins) {
    const sel = l.id === selectedId
    const c = statusColor(l.status)
    const outlineBusy = footprintLoadingIds.has(l.id)
    const hasFootprint = !!(l.footprint && l.footprint.length >= 3)

    if (hasFootprint) {
      const ring: Position[] = l.footprint!.map(([lat, lon]) => [lon, lat])
      if (ring[0]![0] !== ring[ring.length - 1]![0] || ring[0]![1] !== ring[ring.length - 1]![1]) {
        ring.push([...ring[0]!])
      }
      features.push({
        type: 'Feature',
        id: l.id,
        properties: {
          id: l.id,
          kind: 'footprint',
          fill: c,
          fillOpacity: sel ? 0.76 : 0.48,
          line: sel ? c : '#ffffff',
          lineWidth: sel ? 3 : 1.25,
          lineOpacity: sel ? 0.95 : 0.62,
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      })
      continue
    }

    if (outlineBusy) {
      continue
    }

    const ring = rectRingLngLat(l)
    const fillOpacity = sel ? 0.35 : 0
    const lineColor = sel ? c : '#ffffff'

    features.push({
      type: 'Feature',
      id: l.id,
      properties: {
        id: l.id,
        kind: 'bounds',
        fill: c,
        fillOpacity,
        line: lineColor,
        lineWidth: sel ? 3.5 : 1,
        lineOpacity: sel ? 0.95 : 0,
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    })
  }
  return { type: 'FeatureCollection', features }
}

function footprintBBoxCenterLonLat(footprint: NonNullable<Location['footprint']>): { lat: number; lon: number } {
  let minLat = footprint[0]![0]
  let maxLat = minLat
  let minLon = footprint[0]![1]
  let maxLon = minLon
  for (const [la, lo] of footprint) {
    minLat = Math.min(minLat, la)
    maxLat = Math.max(maxLat, la)
    minLon = Math.min(minLon, lo)
    maxLon = Math.max(maxLon, lo)
  }
  return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 }
}

/** One point per canvass pin for MapLibre `cluster` (centroid when a footprint exists). */
export function buildAddressClusterPointCollection(
  mapPins: Location[],
  selectedId: string | null,
): FeatureCollection {
  const features: FeatureCollection['features'] = []
  for (const l of mapPins) {
    const sel = l.id === selectedId
    const c = statusColor(l.status)
    const { lat, lon } =
      l.footprint && l.footprint.length >= 3 ? footprintBBoxCenterLonLat(l.footprint) : { lat: l.lat, lon: l.lon }
    features.push({
      type: 'Feature',
      id: l.id,
      properties: {
        id: l.id,
        color: c,
        radius: sel ? 8 : 5.5,
        strokeW: sel ? 2.5 : 2,
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function buildPinCollection(
  mapPins: Location[],
  selectedId: string | null,
  footprintLoadingIds: Set<string>,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: mapPins
      .filter((l) => {
        if (l.footprint && l.footprint.length >= 3) return false
        const loading = footprintLoadingIds.has(l.id)
        if (loading) return false
        return true
      })
      .map((l) => ({
        type: 'Feature' as const,
        id: `${l.id}-pin`,
        properties: {
          id: l.id,
          color: statusColor(l.status),
          radius: l.id === selectedId ? 8 : 5.5,
          strokeW: l.id === selectedId ? 2.5 : 2,
        },
        geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
      })),
  }
}

export function buildTrackWaypointClusterCollection(
  tracks: Track[],
  trackPoints: TrackPoint[],
  visibleTrackIds: Record<string, boolean>,
  getRouteColor: (trackId: string) => string,
): FeatureCollection {
  const byTrack = new Map<string, TrackPoint[]>()
  for (const p of trackPoints) {
    if (visibleTrackIds[p.trackId] === false) continue
    const arr = byTrack.get(p.trackId) ?? []
    arr.push(p)
    byTrack.set(p.trackId, arr)
  }
  const features: FeatureCollection['features'] = []
  for (const track of tracks) {
    if (visibleTrackIds[track.id] === false) continue
    const pts = (byTrack.get(track.id) ?? []).slice().sort(sortTrackPointsStable).filter((p) => p.showOnMap !== false)
    const base = getRouteColor(track.id)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!
      const stepNum = i + 1
      const rawLabel = p.addressText?.trim() || `Step ${stepNum}`
      const wptLabel = formatAddressLineForMapList(rawLabel).slice(0, 80)
      features.push({
        type: 'Feature',
        properties: { pid: p.id, color: base, stepNum, trackId: track.id, wptLabel },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export { buildTracksData } from '../lib/buildTrackLinesGeojson'

/** Visit-density heatmap: weight per canvass location from track-step links and last-visit signal. */
export function buildVisitDensityHeatmapCollection(
  locs: Location[],
  trackPoints: TrackPoint[],
  caseId: string,
): FeatureCollection {
  const tpPerLoc = new Map<string, number>()
  for (const p of trackPoints) {
    if (p.caseId !== caseId) continue
    const lid = p.locationId?.trim()
    if (!lid) continue
    tpPerLoc.set(lid, (tpPerLoc.get(lid) ?? 0) + 1)
  }
  const features: Feature[] = []
  for (const loc of locs) {
    if (loc.caseId !== caseId) continue
    let w = 1 + (tpPerLoc.get(loc.id) ?? 0) * 0.75
    if (loc.lastVisitedAt != null) w += 0.5
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
      properties: { weight: Math.min(10, Math.max(0.25, w)) },
    })
  }
  return { type: 'FeatureCollection', features }
}
