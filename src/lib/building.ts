/**
 * Building footprint retrieval (NYC layer, sequential Overpass radii, Nominatim merge/search, vector hint).
 * Tuned for speed + rate limits; see `HANDOFF.md` (Address & footprint retrieval) before changing strategy.
 */
import { reverseGeocodeAddressText } from './geocode'

type LatLon = [number, number]

/** Nominatim may return Polygon / MultiPolygon, or other types we ignore; coordinates shape varies. */
type LooseGeoJson = { type?: string; coordinates?: unknown }

type ReverseResult = {
  geojson?: LooseGeoJson
  class?: string
  type?: string
  category?: string
}

type FootprintFetchOptions = {
  /** Used if reverse lookup / Overpass miss (common when the pin sits in the roadway). */
  addressText?: string | null
  /** Optional ring from vector basemap tiles (e.g. Carto `building` layer); used when it passes sanity gates. */
  vectorTileBuildingRing?: LatLon[] | null
}

function combineAbortSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (a && b) return AbortSignal.any([a, b])
  return a ?? b
}

function isLatLonOnlyLabel(hint: string): boolean {
  return /^lat\s*-?\d+(?:\.\d+)?\s*,\s*lon\s*-?\d+(?:\.\d+)?/i.test(hint.trim())
}

type OverpassElement = {
  type: 'way' | 'relation'
  id?: number
  geometry?: Array<{ lat: number; lon: number }>
  members?: Array<{ geometry?: Array<{ lat: number; lon: number }> }>
}

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError') ||
    (typeof e === 'object' &&
      e !== null &&
      'name' in e &&
      (e as { name?: string }).name === 'AbortError')
  )
}

async function fetchFromOverpass(lat: number, lon: number, signal?: AbortSignal): Promise<LatLon[] | null> {
  const seenWayIds = new Set<number>()
  const seenRelMemberKeys = new Set<string>()
  const polys: LatLon[][] = []

  const ingest = (elements: OverpassElement[]) => {
    for (const el of elements) {
      if (el.type === 'way' && el.id != null && el.geometry && el.geometry.length >= 3) {
        if (seenWayIds.has(el.id)) continue
        seenWayIds.add(el.id)
        polys.push(el.geometry.map((p) => [p.lat, p.lon] as LatLon))
        continue
      }
      if (el.type === 'relation' && el.members) {
        let mi = 0
        for (const m of el.members) {
          if (m.geometry && m.geometry.length >= 3) {
            const ring = m.geometry.map((p) => [p.lat, p.lon] as LatLon)
            const key =
              el.id != null ? `rel:${el.id}:${mi}` : `${ring[0]![0].toFixed(5)}_${ring[0]![1].toFixed(5)}_${ring.length}`
            mi++
            if (seenRelMemberKeys.has(key)) continue
            seenRelMemberKeys.add(key)
            polys.push(ring)
          }
        }
      }
    }
  }

  const bestSoFar = () => pickBestFootprint(lat, lon, polys)

  // One radius query at a time. Five parallel Overpass calls per pin were tripping public
  // rate limits → empty responses → endless success_pin even where OSM has buildings.
  try {
    for (const radiusM of [120, 240, 400, 560, 760]) {
      if (signal?.aborted) return bestSoFar()
      try {
        const elements = await overpassBuildingElements(lat, lon, radiusM, signal)
        ingest(elements)
        const best = pickBestFootprint(lat, lon, polys)
        if (best) return best
      } catch (e) {
        if (signal?.aborted || isAbortError(e)) return bestSoFar()
        throw e
      }
    }
  } catch (e) {
    if (signal?.aborted || isAbortError(e)) return bestSoFar()
    throw e
  }

  return bestSoFar()
}

async function overpassBuildingElements(
  lat: number,
  lon: number,
  radiusM: number,
  signal?: AbortSignal,
): Promise<OverpassElement[]> {
  const query = `
[out:json][timeout:14];
(
  way(around:${radiusM},${lat},${lon})["building"];
  relation(around:${radiusM},${lat},${lon})["building"];
  way(around:${radiusM},${lat},${lon})["building:part"];
);
out geom;
`
  const res = await fetch('/api/geocode/overpass', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query,
    signal,
  })
  if (!res.ok) return []
  const json = (await res.json()) as { elements?: OverpassElement[] }
  return json.elements ?? []
}

