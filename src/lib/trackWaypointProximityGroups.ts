/**
 * Group consecutive track points that are close in space and time (map marker lumping).
 */

import type { TrackPoint } from './types'
import { haversineMeters } from './trackPathSimplify'

export type WaypointMapProximityGroup = {
  /** Stable key for expand/collapse state */
  key: string
  trackId: string
  points: TrackPoint[]
  centroidLat: number
  centroidLon: number
}

function effectiveMs(p: TrackPoint): number {
  return p.visitedAt ?? p.createdAt
}

/** Default: ~2 house lots; neighbors must also be within time window. */
export const DEFAULT_WAYPOINT_GROUP_MAX_NEIGHBOR_METERS = 32
/** Default: 8 minutes between consecutive steps to stay in the same lump */
export const DEFAULT_WAYPOINT_GROUP_MAX_NEIGHBOR_TIME_MS = 8 * 60 * 1000

const WAYPOINT_GROUP_TOLERANCE_STORAGE_KEY = 'vc.waypointGroupTolerance'

/**
 * UI slider 0–100: lower = stricter (smaller distance/time → fewer steps lumped per pin).
 * Higher = looser (more lumping). Default 20 reproduces the historical base thresholds (scale 1.0).
 */
export function waypointGroupingToleranceToThresholds(tolerance0to100: number): {
  maxNeighborMeters: number
  maxNeighborTimeMs: number
} {
  const t = Math.min(100, Math.max(0, tolerance0to100))
  const scale = 0.5 + (t / 100) * 2.5
  return {
    maxNeighborMeters: DEFAULT_WAYPOINT_GROUP_MAX_NEIGHBOR_METERS * scale,
    maxNeighborTimeMs: DEFAULT_WAYPOINT_GROUP_MAX_NEIGHBOR_TIME_MS * scale,
  }
}

export function readStoredWaypointGroupTolerance(): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(WAYPOINT_GROUP_TOLERANCE_STORAGE_KEY) : null
    if (raw == null) return 20
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return 20
    return Math.min(100, Math.max(0, n))
  } catch {
    return 20
  }
}

export function saveWaypointGroupTolerance(value: number): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(WAYPOINT_GROUP_TOLERANCE_STORAGE_KEY, String(Math.min(100, Math.max(0, Math.round(value)))))
  } catch {
    /* ignore */
  }
}

/**
 * Partition sorted path into maximal runs where each consecutive pair is within
 * `maxNeighborMeters` and `maxNeighborTimeMs` (|Δt| between effective times).
 */
export function buildWaypointProximityGroups(
  sortedPoints: TrackPoint[],
  maxNeighborMeters: number,
  maxNeighborTimeMs: number,
): WaypointMapProximityGroup[] {
  if (sortedPoints.length === 0) return []
  const out: WaypointMapProximityGroup[] = []
  let runStart = 0
  for (let i = 1; i <= sortedPoints.length; i++) {
    const end = i === sortedPoints.length
    let breakRun = end
    if (!end) {
      const prev = sortedPoints[i - 1]!
      const cur = sortedPoints[i]!
      const d = haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon)
      const dt = Math.abs(effectiveMs(cur) - effectiveMs(prev))
      breakRun = d > maxNeighborMeters || dt > maxNeighborTimeMs
    }
    if (breakRun) {
      const slice = sortedPoints.slice(runStart, i)
      const first = slice[0]!
      const last = slice[slice.length - 1]!
      const centroidLat = slice.reduce((s, p) => s + p.lat, 0) / slice.length
      const centroidLon = slice.reduce((s, p) => s + p.lon, 0) / slice.length
      out.push({
        key: `${first.trackId}:${first.id}:${last.id}`,
        trackId: first.trackId,
        points: slice,
        centroidLat,
        centroidLon,
      })
      runStart = i
    }
  }
  return out
}
