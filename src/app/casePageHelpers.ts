/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet / map interop */
import type { CSSProperties } from 'react'
import L from 'leaflet'
import type { CanvassStatus, LatLon, Location, TrackPoint } from '../lib/types'

/** Order rows in list view: probative → follow up → not probative → no cameras, then newest first. */
export const LIST_STATUS_SORT_ORDER: Record<CanvassStatus, number> = {
  probativeFootage: 0,
  camerasNoAnswer: 1,
  notProbativeFootage: 2,
  noCameras: 3,
}

export function appendToNotes(existing: string, block: string) {
  const e = existing.trim()
  const b = block.trim()
  if (!b) return e
  if (!e) return b
  return `${e}\n\n${b}`
}

/** Building-outline worker parallelism. Documented with other retrieval settings in `HANDOFF.md`. */
export const OUTLINE_CONCURRENCY = 3

export type PendingAddItem = {
  lat: number
  lon: number
  addressText: string
  bounds?: Location['bounds']
  vectorTileBuildingRing?: LatLon[] | null
}

export function samePendingPin(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5
}

/** Compact lat, lon for step headers, map chips, and notes context (five decimal places). */
export function formatLatLonForStepUi(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

/** Map-tap placeholder before reverse geocode; also used to decide when to keep resolving in the background. */
export function isProvisionalCanvassLabel(text: string | undefined | null): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  if (/^lat\s+-?\d+(?:\.\d+)?\s*,\s*lon\s+-?\d+(?:\.\d+)?$/i.test(t)) return true
  if (/^lat\s*-?\d+/i.test(t)) return true
  return false
}

/** Trailing country names after the last comma (common geocoder tails). */
const ADDRESS_LIST_COUNTRY_TAIL =
  /,\s*(United States(?:\s+of\s+America)?|USA|U\.S\.A\.?|U\.S\.?|Canada|Mexico|United Kingdom|UK)\s*$/i

/**
 * Shorter label for map list rows: remove trailing postal/ZIP and country when clearly present.
 * Does not change stored `addressText`; display-only.
 */
export function formatAddressLineForMapList(addressText: string): string {
  let s = (addressText ?? '').trim()
  if (!s) return s
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(ADDRESS_LIST_COUNTRY_TAIL, '').trim()
    s = s.replace(/,\s*\d{5}(?:-\d{4})?\s*$/i, '').trim()
    s = s.replace(/,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i, '').trim()
  }
  return s
}

export function sortTrackPointsStable(a: TrackPoint, b: TrackPoint): number {
  const ds = a.sequence - b.sequence
  if (ds !== 0) return ds
  const dt = (a.visitedAt ?? a.createdAt) - (b.visitedAt ?? b.createdAt)
  if (dt !== 0) return dt
  return a.id.localeCompare(b.id)
}

const CASE_MAP_FOCUS_LS = 'videocanvass.caseMapFocus.v1:'

type StoredCaseMapFocus = { v: 1; kind: 'location' | 'trackPoint'; id: string; t: number }

export function readStoredCaseMapFocus(caseId: string): StoredCaseMapFocus | null {
  try {
    const raw = localStorage.getItem(CASE_MAP_FOCUS_LS + caseId)
    if (!raw) return null
    const p = JSON.parse(raw) as StoredCaseMapFocus
    if (p?.v !== 1 || typeof p.id !== 'string') return null
    if (p.kind !== 'location' && p.kind !== 'trackPoint') return null
    return p
  } catch {
    return null
  }
}

export function writeStoredCaseMapFocus(caseId: string, kind: 'location' | 'trackPoint', id: string) {
  try {
    const payload: StoredCaseMapFocus = { v: 1, kind, id, t: Date.now() }
    localStorage.setItem(CASE_MAP_FOCUS_LS + caseId, JSON.stringify(payload))
  } catch {
    /* private mode / quota */
  }
}

function locationBounds(loc: Pick<Location, 'lat' | 'lon' | 'bounds' | 'footprint'>): any {
  if (loc.footprint && loc.footprint.length >= 3) {
    return L.latLngBounds(loc.footprint)
  }
  if (loc.bounds) {
    return [
      [loc.bounds.south, loc.bounds.west],
      [loc.bounds.north, loc.bounds.east],
    ]
  }

  // Fallback for legacy points without stored bounds.
  // Use a larger fallback so newly added locations are clickable while footprint
  // is loading (footprints are fetched async after save).
  const d = 0.0004
  return [
    [loc.lat - d, loc.lon - d],
    [loc.lat + d, loc.lon + d],
  ]
}

export function extendBoundsWithLocations(
  b: any,
  locs: Array<Pick<Location, 'lat' | 'lon' | 'bounds' | 'footprint'>>,
): any {
  let out = b
  for (const p of locs) {
    const lb = L.latLngBounds(locationBounds(p))
    out = out ? out.extend(lb) : lb
  }
  return out
}