function pickBestFootprint(lat: number, lon: number, candidates: LatLon[][]): LatLon[] | null {
  if (!candidates.length) return null
  for (const poly of candidates) {
    if (pointInPolygon([lat, lon], poly)) return poly
  }
  let best: LatLon[] | null = null
  let bestEdgeM = Number.POSITIVE_INFINITY
  let bestCentroidSq = Number.POSITIVE_INFINITY
  for (const poly of candidates) {
    const edgeM = minDistancePointToPolygonEdgeMeters(lat, lon, poly)
    const c = centroid(poly)
    const cd = (c[0] - lat) ** 2 + (c[1] - lon) ** 2
    if (edgeM < bestEdgeM - 0.5 || (Math.abs(edgeM - bestEdgeM) <= 0.5 && cd < bestCentroidSq)) {
      bestEdgeM = edgeM
      bestCentroidSq = cd
      best = poly
    }
  }
  return best
}

/**
 * NYC Open Data “BUILDING” footprint outlines (official city layer).
 * https://data.cityofnewyork.us/City-Government/BUILDING/5zhs-2jue/
 */
const NYC_SODA_BUILDING_RESOURCE = '5zhs-2jue'

function isLikelyNycFiveBoroughs(lat: number, lon: number): boolean {
  return lat >= 40.477 && lat <= 40.92 && lon >= -74.27 && lon <= -73.68
}

function nycPlanFootprintAcceptable(lat: number, lon: number, poly: LatLon[]): boolean {
  if (!poly || poly.length < 3) return false
  if (isAcceptableFootprint(poly, lat, lon, 'overpass_relaxed')) return true
  if (pointInPolygon([lat, lon], poly)) return true
  return minDistancePointToPolygonEdgeMeters(lat, lon, poly) <= 58
}

async function fetchNycOpenDataBuildingFootprint(lat: number, lon: number, signal?: AbortSignal): Promise<LatLon[] | null> {
  if (!isLikelyNycFiveBoroughs(lat, lon)) return null

  const d = 0.00128
  const nwLat = lat + d
  const nwLon = lon - d
  const seLat = lat - d
  const seLon = lon + d
  const where = `within_box(the_geom, ${nwLat}, ${nwLon}, ${seLat}, ${seLon})`
  const qs = new URLSearchParams()
  qs.set('$where', where)
  qs.set('$limit', '80')
  const path = `/resource/${NYC_SODA_BUILDING_RESOURCE}.geojson?${qs.toString()}`

  type Fc = { type?: string; features?: Array<{ geometry?: LooseGeoJson }> }
  let parsed: Fc | null = null
  for (const base of [`/api/nyc-open-data`, `https://data.cityofnewyork.us`] as const) {
    try {
      const res = await fetch(`${base}${path}`, { signal })
      if (!res.ok) continue
      const json = (await res.json()) as Fc
      if (json?.type === 'FeatureCollection' && Array.isArray(json.features)) {
        parsed = json
        break
      }
    } catch {
      /* try next base */
    }
  }
  if (!parsed?.features?.length) return null

  const polys: LatLon[][] = []
  for (const f of parsed.features) {
    const ring = extractOuterRing(f.geometry)
    if (ring && ring.length >= 3) polys.push(ring)
  }
  if (!polys.length) return null
  const best = pickBestFootprint(lat, lon, polys)
  if (!best) return null
  return nycPlanFootprintAcceptable(lat, lon, best) ? best : null
}

