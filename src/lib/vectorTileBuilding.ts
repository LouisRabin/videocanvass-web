import type { Feature, Geometry, MultiPolygon, Polygon } from 'geojson'
import type { LatLon } from './types'

/** Carto Voyager GL style — building extrusion / fill layers. */
export const CARTO_VECTOR_BUILDING_LAYER_IDS = ['building', 'building-top'] as const

function pointInPolygonLatLon(point: LatLon, polygon: LatLon[]): boolean {
  const [py, px] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]!
    const [yj, xj] = polygon[j]!
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function ringAreaSqMetersApprox(ring: LatLon[]): number {
  if (ring.length < 3) return Number.POSITIVE_INFINITY
  let avgLat = 0
  for (const [la] of ring) avgLat += la
  avgLat /= ring.length
  const latM = 111_320
  const lonM = Math.cos((avgLat * Math.PI) / 180) * 111_320
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const [lat1, lon1] = ring[i]!
    const [lat2, lon2] = ring[(i + 1) % ring.length]!
    const x1 = lon1 * lonM
    const y1 = lat1 * latM
    const x2 = lon2 * lonM
    const y2 = lat2 * latM
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area / 2)
}

function lngLatRingToLatLon(ring: number[][]): LatLon[] {
  const out: LatLon[] = ring.map(([lng, lat]) => [lat, lng] as LatLon)
  const first = out[0]
  const last = out[out.length - 1]
  if (first && last && first[0] === last[0] && first[1] === last[1] && out.length > 1) {
    return out.slice(0, -1)
  }
  return out
}

function ringsFromGeometry(geom: Geometry | null | undefined): LatLon[][] {
  if (!geom) return []
  if (geom.type === 'Polygon') {
    const p = geom as Polygon
    const outer = p.coordinates[0]
    if (!outer?.length) return []
    return [lngLatRingToLatLon(outer)]
  }
  if (geom.type === 'MultiPolygon') {
    const mp = geom as MultiPolygon
    const rings: LatLon[][] = []
    for (const poly of mp.coordinates) {
      const outer = poly[0]
      if (outer?.length) rings.push(lngLatRingToLatLon(outer))
    }
    return rings
  }
  return []
}

/**
 * Pick a building outline from vector tile query results at a click.
 * Prefers the outer ring whose polygon contains the click, smallest area wins.
 */
export function buildingFootprintRingFromRenderedFeatures(
  features: Feature[],
  clickLat: number,
  clickLon: number,
): LatLon[] | null {
  const pt: LatLon = [clickLat, clickLon]
  type Cand = { ring: LatLon[]; area: number }
  const cands: Cand[] = []

  for (const f of features) {
    for (const ring of ringsFromGeometry(f.geometry)) {
      if (ring.length < 3) continue
      const closed = [...ring, ring[0]!]
      if (!pointInPolygonLatLon(pt, closed)) continue
      cands.push({ ring, area: ringAreaSqMetersApprox(ring) })
    }
  }

  if (!cands.length) return null
  cands.sort((a, b) => a.area - b.area)
  const best = cands[0]!.ring
  return best.length >= 3 ? best : null
}
