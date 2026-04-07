import { describe, expect, it } from 'vitest'
import {
  buildWaypointProximityGroups,
  DEFAULT_WAYPOINT_GROUP_MAX_NEIGHBOR_METERS,
  DEFAULT_WAYPOINT_GROUP_MAX_NEIGHBOR_TIME_MS,
  waypointGroupingToleranceToThresholds,
} from '../src/lib/trackWaypointProximityGroups'
import type { TrackPoint } from '../src/lib/types'

function mk(
  id: string,
  trackId: string,
  seq: number,
  lat: number,
  lon: number,
  visitedAt: number,
): TrackPoint {
  const createdAt = visitedAt
  return {
    id,
    caseId: 'c',
    trackId,
    locationId: null,
    addressText: id,
    lat,
    lon,
    sequence: seq,
    visitedAt,
    notes: '',
    showOnMap: true,
    displayTimeOnMap: false,
    mapTimeLabelOffsetX: 0,
    mapTimeLabelOffsetY: 0,
    placementSource: 'map',
    createdByUserId: 'u',
    createdAt,
    updatedAt: createdAt,
  }
}

describe('waypointGroupingToleranceToThresholds', () => {
  it('uses scale 1 at tolerance 20 (legacy defaults)', () => {
    const { maxNeighborMeters, maxNeighborTimeMs } = waypointGroupingToleranceToThresholds(20)
    expect(maxNeighborMeters).toBeCloseTo(DEFAULT_WAYPOINT_GROUP_MAX_NEIGHBOR_METERS, 5)
    expect(maxNeighborTimeMs).toBeCloseTo(DEFAULT_WAYPOINT_GROUP_MAX_NEIGHBOR_TIME_MS, 5)
  })

  it('increases thresholds when tolerance is higher', () => {
    const low = waypointGroupingToleranceToThresholds(0)
    const high = waypointGroupingToleranceToThresholds(100)
    expect(high.maxNeighborMeters).toBeGreaterThan(low.maxNeighborMeters)
    expect(high.maxNeighborTimeMs).toBeGreaterThan(low.maxNeighborTimeMs)
  })
})

describe('buildWaypointProximityGroups', () => {
  it('splits when distance exceeds threshold', () => {
    const t0 = 1_700_000_000_000
    const pts = [
      mk('a', 'tr', 0, 40.0, -74.0, t0),
      mk('b', 'tr', 1, 40.0001, -74.0, t0 + 60_000),
      mk('c', 'tr', 2, 40.5, -74.0, t0 + 120_000),
    ]
    const g = buildWaypointProximityGroups(pts, 32, 8 * 60_000)
    expect(g.length).toBe(2)
    expect(g[0]!.points.map((p) => p.id)).toEqual(['a', 'b'])
    expect(g[1]!.points.map((p) => p.id)).toEqual(['c'])
  })

  it('splits when time gap exceeds threshold', () => {
    const t0 = 1_700_000_000_000
    const pts = [
      mk('a', 'tr', 0, 40.0, -74.0, t0),
      mk('b', 'tr', 1, 40.0001, -74.0, t0 + 20 * 60_000),
    ]
    const g = buildWaypointProximityGroups(pts, 32, 8 * 60_000)
    expect(g.length).toBe(2)
  })

  it('keeps one group when neighbors are close in space and time', () => {
    const t0 = 1_700_000_000_000
    const pts = [
      mk('a', 'tr', 0, 40.0, -74.0, t0),
      mk('b', 'tr', 1, 40.00005, -74.0, t0 + 60_000),
      mk('c', 'tr', 2, 40.0001, -74.0, t0 + 120_000),
    ]
    const g = buildWaypointProximityGroups(pts, 32, 8 * 60_000)
    expect(g.length).toBe(1)
    expect(g[0]!.points).toHaveLength(3)
  })
})