/** Photon/Nominatim labels often include community-board text that breaks free-text search. */
function normalizeVerboseNycAddress(s: string): string {
  return s
    .replace(/,\s*Manhattan Community Board \d+,/gi, ',')
    .replace(/,\s*Brooklyn Community Board \d+,/gi, ',')
    .replace(/,\s*Queens Community Board \d+,/gi, ',')
    .replace(/,\s*Bronx Community Board \d+,/gi, ',')
    .replace(/,\s*Staten Island Community Board \d+,/gi, ',')
    .replace(/,\s*New York County,\s*/gi, ', ')
    .replace(/,\s*Kings County,\s*/gi, ', ')
    .replace(/,\s*Richmond County,\s*/gi, ', ')
    .replace(/,\s*Queens County,\s*/gi, ', ')
    .replace(/,\s*Bronx County,\s*/gi, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Housenumber + street + optional ZIP for structured Nominatim search.
 * Handles leading POI labels: "Mint House, 70, Pine Street, …".
 */
function tryParseStructuredStreet(addressText: string): { street: string; postalcode?: string } | null {
  const parts = addressText.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  let hnIdx = -1
  for (let i = 0; i < parts.length - 1; i++) {
    if (/^\d+(?:-\d+)?[A-Za-z]?$/.test(parts[i]!)) {
      hnIdx = i
      break
    }
  }
  if (hnIdx < 0) return null
  const hn = parts[hnIdx]!
  const stName = parts[hnIdx + 1]!
  if (stName.length < 3 || !/[a-zA-Z]/.test(stName)) return null
  let postalcode: string | undefined
  for (const p of parts) {
    const m = /^(\d{5})(?:-\d{4})?$/.exec(p)
    if (m) postalcode = m[1]
  }
  return { street: `${hn} ${stName}`, postalcode }
}

function compactNumberedAddress(addressText: string): string | null {
  const p = tryParseStructuredStreet(addressText)
  if (!p) return null
  const zip = p.postalcode ? ` ${p.postalcode}` : ''
  return `${p.street}, New York, NY${zip}, USA`
}

/** When the first comma-separated segment has no digit, it is usually a POI name ("Burger Village, Church St…"). */
function searchVariants(addressText: string): string[] {
  const t = addressText.trim()
  if (!t) return []
  const parts = t.split(',').map((s) => s.trim())
  if (parts.length >= 2 && parts[0] && !/\d/.test(parts[0])) {
    const rest = parts.slice(1).join(', ')
    if (rest.length >= 6) return [...new Set([t, rest])]
  }
  return [t]
}

function collectSearchQueries(addressText: string): string[] {
  const normalized = normalizeVerboseNycAddress(addressText)
  const out = new Set<string>()
  for (const q of searchVariants(normalized)) {
    if (q) out.add(q)
  }
  for (const q of searchVariants(addressText)) {
    if (q) out.add(q)
  }
  const compact = compactNumberedAddress(normalized) ?? compactNumberedAddress(addressText)
  if (compact) out.add(compact)
  return [...out]
}

type SearchHit = { geojson?: LooseGeoJson; class?: string; type?: string; lat?: string; lon?: string }

function hitApproxAnchor(hit: SearchHit): LatLon | null {
  const la = hit.lat != null ? Number(hit.lat) : NaN
  const lo = hit.lon != null ? Number(hit.lon) : NaN
  if (Number.isFinite(la) && Number.isFinite(lo)) return [la, lo]
  if (!hit.geojson) return null
  const ring = extractOuterRing(hit.geojson)
  if (!ring || !ring.length) return null
  return centroid(ring)
}

function classRank(h: SearchHit): number {
  if (h.class === 'building' || h.type === 'house' || h.type === 'residential') return 0
  if (h.class === 'shop' || h.class === 'amenity' || h.class === 'office') return 1
  if (h.class === 'place') return 3
  return 2
}

function pickBestPolygonFromHits(hits: SearchHit[], lat: number, lon: number): LatLon[] | null {
  const withPoly = hits.filter((x) => x.geojson && !isBadSearchHitClass(x))
  if (!withPoly.length) return null
  withPoly.sort((a, b) => {
    const aa = hitApproxAnchor(a)
    const bb = hitApproxAnchor(b)
    const da = aa ? (aa[0] - lat) ** 2 + (aa[1] - lon) ** 2 : Number.POSITIVE_INFINITY
    const db = bb ? (bb[0] - lat) ** 2 + (bb[1] - lon) ** 2 : Number.POSITIVE_INFINITY
    if (Math.abs(da - db) > 1e-8) return da - db
    return classRank(a) - classRank(b)
  })
  for (const gate of ['nominatim', 'nominatim_relaxed'] as const) {
    for (const hit of withPoly) {
      const ring = extractOuterRing(hit.geojson!)
      if (!ring || ring.length < 3) continue
      if (isAcceptableFootprint(ring, lat, lon, gate)) return ring
    }
  }
  return null
}

async function nominatimSearch(
  q: string,
  lat: number,
  lon: number,
  bounded: boolean,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  const span = 0.012
  const url = new URL('/api/geocode/nominatim', window.location.origin)
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('limit', '15')
  url.searchParams.set('addressdetails', '0')
  if (bounded) {
    url.searchParams.set('viewbox', `${lon - span},${lat - span},${lon + span},${lat + span}`)
    url.searchParams.set('bounded', '1')
  }

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) return []
  const items = (await res.json()) as SearchHit[]
  return Array.isArray(items) ? items : []
}

/** Nominatim structured search — works better than long free-text labels with NYC admin noise. */
async function nominatimStructuredSearch(
  parsed: { street: string; postalcode?: string },
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  const span = 0.02
  const url = new URL('/api/geocode/nominatim', window.location.origin)
  url.searchParams.set('street', parsed.street)
  url.searchParams.set('city', 'New York')
  url.searchParams.set('state', 'NY')
  if (parsed.postalcode) url.searchParams.set('postalcode', parsed.postalcode)
  url.searchParams.set('country', 'us')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('limit', '12')
  url.searchParams.set('addressdetails', '0')
  url.searchParams.set('viewbox', `${lon - span},${lat - span},${lon + span},${lat + span}`)

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) return []
  const items = (await res.json()) as SearchHit[]
  return Array.isArray(items) ? items : []
}