export function extendBoundsWithPathPoints(
  b: any,
  pts: Array<{ lat: number; lon: number }>,
): any {
  let out = b
  for (const p of pts) {
    const ll = L.latLng(p.lat, p.lon)
    out = out ? out.extend(ll) : L.latLngBounds(ll, ll)
  }
  return out
}

export function casePhotoCarouselArrowStyle(side: 'left' | 'right'): CSSProperties {
  return {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    ...(side === 'left' ? { left: 6 } : { right: 6 }),
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 900,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
  }
}

function normalizeAddressKey(addressText: string): string | null {
  const raw = (addressText ?? '').trim()
  if (!raw) return null

  // Normalize to "first comma segment" (usually: `${housenumber} ${street}`)
  // Example: "160-25 150th St, Queens, New York, United States" -> "160-25 150th St"
  const first = raw.split(',')[0]?.trim() ?? ''
  if (!first) return null

  return first
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // Make sure "160 - 23" and "160-23" match.
    .replace(/\s*-\s*/g, '-')
}

export function findLocationByAddressText(locations: Location[], clickedAddressText: string): Location | null {
  const clickedKey = normalizeAddressKey(clickedAddressText)
  if (!clickedKey) return null
  for (const l of locations) {
    const key = normalizeAddressKey(l.addressText)
    if (key && key === clickedKey) return l
  }
  return null
}

/** ~50 m — same doorway / building when geocoder labels or coords differ slightly. */
const CANVASS_DUP_MAX_METERS = 50

function distanceMetersApprox(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * 111_320
  const dLon = (bLon - aLon) * 111_320 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180))
  return Math.hypot(dLat, dLon)
}

/**
 * Single saved pin per physical address: match normalized street line, footprint/bounds hit, or nearby coords.
 */
export function findExistingLocationForCanvassAdd(
  locations: Location[],
  lat: number,
  lon: number,
  addressText: string,
  outlineLoadingIds?: Set<string>,
): Location | null {
  const byText = findLocationByAddressText(locations, addressText)
  if (byText) return byText

  const byHit = findLocationHitByMapClick(locations, lat, lon, outlineLoadingIds)
  if (byHit) return byHit

  let best: Location | null = null
  let bestD = CANVASS_DUP_MAX_METERS + 1
  for (const loc of locations) {
    const d = distanceMetersApprox(lat, lon, loc.lat, loc.lon)
    if (d < bestD && d <= CANVASS_DUP_MAX_METERS) {
      bestD = d
      best = loc
    }
  }
  return best
}

/** ~13 m — tight hit target + map preview while a building outline is loading (not full Photon bbox). */
const OUTLINE_LOADING_PIN_HALF_DEG = 0.00012

function tightPinBoundsCorners(loc: Pick<Location, 'lat' | 'lon'>): [[number, number], [number, number]] {
  const d = OUTLINE_LOADING_PIN_HALF_DEG
  return [
    [loc.lat - d, loc.lon - d],
    [loc.lat + d, loc.lon + d],
  ]
}

/** Ray-cast; ring is [lat, lon][] (Leaflet order). */
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

/** Shoelace in projected meters so footprint vs bbox hits sort on the same scale. */
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

function latLngBoundsAreaSqMeters(bounds: {
  getSouthWest: () => { lat: number; lng: number }
  getNorthEast: () => { lat: number; lng: number }
}): number {
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  const midLat = (sw.lat + ne.lat) / 2
  const latM = 111_320
  const lonM = Math.cos((midLat * Math.PI) / 180) * 111_320
  return Math.abs((ne.lat - sw.lat) * latM * (ne.lng - sw.lng) * lonM)
}

/**
 * Pin activated for edit when the click lies inside its footprint polygon, or inside its
 * bounds / fallback hit rectangle (loading, queued, no footprint yet). Smallest containing
 * region wins when overlaps occur (tight buildings side by side).
 */
export function findLocationHitByMapClick(
  locations: Location[],
  lat: number,
  lon: number,
  outlineLoadingIds?: Set<string>,
): Location | null {
  const pt: LatLon = [lat, lon]
  type Hit = { loc: Location; area: number }
  const hits: Hit[] = []

  for (const loc of locations) {
    if (loc.footprint && loc.footprint.length >= 3) {
      if (pointInPolygonLatLon(pt, loc.footprint)) hits.push({ loc, area: ringAreaSqMetersApprox(loc.footprint) })
      continue
    }
    const tight = outlineLoadingIds?.has(loc.id) ?? false
    const b = tight ? tightPinBoundsCorners(loc) : locationBounds(loc)
    const bounds = L.latLngBounds(b as [number, number][])
    if (bounds.contains(L.latLng(lat, lon))) {
      hits.push({ loc, area: latLngBoundsAreaSqMeters(bounds) })
    }
  }
  if (!hits.length) return null
  hits.sort((a, b) => a.area - b.area)
  return hits[0]!.loc
}
