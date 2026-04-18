import { describe, expect, it } from 'vitest'
import {
  buildResolvedTrackColorMap,
  collectUsedResolvedRouteColors,
  pickRouteColorForNewTrack,
  TRACK_DEFAULT_COLORS_FIRST_FOUR,
} from '../src/lib/trackColors'
import type { Track } from '../src/lib/types'

function tr(partial: Partial<Track> & Pick<Track, 'id' | 'createdAt'>): Track {
  return {
    id: partial.id,
    caseId: partial.caseId ?? 'c1',
    label: partial.label ?? 'T',
    kind: partial.kind ?? 'person',
    createdAt: partial.createdAt,
    createdByUserId: partial.createdByUserId ?? 'u1',
    routeColor: partial.routeColor ?? '',
  }
}

describe('buildResolvedTrackColorMap', () => {
  it('assigns distinct defaults when all routeColor empty', () => {
    const tracks = [
      tr({ id: 'a', createdAt: 1 }),
      tr({ id: 'b', createdAt: 2 }),
      tr({ id: 'c', createdAt: 3 }),
      tr({ id: 'd', createdAt: 4 }),
    ]
    const m = buildResolvedTrackColorMap(tracks)
    const colors = tracks.map((t) => m.get(t.id)!)
    expect(new Set(colors).size).toBe(4)
    for (const c of colors) {
      expect(TRACK_DEFAULT_COLORS_FIRST_FOUR).toContain(c)
    }
  })

  it('skips default slot if that color is already used explicitly', () => {
    const tracks = [
      tr({ id: 'a', createdAt: 1, routeColor: TRACK_DEFAULT_COLORS_FIRST_FOUR[0] }),
      tr({ id: 'b', createdAt: 2, routeColor: '' }),
    ]
    const m = buildResolvedTrackColorMap(tracks)
    expect(m.get('b')).toBe(TRACK_DEFAULT_COLORS_FIRST_FOUR[1])
  })

  it('allows duplicate colors when user set routeColor explicitly', () => {
    const red = TRACK_DEFAULT_COLORS_FIRST_FOUR[1]
    const tracks = [
      tr({ id: 'a', createdAt: 1, routeColor: red }),
      tr({ id: 'b', createdAt: 2, routeColor: red }),
    ]
    const m = buildResolvedTrackColorMap(tracks)
    expect(m.get('a')).toBe(red)
    expect(m.get('b')).toBe(red)
  })
})

describe('collectUsedResolvedRouteColors', () => {
  it('matches distinct colors from buildResolvedTrackColorMap', () => {
    const tracks = [tr({ id: 'a', createdAt: 1 }), tr({ id: 'b', createdAt: 2 })]
    const fromMap = new Set(buildResolvedTrackColorMap(tracks).values())
    const used = collectUsedResolvedRouteColors(tracks)
    expect(used.size).toBe(fromMap.size)
    for (const c of fromMap) expect(used.has(c)).toBe(true)
  })
})

describe('pickRouteColorForNewTrack', () => {
  it('returns first unused default', () => {
    const existing = [tr({ id: 'a', createdAt: 1, routeColor: TRACK_DEFAULT_COLORS_FIRST_FOUR[0] })]
    const next = pickRouteColorForNewTrack(existing, 'new-id')
    expect(next).toBe(TRACK_DEFAULT_COLORS_FIRST_FOUR[1])
  })

  it('second path never reuses first path auto color (e.g. subject blue vs import path)', () => {
    const first = tr({ id: 'a', createdAt: 1, routeColor: '' })
    const firstResolved = buildResolvedTrackColorMap([first]).get('a')!
    const secondPick = pickRouteColorForNewTrack([first], 'b-new')
    expect(secondPick).not.toBe(firstResolved)
  })

  it('avoids all resolved colors when quartet is full', () => {
    const existing = [
      tr({ id: 'a', createdAt: 1, routeColor: '' }),
      tr({ id: 'b', createdAt: 2, routeColor: '' }),
      tr({ id: 'c', createdAt: 3, routeColor: '' }),
      tr({ id: 'd', createdAt: 4, routeColor: '' }),
    ]
    const used = new Set(buildResolvedTrackColorMap(existing).values())
    const next = pickRouteColorForNewTrack(existing, 'e-new')
    expect(used.has(next)).toBe(false)
  })
})