async function fetchFromNominatimSearch(
  addressText: string,
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<LatLon[] | null> {
  const queries = collectSearchQueries(addressText)
  const boundedSets = await Promise.all(queries.map((q) => nominatimSearch(q, lat, lon, true, signal)))
  const fromBounded = pickBestPolygonFromHits(boundedSets.flat(), lat, lon)
  if (fromBounded) return fromBounded

  const unboundedSets = await Promise.all(queries.map((q) => nominatimSearch(q, lat, lon, false, signal)))
  const fromUnbounded = pickBestPolygonFromHits(unboundedSets.flat(), lat, lon)
  if (fromUnbounded) return fromUnbounded

  const normalized = normalizeVerboseNycAddress(addressText)
  const parsed = tryParseStructuredStreet(normalized) ?? tryParseStructuredStreet(addressText)
  if (parsed) {
    const hits = await nominatimStructuredSearch(parsed, lat, lon, signal)
    const poly = pickBestPolygonFromHits(hits, lat, lon)
    if (poly) return poly
  }

  return null
}

async function fetchFromNominatim(lat: number, lon: number, signal?: AbortSignal): Promise<LatLon[] | null> {
  // Zoom changes what feature owns the reverse hit: try building-scale first, then street, then block.
  for (const zoom of ['19', '18', '17'] as const) {
    if (signal?.aborted) return null
    const ring = await nominatimReverseRingAtZoom(lat, lon, zoom, signal)
    if (ring) return ring
  }
  return null
}

async function nominatimReverseRingAtZoom(
  lat: number,
  lon: number,
  zoom: string,
  signal?: AbortSignal,
): Promise<LatLon[] | null> {
  const url = new URL('/api/geocode/nominatim-reverse', window.location.origin)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('zoom', zoom)
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('addressdetails', '0')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) return null

  const json = (await res.json()) as ReverseResult
  const cls = json.class ?? ''
  const typ = json.type ?? ''

  if (reversePolygonUnwanted(cls, typ)) return null

  if (json.geojson) {
    const ring = extractOuterRing(json.geojson)
    if (ring && ring.length >= 3) return ring
  }
  // Do not use boundingbox → rectangle; it is not a building footprint and misleads on the map.
  return null
}

function extractOuterRing(geometry: LooseGeoJson | null | undefined): LatLon[] | null {
  if (!geometry || typeof geometry.type !== 'string') return null
  const t = geometry.type
  const c = geometry.coordinates

  if (t === 'Polygon') {
    if (!Array.isArray(c) || c.length === 0) return null
    const outer = c[0]
    return toLatLonRing(outer)
  }

  if (t === 'MultiPolygon') {
    if (!Array.isArray(c) || c.length === 0) return null
    let best: unknown = null
    let bestArea = -1
    for (const poly of c) {
      if (!Array.isArray(poly) || poly.length === 0) continue
      const outer = poly[0]
      if (!Array.isArray(outer)) continue
      const a = Math.abs(roughArea(outer))
      if (a > bestArea) {
        bestArea = a
        best = outer
      }
    }
    return best ? toLatLonRing(best) : null
  }

  return null
}

function toLatLonRing(ring: unknown): LatLon[] | null {
  if (!Array.isArray(ring) || ring.length < 3) return null
  const out: LatLon[] = []
  for (const p of ring) {
    if (!Array.isArray(p) || p.length < 2) continue
    const lon = Number(p[0])
    const lat = Number(p[1])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    out.push([lat, lon])
  }
  return out.length >= 3 ? out : null
}

