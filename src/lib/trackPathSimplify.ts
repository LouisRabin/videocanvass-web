/**
 * Map display simplification: distance decimation and contiguous dwell segments (backtrack-safe).
 */

import type { TrackPoint } from './types'
import { isMapPlacedTrackPoint } from './trackPointPlacement'

const EARTH_RADIUS_M = 6_371_000

export function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180
  const dLat = (bLat - aLat) * r
  const dLon = (bLon - aLon) * r
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(x)))
}

export type TrackSimplifyPreset = 'off' | 'moderate' | 'aggressive'

export function decimationEpsilonMeters(preset: TrackSimplifyPreset): number {
  if (preset === 'off') return 0
  if (preset === 'moderate') return 28
  return 75
}

/** Epsilon for grouping contiguous points into one “stay” (dwell copy). */
export function dwellEpsilonMeters(preset: TrackSimplifyPreset): number {
  if (preset === 'off') return 22
  if (preset === 'moderate') return 38
  return 65
}

/**
 * Minimum-distance decimation along sorted path. Always includes first and last of each run;
 * `selectedPointId` is forced in if present in `sortedPoints`.
 */
export function decimateTrackPointIds(
  sortedPoints: Pick<TrackPoint, 'id' | 'lat' | 'lon'>[],
  epsilonMeters: number,
  selectedPointId: string | null,
): Set<string> {
  const ids = new Set<string>()
  if (sortedPoints.length === 0) return ids
  if (epsilonMeters <= 0) {
    for (const p of sortedPoints) ids.add(p.id)
    return ids
  }

  let lastKept = sortedPoints[0]!
  ids.add(lastKept.id)
  for (let i = 1; i < sortedPoints.length - 1; i++) {
    const p = sortedPoints[i]!
    const d = haversineMeters(lastKept.lat, lastKept.lon, p.lat, p.lon)
    if (d >= epsilonMeters) {
      ids.add(p.id)
      lastKept = p
    }
  }
  const last = sortedPoints[sortedPoints.length - 1]!
  ids.add(last.id)
  if (selectedPointId && sortedPoints.some((p) => p.id === selectedPointId)) {
    ids.add(selectedPointId)
  }
  return ids
}

export type DwellSegment = {
  /** 1-based step index along sorted path (same as map step chip for that track). */
  startStepNum: number
  endStepNum: number
  pointIds: string[]
  startMs: number | null
  endMs: number | null
}

function effectiveMs(p: Pick<TrackPoint, 'visitedAt' | 'createdAt'>): number | null {
  if (p.visitedAt != null) return p.visitedAt
  return p.createdAt
}

/**
 * Contiguous runs: extend while each point stays within `epsilonMeters` of the run **anchor**
 * (first point). When the path moves outside, close the run — a later return to the same area
 * starts a new segment (backtrack-safe).
 */
export function computeContiguousDwellSegments(
  sortedPoints: Pick<TrackPoint, 'id' | 'lat' | 'lon' | 'visitedAt' | 'createdAt'>[],
  epsilonMeters: number,
): DwellSegment[] {
  if (sortedPoints.length === 0) return []
  const out: DwellSegment[] = []
  let i = 0
  while (i < sortedPoints.length) {
    const anchor = sortedPoints[i]!
    let j = i
    while (j + 1 < sortedPoints.length) {
      const next = sortedPoints[j + 1]!
      if (haversineMeters(anchor.lat, anchor.lon, next.lat, next.lon) > epsilonMeters) break
      j++
    }
    const slice = sortedPoints.slice(i, j + 1)
    const startMs = effectiveMs(slice[0]!)
    const endMs = effectiveMs(slice[slice.length - 1]!)
    out.push({
      startStepNum: i + 1,
      endStepNum: j + 1,
      pointIds: slice.map((p) => p.id),
      startMs,
      endMs,
    })
    i = j + 1
  }
  return out
}

/**
 * Per visible track: sort, decimate, merge. Returns points to pass to the map renderer.
 */
export function filterTrackPointsForMapDisplay(
  allPoints: TrackPoint[],
  tracks: Pick<{ id: string }, 'id'>[],
  visibleTrackIds: Record<string, boolean>,
  preset: TrackSimplifyPreset,
  selectedPointId: string | null,
): TrackPoint[] {
  if (preset === 'off') return allPoints

  const eps = decimationEpsilonMeters(preset)
  const byTrack = new Map<string, TrackPoint[]>()
  for (const p of allPoints) {
    if (visibleTrackIds[p.trackId] === false) continue
    if (p.showOnMap === false) continue
    const arr = byTrack.get(p.trackId) ?? []
    arr.push(p)
    byTrack.set(p.trackId, arr)
  }

  const sortInTrack = (pts: TrackPoint[]) =>
    pts.slice().sort((a, b) => {
      const ds = a.sequence - b.sequence
      if (ds !== 0) return ds
      const dt = (a.visitedAt ?? a.createdAt) - (b.visitedAt ?? b.createdAt)
      if (dt !== 0) return dt
      return a.id.localeCompare(b.id)
    })

  const kept = new Set<string>()
  for (const t of tracks) {
    if (visibleTrackIds[t.id] === false) continue
    const pts = byTrack.get(t.id)
    if (!pts?.length) continue
    const sorted = sortInTrack(pts)
    const sel = selectedPointId && sorted.some((p) => p.id === selectedPointId) ? selectedPointId : null
    const ids = decimateTrackPointIds(sorted, eps, sel)
    for (const id of ids) kept.add(id)
    // User-placed subject steps must all stay visible; decimation is for dense import/GPS paths.
    for (const p of sorted) {
      if (isMapPlacedTrackPoint(p)) kept.add(p.id)
    }
  }

  return allPoints.filter((p) => kept.has(p.id))
}
