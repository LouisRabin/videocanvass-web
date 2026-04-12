/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet / map interop */
import type { CSSProperties } from 'react'
import L from 'leaflet'
import type { CanvassStatus, LatLon, Location, TrackPoint } from '../lib/types'

/** Order rows in list view: probative → follow up → Not Probative → no cameras, then newest first. */
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

/** Building-outline worker parallelism. Documented with other retrieval settings in `docs/HANDOFF.md`. */
export const OUTLINE_CONCURRENCY = 3

export type PendingAddItem = {
  lat: number
  lon: number
  addressText: string
  bounds?: Location['bounds']
  vectorTileBuildingRing?: LatLon[] | null
}

/** Map-driven “record result” modal: one saved row, or a new pin from a map tap before save. */
export type CanvassMapResultSession =
  | { key: string; mode: 'existing'; locationId: string }
  | ({ key: string; mode: 'new' } & PendingAddItem)

export function newCanvassMapResultSessionKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function samePendingPin(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return a.lat === b.lat && a.lon === b.lon
}

/** Compact lat, lon for step headers, map chips, and notes context (five decimal places). */
export function formatLatLonForStepUi(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}

/** Geocode / map placeholder: bare `lat, lon` decimals (Photon fallback label, pasted coords, etc.). */
function looksLikeDecimalLatLonPair(text: string): boolean {
  const t = text.trim()
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(t)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a) <= 90 && Math.abs(b) <= 180
}

/** Map-tap placeholder before reverse geocode; also used to decide when to keep resolving in the background. */
export function isProvisionalCanvassLabel(text: string | undefined | null): boolean {
  const t = (text ?? '').trim()
  if (!t) return false
  if (/^lat\s+-?\d+(?:\.\d+)?\s*,\s*lon\s+-?\d+(?:\.\d+)?$/i.test(t)) return true
  if (/^lat\s*-?\d+/i.test(t)) return true
  if (looksLikeDecimalLatLonPair(t)) return true
  return false
}

/**
 * Common English geocoder country tails — used for whole comma-separated segments and
 * `, Country` suffix cleanup.
 */
const ADDRESS_DISPLAY_COUNTRY_NAMES_BODY =
  'United States(?:\\s+of\\s+America)?|USA|U\\.S\\.A\\.?|U\\.S\\.?|Canada|Mexico|United Kingdom|UK|Great Britain|England|Scotland|Wales|Northern Ireland|Ireland|France|Germany|Deutschland|Italy|Italia|Spain|España|Netherlands|The Netherlands|Holland|Belgium|Luxembourg|Austria|Österreich|Switzerland|Australia|New Zealand|Japan|Brazil|Brasil|India|China|South Korea|Norway|Sweden|Denmark|Finland|Poland|Czechia|Czech Republic|Hungary|Romania|Portugal|Greece|Turkey|Türkiye|Israel|Singapore|South Africa|Argentina|Chile|Colombia|Peru|Philippines|Thailand|Vietnam|Indonesia|Malaysia|Taiwan|Russia|Ukraine'

const ADDRESS_DISPLAY_COUNTRY_SEGMENT = new RegExp(`^(?:${ADDRESS_DISPLAY_COUNTRY_NAMES_BODY})$`, 'iu')
const ADDRESS_LIST_COUNTRY_TAIL = new RegExp(`,\\s*(?:${ADDRESS_DISPLAY_COUNTRY_NAMES_BODY})\\s*$`, 'iu')

function isStatePlusUsZipSegment(seg: string): boolean {
  return /^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/i.test(seg.trim())
}

/** Last comma-separated segment is only a postal / ZIP code (US, CA, UK, NL, EU-style digits, Nordic). */
function isPostalCodeOnlySegment(seg: string): boolean {
  const t = seg.trim()
  if (!t) return false
  if (/^\d{5}(?:-\d{4})?$/.test(t)) return true
  if (/^\d{9}$/.test(t)) return true
  if (/^[ABCEGHJ-NPRSTVXY]\d[A-Z]\s?\d[A-Z]\d$/i.test(t)) return true
  if (/^[A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2}$/i.test(t)) return true
  if (/^\d{4}\s?[A-Z]{2}$/i.test(t)) return true
  if (/^\d{4,6}$/.test(t)) return true
  if (/^\d{3}\s\d{2}$/.test(t)) return true
  return false
}

function stripTrailingPostalCountryCommaSegments(parts: string[]): string[] {
  const out = parts.map((p) => p.trim()).filter((p) => p.length > 0)
  let changed = true
  while (changed && out.length > 0) {
    changed = false
    const last = out[out.length - 1]!
    if (ADDRESS_DISPLAY_COUNTRY_SEGMENT.test(last)) {
      out.pop()
      changed = true
      continue
    }
    if (isPostalCodeOnlySegment(last)) {
      out.pop()
      changed = true
      continue
    }
    if (isStatePlusUsZipSegment(last)) {
      out.pop()
      changed = true
      continue
    }
  }
  return out
}

/**
 * Shorter label for map and list UI: drop trailing postal/ZIP and country when clearly present.
 * Does not change stored `addressText`; display-only.
 */