function roughArea(ring: unknown): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i]
    const p2 = ring[(i + 1) % ring.length]
    if (!Array.isArray(p1) || !Array.isArray(p2) || p1.length < 2 || p2.length < 2) continue
    const x1 = Number(p1[0])
    const y1 = Number(p1[1])
    const x2 = Number(p2[0])
    const y2 = Number(p2[1])
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

function centroid(points: LatLon[]): LatLon {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const [y1, x1] = points[i]
    const [y2, x2] = points[(i + 1) % points.length]
    const f = x1 * y2 - x2 * y1
    a += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  const area = a / 2 || 1
  return [cy / (6 * area), cx / (6 * area)]
}

function pointInPolygon(point: LatLon, polygon: LatLon[]): boolean {
  const [py, px] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function polygonAreaSqMeters(poly: LatLon[]): number {
  if (poly.length < 3) return 0
  // Equirectangular projection around the polygon center.
  let avgLat = 0
  for (const [lat] of poly) avgLat += lat
  avgLat /= poly.length
  const latScale = 111320
  const lonScale = Math.cos((avgLat * Math.PI) / 180) * 111320

  let area = 0
  for (let i = 0; i < poly.length; i++) {
    const [lat1, lon1] = poly[i]
    const [lat2, lon2] = poly[(i + 1) % poly.length]
    const x1 = lon1 * lonScale
    const y1 = lat1 * latScale
    const x2 = lon2 * lonScale
    const y2 = lat2 * latScale
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area / 2)
}

function isLikelyCoarseFootprint(poly: LatLon[]): boolean {
  const area = polygonAreaSqMeters(poly)
  // Roughly anything larger than a medium city block is likely parcel-level.
  return area > 12000
}

function preferRefinedFootprint(current: LatLon[], refined: LatLon[], lat: number, lon: number): boolean {
  if (
    !isAcceptableFootprint(refined, lat, lon, 'nominatim') &&
    !isAcceptableFootprint(refined, lat, lon, 'nominatim_relaxed')
  ) {
    return false
  }
  const currentArea = polygonAreaSqMeters(current)
  const refinedArea = polygonAreaSqMeters(refined)
  if (refinedArea <= 0) return false
  const pt: LatLon = [lat, lon]
  const currentContains = pointInPolygon(pt, current)
  const refinedContains = pointInPolygon(pt, refined)
  if (refinedContains && !currentContains) return true
  // Prefer materially tighter polygons to avoid school/campus parcels.
  if (refinedArea < currentArea * 0.6) return true
  return false
}

type FootprintGate = 'overpass' | 'overpass_relaxed' | 'nominatim' | 'nominatim_relaxed' | 'vector_tile'

/** Highways, linear features, and admin blobs are not building footprints. */
function reversePolygonUnwanted(cls: string, typ: string): boolean {
  const c = cls.toLowerCase()
  const t = typ.toLowerCase()
  if (
    c === 'highway' ||
    c === 'railway' ||
    c === 'waterway' ||
    c === 'aeroway' ||
    c === 'natural' ||
    c === 'barrier' ||
    c === 'boundary'
  ) {
    return true
  }
  if (c === 'place' && t !== 'house' && t !== 'building') return true
  return false
}

function isBadSearchHitClass(hit: SearchHit): boolean {
  const c = (hit.class ?? '').toLowerCase()
  const t = (hit.type ?? '').toLowerCase()
  return reversePolygonUnwanted(c, t)
}

function polygonAabbSpanMeters(poly: LatLon[]): { width: number; height: number } {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const [la, lo] of poly) {
    minLat = Math.min(minLat, la)
    maxLat = Math.max(maxLat, la)
    minLon = Math.min(minLon, lo)
    maxLon = Math.max(maxLon, lo)
  }
  const midLat = (minLat + maxLat) / 2
  const latM = 111320
  const lonM = Math.cos((midLat * Math.PI) / 180) * 111320
  const h = (maxLat - minLat) * latM
  const w = (maxLon - minLon) * lonM
  return { width: Math.max(w, 0), height: Math.max(h, 0) }
}

/** Long thin rectangles are usually roads/sidewalk buffers, not buildings. */
function polygonStripAspect(poly: LatLon[]): number {
  const { width, height } = polygonAabbSpanMeters(poly)
  const short = Math.max(Math.min(width, height), 0.25)
  const long = Math.max(width, height, 0.25)
  return long / short
}

