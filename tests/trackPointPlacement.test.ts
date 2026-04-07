import { describe, expect, it } from 'vitest'
import { trackBelongsInTracksMapTab } from '../src/lib/trackPointPlacement'

describe('trackBelongsInTracksMapTab', () => {
  const tid = 'track-1'

  it('includes empty paths (no points)', () => {
    expect(trackBelongsInTracksMapTab({ id: tid }, [])).toBe(true)
    expect(trackBelongsInTracksMapTab({ id: tid }, [{ trackId: 'other', placementSource: 'import' }])).toBe(true)
  })

  it('includes paths with at least one map-placed point', () => {
    expect(
      trackBelongsInTracksMapTab({ id: tid }, [
        { trackId: tid, placementSource: 'import' },
        { trackId: tid, placementSource: 'map' },
      ]),
    ).toBe(true)
  })

  it('excludes import-only paths', () => {
    expect(trackBelongsInTracksMapTab({ id: tid }, [{ trackId: tid, placementSource: 'import' }])).toBe(false)
  })

  it('treats legacy points without placementSource as map-placed', () => {
    expect(trackBelongsInTracksMapTab({ id: tid }, [{ trackId: tid }])).toBe(true)
  })
})
