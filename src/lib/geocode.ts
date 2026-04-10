import type { AddressBounds } from './types'

export type PlaceSuggestion = {
  label: string
  lat: number
  lon: number
  bounds: AddressBounds | null
}

type SearchOpts = {
  limit?: number
  signal?: AbortSignal
  bias?: { lat: number; lon: number }
}

type GeocodeScope = 'ny' | 'us'
/** Search scope + UI copy hooks; USA restriction + Photon details: `docs/GEOCODE_USA.md`. */
export const GEOCODE_SCOPE: GeocodeScope = 'us'

/** Public Photon — CORS allows browser `fetch`; avoids app origin → edge → Komoot double hop. */
const PHOTON_DIRECT_API = 'https://photon.komoot.io/api/'

/** Continental US — Photon `bbox=minLon,minLat,maxLon,maxLat`. AK/HI rely on country filter / coord fallback. */
const US_PHOTON_BBOX = '-125,24,-66,49.5'

type PhotonProperties = {
  street?: string
  housenumber?: string
  postcode?: string
  city?: string
  state?: string
  country?: string
  countrycode?: string
  name?: string
  extent?: [number, number, number, number]
}

const memCache = new Map<string, { at: number; value: PlaceSuggestion[] }>()
const TTL_MS = 10 * 60 * 1000

/**
 * Photon rows per request when US-filtering (client filters non-US; then we cap to caller `limit`).
 * Keep this modest — smaller payloads return faster from Komoot.
 */
const PHOTON_US_FETCH_MIN = 10
const PHOTON_US_FETCH_CAP = 24

export { reverseGeocodeAddressText } from './reverseGeocodeAddressTextStable'

function restrictForwardSearchToUnitedStates(): boolean {
  return GEOCODE_SCOPE === 'us' || GEOCODE_SCOPE === 'ny'
}

/** When Photon omits country fields, keep hits only inside rough US boxes (continental + AK + HI). */
function latLonLikelyUnitedStates(lat: number, lon: number): boolean {
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) return true
  if (lat >= 51 && lat <= 72 && lon >= -170 && lon <= -130) return true
  if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) return true
  return false
}

/**
 * Snap bias to ~1.1 km cells so tiny map viewport drift does not change the mem-cache key or bypass HTTP cache
 * with near-identical `lat`/`lon` query strings.
 */
function quantizeBias(lat: number, lon: number): { lat: number; lon: number } {
  return {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
  }
}

function readPhotonProperties(raw: unknown): PhotonProperties {
  if (!raw || typeof raw !== 'object') return {}
  return raw as PhotonProperties
}

/** Fast path: trust Photon shape enough for autocomplete (no full zod parse on every keystroke). */
function photonFeaturesFromJson(json: unknown): { geometry: { coordinates: [number, number] }; properties: PhotonProperties }[] {
  if (!json || typeof json !== 'object') return []
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const out: { geometry: { coordinates: [number, number] }; properties: PhotonProperties }[] = []
  for (const f of features) {
    if (!f || typeof f !== 'object') continue
    const geom = (f as { geometry?: unknown }).geometry
    if (!geom || typeof geom !== 'object') continue
    const coords = (geom as { coordinates?: unknown }).coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue
    const lon = Number(coords[0])
    const lat = Number(coords[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    out.push({
      geometry: { coordinates: [lon, lat] },
      properties: readPhotonProperties((f as { properties?: unknown }).properties),
    })
  }
  return out
}

async function fetchPhotonSearch(urlSameOriginProxy: string, directParams: URLSearchParams, signal?: AbortSignal): Promise<Response> {
  if (typeof window === 'undefined') {
    return fetch(urlSameOriginProxy, { signal })
  }
  const direct = new URL(PHOTON_DIRECT_API)
  directParams.forEach((v, k) => direct.searchParams.set(k, v))
  try {
    const r = await fetch(direct.toString(), { signal, mode: 'cors' })
    if (r.ok) return r
  } catch {
    /* CORS or network — fall back */
  }
  return fetch(urlSameOriginProxy, { signal })
}

function isUnitedStatesPhotonProperties(p: PhotonProperties, lat: number, lon: number): boolean {
  const cc = String(p.countrycode ?? '').trim().toLowerCase()
  if (cc === 'us') return true
  const c = String(p.country ?? '').trim().toLowerCase()
  if (
    c === 'united states' ||
    c === 'united states of america' ||
    c === 'usa' ||
    c === 'u.s.' ||
    c === 'u.s.' ||
    c === 'u.s.a.' ||
    c === 'u.s.a'
  ) {
    return true
  }
  if (!cc && !c) return latLonLikelyUnitedStates(lat, lon)
  return false
}

export async function searchPlaces(query: string, opts?: SearchOpts): Promise<PlaceSuggestion[]> {
  const q = normalizeQuery(query)
  if (q.length < 3) return []

  const limit = opts?.limit ?? 6
  const usOnly = restrictForwardSearchToUnitedStates()
  const raw = opts?.bias
  const bias =
    raw && Number.isFinite(raw.lat) && Number.isFinite(raw.lon) ? quantizeBias(raw.lat, raw.lon) : undefined
  const biasKey = bias ? `@${bias.lat.toFixed(2)},${bias.lon.toFixed(2)}` : ''
  const cacheKey = usOnly
    ? `${q.toLowerCase()}|${limit}|us|v3${biasKey}`
    : `${q.toLowerCase()}|${limit}|v3${biasKey}`
  const cached = memCache.get(cacheKey)
  if (cached && Date.now() - cached.at < TTL_MS) {
    return cached.value
  }

  const fetchLimit = usOnly
    ? Math.min(PHOTON_US_FETCH_CAP, Math.max(PHOTON_US_FETCH_MIN, limit * 2))
    : limit

  const params = new URLSearchParams()
  params.set('q', q)
  params.set('limit', String(fetchLimit))
  params.set('lang', 'en')
  if (bias != null) {
    params.set('lat', String(bias.lat))
    params.set('lon', String(bias.lon))
    /** Stronger preference for results near bias point (Photon default is weak). */
    params.set('location_bias_scale', '0.32')
  }
  if (usOnly && GEOCODE_SCOPE === 'us') {
    params.set('bbox', US_PHOTON_BBOX)
  }

  const proxyUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/geocode/photon-api?${params.toString()}`
      : `/api/geocode/photon-api?${params.toString()}`

  const res = await fetchPhotonSearch(proxyUrl, params, opts?.signal)
  if (!res.ok) return []

  const json: unknown = await res.json()
  let features = photonFeaturesFromJson(json)
  if (usOnly) {
    features = features.filter((f) => {
      const [lon, lat] = f.geometry.coordinates
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
      return isUnitedStatesPhotonProperties(f.properties, lat, lon)
    })
  }

  const value = features
    .slice(0, limit)
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates
      const p = f.properties

      const streetLine = [p.housenumber, p.street]
        .map((x) => (x == null ? '' : String(x).trim()))
        .filter(Boolean)
        .join(' ')
        .trim()
      const poiName = String(p.name ?? '').trim()
      const head = streetLine || poiName
      const parts = [head, p.city, p.state]
        .map((x) => (x == null ? '' : String(x).trim()))
        .filter(Boolean)

      const label = parts.join(', ') || q

      const bounds = p.extent
        ? {
            west: p.extent[0],
            south: p.extent[1],
            east: p.extent[2],
            north: p.extent[3],
          }
        : null

      return { label, lat, lon, bounds }
    })
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon))

  memCache.set(cacheKey, { at: Date.now(), value })
  return value
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}