function centroidDistanceMeters(lat: number, lon: number, poly: LatLon[]): number {
  const c = centroid(poly)
  const latM = 111320
  const lonM = Math.cos((c[0] * Math.PI) / 180) * 111320
  const dy = (lat - c[0]) * latM
  const dx = (lon - c[1]) * lonM
  return Math.sqrt(dx * dx + dy * dy)
}

function distancePointToSegmentMeters(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-8) return Math.hypot(px - x0, py - y0)
  let t = ((px - x0) * dx + (py - y0) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const qx = x0 + t * dx
  const qy = y0 + t * dy
  return Math.hypot(px - qx, py - qy)
}

/** Shortest map distance from pin to polygon boundary (street pins sit just outside façades). */
function minDistancePointToPolygonEdgeMeters(lat: number, lon: number, poly: LatLon[]): number {
  if (poly.length < 2) return Infinity
  const latM = 111320
  const lonM = Math.cos((lat * Math.PI) / 180) * 111320
  const px = lon * lonM
  const py = lat * latM
  const n = poly.length
  let best = Infinity
  const ringClosed = poly[0]![0] === poly[n - 1]![0] && poly[0]![1] === poly[n - 1]![1]
  const segCount = ringClosed ? n - 1 : n
  for (let i = 0; i < segCount; i++) {
    const [la0, lo0] = poly[i]!
    const [la1, lo1] = poly[(i + 1) % n]!
    const x0 = lo0 * lonM
    const y0 = la0 * latM
    const x1 = lo1 * lonM
    const y1 = la1 * latM
    best = Math.min(best, distancePointToSegmentMeters(px, py, x0, y0, x1, y1))
  }
  return best
}

function isAcceptableFootprint(poly: LatLon[] | null, lat: number, lon: number, gate: FootprintGate): boolean {
  if (!poly || poly.length < 3) return false
  const area = polygonAreaSqMeters(poly)
  const aspect = polygonStripAspect(poly)
  const contains = pointInPolygon([lat, lon], poly)
  const distM = centroidDistanceMeters(lat, lon, poly)
  const edgeM = minDistancePointToPolygonEdgeMeters(lat, lon, poly)

  const maxAspect =
    gate === 'vector_tile'
      ? 52
      : gate === 'overpass'
        ? 28
        : gate === 'overpass_relaxed'
          ? 44
          : gate === 'nominatim_relaxed'
            ? 36
            : 22
  if (aspect > maxAspect) return false

  const minArea =
    gate === 'vector_tile'
      ? 10
      : gate === 'overpass'
        ? 18
        : gate === 'overpass_relaxed'
          ? 10
          : gate === 'nominatim_relaxed'
            ? 14
            : 28
  const maxArea =
    gate === 'vector_tile'
      ? 900000
      : gate === 'overpass'
        ? 450000
        : gate === 'overpass_relaxed'
          ? 650000
          : gate === 'nominatim_relaxed'
            ? 320000
            : 140000
  if (area < minArea || area > maxArea) return false

  const maxCentroid =
    gate === 'vector_tile' ? 220 : gate === 'overpass' ? 150 : gate === 'overpass_relaxed' ? 240 : gate === 'nominatim_relaxed' ? 140 : 92
  const maxEdge =
    gate === 'vector_tile' ? 100 : gate === 'overpass' ? 50 : gate === 'overpass_relaxed' ? 78 : gate === 'nominatim_relaxed' ? 65 : 44
  if (!contains && distM > maxCentroid && edgeM > maxEdge) return false

  return true
}

/**
 * Use a provider ring as-drawn when it passes coarse sanity only (no distance gate).
 * Applies to Overpass `building=*` only (never placeholder rectangles).
 */
function plausibleOsmFootprint(poly: LatLon[] | null): LatLon[] | null {
  if (!poly || poly.length < 3) return null
  const area = polygonAreaSqMeters(poly)
  const aspect = polygonStripAspect(poly)
  if (area < 8 || area > 5_000_000) return null
  if (aspect > 200) return null
  return poly
}

function validatedOverPoly(raw: LatLon[] | null, lat: number, lon: number): LatLon[] | null {
  if (!raw) return null
  if (isAcceptableFootprint(raw, lat, lon, 'overpass')) return raw
  if (isAcceptableFootprint(raw, lat, lon, 'overpass_relaxed')) return raw
  return null
}