export function formatAddressLineForMapList(addressText: string): string {
  let s = (addressText ?? '').trim()
  if (!s) return s

  const rawParts = s.split(',')
  if (rawParts.length > 1) {
    s = stripTrailingPostalCountryCommaSegments(rawParts).join(', ')
  }

  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(ADDRESS_LIST_COUNTRY_TAIL, '').trim()
    s = s.replace(/,\s*\d{5}(?:-\d{4})?\s*$/i, '').trim()
    s = s.replace(/,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\s*$/i, '').trim()
    s = s.replace(/,\s*[ABCEGHJ-NPRSTVXY]\d[A-Z]\s?\d[A-Z]\d\s*$/i, '').trim()
    s = s.replace(/,\s*[A-Z]{1,2}\d[A-Z0-9]?\s*\d[A-Z]{2}\s*$/i, '').trim()
    s = s.replace(/,\s*\d{4}\s?[A-Z]{2}\s*$/i, '').trim()
    s = s.replace(/,\s*\d{4,6}\s*$/i, '').trim()
    s = s.replace(/,\s*\d{3}\s\d{2}\s*$/i, '').trim()
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

/** Same bounds as the case map “Fit canvass” control (filtered list when filters hide all rows). */
export function boundsForPdfExportFitCanvass(
  filtered: Location[],
  locations: Location[],
): InstanceType<typeof L.LatLngBounds> | null {
  const pts = filtered.length ? filtered : locations
  if (!pts.length) return null
  const b = extendBoundsWithLocations(null, pts)
  if (!b || !b.isValid()) return null
  return b.pad(0.2)
}

/** Same bounds as “Fit paths” (visible track points on map). */
export function boundsForPdfExportFitPaths(
  trackingMapPoints: Array<{ lat: number; lon: number }>,
): InstanceType<typeof L.LatLngBounds> | null {
  if (!trackingMapPoints.length) return null
  const b = extendBoundsWithPathPoints(null, trackingMapPoints)
  if (!b || !b.isValid()) return null
  return b.pad(0.18)
}

/** Same bounds as “Fit all” (canvass + paths). */
export function boundsForPdfExportFitAll(
  filtered: Location[],
  locations: Location[],
  trackingMapPoints: Array<{ lat: number; lon: number }>,
): InstanceType<typeof L.LatLngBounds> | null {
  const locPts = filtered.length ? filtered : locations
  let b = extendBoundsWithLocations(null, locPts)
  b = extendBoundsWithPathPoints(b, trackingMapPoints)
  if (!b || !b.isValid()) return null
  return b.pad(0.2)
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

function normalizeStreetTokenTail(segment: string): string {
  let s = segment.trim()
  s = s.replace(/\bstreet\b\.?$/i, 'st')
  s = s.replace(/\bavenue\b\.?$/i, 'ave')
  s = s.replace(/\broad\b\.?$/i, 'rd')
  s = s.replace(/\bdrive\b\.?$/i, 'dr')
  s = s.replace(/\bplace\b\.?$/i, 'pl')
  s = s.replace(/\blane\b\.?$/i, 'ln')
  s = s.replace(/\bboulevard\b\.?$/i, 'blvd')
  return s.trim()
}

function normalizeAddressKey(addressText: string): string | null {
  const raw = (addressText ?? '').trim()
  if (!raw) return null

  // Normalize to "first comma segment" (usually: `${housenumber} ${street}`)
  // Example: "160-25 150th St, Queens, New York, United States" -> "160-25 150th st"
  const first = raw.split(',')[0]?.trim() ?? ''
  if (!first) return null

  return normalizeStreetTokenTail(
    first
      .toLowerCase()
      .replace(/\s+/g, ' ')
      // Make sure "160 - 23" and "160-23" match.
      .replace(/\s*-\s*/g, '-'),
  )
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

/** Same-case duplicate check for `createLocation` (normalized street segment; St/Street, etc.). */
export function findDuplicateLocationInCaseByAddressText(
  locations: Location[],
  caseId: string,
  addressText: string,
): Location | null {
  const clickedKey = normalizeAddressKey(addressText)
  if (!clickedKey) return null
  for (const l of locations) {
    if (l.caseId !== caseId) continue
    const key = normalizeAddressKey(l.addressText)
    if (key && key === clickedKey) return l
  }
  return null
}

/**
 * Whether to update an existing location row or create a new one after the user picks a (non-probative) status.
 * `mode: 'new'` creates unless the same normalized street label already exists in `locations` (case-scoped list).
 */
export function decideCanvassSaveTarget(
  locations: Location[],
  session: CanvassMapResultSession,
): { kind: 'update'; id: string } | { kind: 'create'; pending: PendingAddItem } {
  if (session.mode === 'existing') {
    return { kind: 'update', id: session.locationId }
  }
  const dup = findLocationByAddressText(locations, session.addressText)
  if (dup) {
    return { kind: 'update', id: dup.id }
  }
  const pending: PendingAddItem = {
    lat: session.lat,
    lon: session.lon,
    addressText: session.addressText,
    bounds: session.bounds,
    vectorTileBuildingRing: session.vectorTileBuildingRing,
  }
  return { kind: 'create', pending }
}
