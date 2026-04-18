import { describe, expect, it } from 'vitest'
import {
  computeContiguousDwellSegments,
  decimateTrackPointIds,
  filterTrackPointsForMapDisplay,
  haversineMeters,
} from '../src/lib/trackPathSimplify'
import type { Track, TrackPoint } from '../src/lib/types'

function tp(
  id: string,
  trackId: string,
  seq: number,
  lat: number,
  lon: number,
  visitedAt: number | null = null,
  placementSource: TrackPoint['placementSource'] = 'map',
): TrackPoint {
  const createdAt = 1_700_000_000_000
  return {
    id,
    caseId: 'c1',
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
    placementSource,
    createdByUserId: 'u',
    createdAt,
    updatedAt: createdAt,
  }
}

const t1: Pick<Track, 'id'> = { id: 'tr1' }

describe('haversineMeters', () => {
  it('is ~0 for identical points', () => {
    expect(haversineMeters(40.7, -74.0, 40.7, -74.0)).toBeLessThan(1)
  })
})

describe('decimateTrackPointIds', () => {
  it('keeps all when epsilon is 0', () => {
    const pts = [
      { id: 'a', lat: 0, lon: 0 },
      { id: 'b', lat: 0.001, lon: 0 },
      { id: 'c', lat: 0.5, lon: 0 },
    ]
    const s = decimateTrackPointIds(pts, 0, null)
    expect([...s].sort()).toEqual(['a', 'b', 'c'])
  })

  it('always includes first, last, and selected id', () => {
    const pts = [
      { id: 'a', lat: 40.0, lon: -74.0 },
      { id: 'b', lat: 40.0001, lon: -74.0 },
      { id: 'c', lat: 40.9, lon: -74.0 },
    ]
    const s = decimateTrackPointIds(pts, 5000, 'b')
    expect(s.has('a')).toBe(true)
    expect(s.has('c')).toBe(true)
    expect(s.has('b')).toBe(true)
  })
})

describe('computeContiguousDwellSegments', () => {
  it('splits when path leaves anchor radius (backtrack does not merge)', () => {
    const anchor = { id: 'a', lat: 40.0, lon: -74.0, visitedAt: null, createdAt: 1 }
    const near = { id: 'b', lat: 40.00001, lon: -74.0, visitedAt: null, createdAt: 2 }
    const far = { id: 'c', lat: 40.5, lon: -74.0, visitedAt: null, createdAt: 3 }
    const back = { id: 'd', lat: 40.00002, lon: -74.0, visitedAt: null, createdAt: 4 }
    const segs = computeContiguousDwellSegments([anchor, near, far, back], 200)
    expect(segs.length).toBe(3)
    expect(segs[0]!.pointIds).toEqual(['a', 'b'])
    expect(segs[1]!.pointIds).toEqual(['c'])
    expect(segs[2]!.pointIds).toEqual(['d'])
  })
})

describe('filterTrackPointsForMapDisplay', () => {
  it('returns full list when preset is off', () => {
    const points = [tp('p1', 'tr1', 0, 40, -74), tp('p2', 'tr1', 1, 40.00001, -74)]
    const out = filterTrackPointsForMapDisplay(points, [t1], { tr1: true }, 'off', null)
    expect(out).toBe(points)
  })

  it('hides invisible tracks', () => {
    const points = [tp('p1', 'tr1', 0, 40, -74), tp('q1', 'tr2', 0, 41, -75)]
    const out = filterTrackPointsForMapDisplay(points, [t1, { id: 'tr2' }], { tr1: true, tr2: false }, 'moderate', null)
    expect(out.every((p) => p.trackId === 'tr1')).toBe(true)
  })

  it('keeps every map-placed step even when simplify preset would decimate nearby points', () => {
    const points = Array.from({ length: 10 }, (_, i) => tp(`p${i}`, 'tr1', i, 40.0 + i * 1e-5, -74.0))
    const out = filterTrackPointsForMapDisplay(points, [t1], { tr1: true }, 'aggressive', null)
    expect(out).toHaveLength(10)
  })

  it('still decimates dense import-coordinate runs under aggressive preset', () => {
    const points = Array.from({ length: 8 }, (_, i) =>
      tp(`i${i}`, 'tr1', i, 40.0 + i * 1e-5, -74.0, null, 'import'),
    )
    const out = filterTrackPointsForMapDisplay(points, [t1], { tr1: true }, 'aggressive', null)
    expect(out.length).toBeLessThan(points.length)
  })
})