function validatedNomPoly(raw: LatLon[] | null, lat: number, lon: number): LatLon[] | null {
  if (!raw) return null
  if (isAcceptableFootprint(raw, lat, lon, 'nominatim')) return raw
  if (isAcceptableFootprint(raw, lat, lon, 'nominatim_relaxed')) return raw
  return null
}

function validatedVectorTilePoly(raw: LatLon[] | null, lat: number, lon: number): LatLon[] | null {
  if (!raw) return null
  if (isAcceptableFootprint(raw, lat, lon, 'vector_tile')) return raw
  // Carto/OSM tiles are simplified — allow OSM-relaxed gates so more pins use the fast vector path.
  if (isAcceptableFootprint(raw, lat, lon, 'overpass_relaxed')) return raw
  return null
}

function mergeFootprintCandidates(
  overRaw: LatLon[] | null | undefined,
  nomRaw: LatLon[] | null | undefined,
  lat: number,
  lon: number,
): LatLon[] | null {
  const o = overRaw ?? null
  const n = nomRaw ?? null
  const overVal = validatedOverPoly(o, lat, lon)
  const nomVal = validatedNomPoly(n, lat, lon)
  const overPlausible = !overVal && o ? plausibleOsmFootprint(o) : null

  if (nomVal && overVal) {
    if (preferRefinedFootprint(overVal, nomVal, lat, lon)) return nomVal
    if (preferRefinedFootprint(nomVal, overVal, lat, lon)) return overVal
    const nomIn = pointInPolygon([lat, lon], nomVal)
    const overIn = pointInPolygon([lat, lon], overVal)
    if (nomIn && !overIn) return nomVal
    if (overIn && !nomIn) return overVal
    return polygonAreaSqMeters(overVal) <= polygonAreaSqMeters(nomVal) ? overVal : nomVal
  }
  if (nomVal) return nomVal
  if (overVal) return overVal
  if (overPlausible) return overPlausible
  return null
}

export async function fetchBuildingFootprint(
  lat: number,
  lon: number,
  signal?: AbortSignal,
  opts?: FootprintFetchOptions,
): Promise<LatLon[] | null> {
  const vecHint = opts?.vectorTileBuildingRing
  if (vecHint && vecHint.length >= 3) {
    const v = validatedVectorTilePoly(vecHint, lat, lon)
    if (v) return v
  }

  let addressText = opts?.addressText?.trim() ?? null
  if (addressText && isLatLonOnlyLabel(addressText)) {
    const resolved = await reverseGeocodeAddressText(lat, lon, signal).catch(() => null)
    const t = resolved?.trim()
    if (t && !isLatLonOnlyLabel(t)) addressText = t
  }

  const nycEligible = isLikelyNycFiveBoroughs(lat, lon)
  const nycP = nycEligible
    ? fetchNycOpenDataBuildingFootprint(lat, lon, signal).catch(() => null)
    : Promise.resolve(null as LatLon[] | null)

  const raceAbort = new AbortController()
  const combined = combineAbortSignals(signal, raceAbort.signal)

  const pOver = fetchFromOverpass(lat, lon, combined)
    .then((p) => {
      if (validatedOverPoly(p, lat, lon) || plausibleOsmFootprint(p)) raceAbort.abort()
      return p
    })
    .catch((err: unknown) => {
      if (combined?.aborted) return null
      throw err
    })

  const pNom = fetchFromNominatim(lat, lon, combined)
    .then((p) => {
      if (validatedNomPoly(p, lat, lon)) raceAbort.abort()
      return p
    })
    .catch((err: unknown) => {
      if (combined?.aborted) return null
      throw err
    })

  const osmNomP = Promise.all([pOver, pNom])
    .then(([o, n]) => mergeFootprintCandidates(o, n, lat, lon))
    .catch(() => null as LatLon[] | null)

  const [fromNyc, osmMerged] = await Promise.all([nycP, osmNomP])
  if (fromNyc) return fromNyc

  let merged: LatLon[] | null = osmMerged
  if (addressText && !isLatLonOnlyLabel(addressText)) {
    const needSearch = !merged || isLikelyCoarseFootprint(merged)
    if (needSearch) {
      const searchPoly = await fetchFromNominatimSearch(addressText, lat, lon, signal)
      if (searchPoly) {
        if (!merged) merged = searchPoly
        else if (preferRefinedFootprint(merged, searchPoly, lat, lon)) merged = searchPoly
      }
    }
  }

  return merged
}

