import { describe, expect, it, vi } from 'vitest'

vi.mock('leaflet', () => ({ default: {} }))

import { decideCanvassSaveTarget, newCanvassMapResultSessionKey } from '../src/app/casePageHelpers'
import type { Location } from '../src/lib/types'

describe('decideCanvassSaveTarget', () => {
  it('existing mode always targets that location id', () => {
    const session = { key: 'k', mode: 'existing' as const, locationId: 'row-1' }
    expect(decideCanvassSaveTarget([], session)).toEqual({ kind: 'update', id: 'row-1' })
  })

  it('new session updates existing row when normalized street matches (no duplicate list entries)', () => {
    const locations: Location[] = [
      {
        id: 'dup',
        caseId: 'c',
        addressText: '100 Main St, Queens, NY',
        lat: 40.7,
        lon: -73.9,
        bounds: null,
        footprint: null,
        status: 'noCameras',
        notes: '',
        lastVisitedAt: null,
        createdByUserId: '',
        createdAt: 0,
        updatedAt: 0,
      } as Location,
    ]
    const session = {
      key: newCanvassMapResultSessionKey(),
      mode: 'new' as const,
      lat: 40.7,
      lon: -73.9,
      addressText: '100 Main St, New York, USA',
    }
    expect(decideCanvassSaveTarget(locations, session)).toEqual({
      kind: 'update',
      id: 'dup',
    })
  })

  it('new session with no saved locations yields create with pending payload', () => {
    const session = {
      key: newCanvassMapResultSessionKey(),
      mode: 'new' as const,
      lat: 41,
      lon: -74,
      addressText: '999 Elsewhere Road',
    }
    const d = decideCanvassSaveTarget([], session)
    expect(d).toEqual({
      kind: 'create',
      pending: {
        lat: 41,
        lon: -74,
        addressText: '999 Elsewhere Road',
      },
    })
  })
})
