import { describe, expect, it } from 'vitest'
import { buildTracksData } from '../src/lib/buildTrackLinesGeojson'
import type { Track, TrackPoint } from '../src/lib/types'

function pt(
  id: string,
  trackId: string,
  seq: number,
  lat: number,
  lon: number,
  placementSource: 'map' | 'import',
): TrackPoint {
  const createdAt = 1_700_000_000_000
  return {
    id,
    caseId: 'c',
    trackId,
    locationId: null,
    addressText: id,
    lat,
    lon,
    sequence: seq,
    visitedAt: null,
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

const tr: Track = {
  id: 't1',
  caseId: 'c',
  label: 'T',
  kind: 'person',
  routeColor: '#3b82f6',
  createdByUserId: 'u',
  createdAt: 1,
  updatedAt: 1,
}

describe('buildTracksData lineKind', () => {
  it('marks subject-only path as subject', () => {
    const points = [pt('a', 't1', 0, 40, -74, 'map'), pt('b', 't1', 1, 40.01, -74, 'map')]
    const { lines } = buildTracksData([tr], points, { t1: true }, () => '#00f')
    expect(lines.features).toHaveLength(1)
    expect(lines.features[0]!.properties?.lineKind).toBe('subject')
  })

  it('marks import-only path as coordinate', () => {
    const points = [pt('a', 't1', 0, 40, -74, 'import'), pt('b', 't1', 1, 40.01, -74, 'import')]
    const { lines } = buildTracksData([tr], points, { t1: true }, () => '#00f')
    expect(lines.features).toHaveLength(1)
    expect(lines.features[0]!.properties?.lineKind).toBe('coordinate')
  })

  it('splits when style changes along the path', () => {
    const points = [
      pt('a', 't1', 0, 40.0, -74, 'map'),
      pt('b', 't1', 1, 40.1, -74, 'map'),
      pt('c', 't1', 2, 40.2, -74, 'import'),
      pt('d', 't1', 3, 40.3, -74, 'import'),
    ]
    const { lines } = buildTracksData([tr], points, { t1: true }, () => '#00f')
    const kinds = lines.features.map((f) => f.properties?.lineKind)
    expect(kinds).toContain('subject')
    expect(kinds).toContain('coordinate')
  })
})
