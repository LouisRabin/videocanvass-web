import { describe, expect, it, vi } from 'vitest'

vi.mock('leaflet', () => ({ default: {} }))

import { samePendingPin } from '../src/app/casePageHelpers'

describe('samePendingPin', () => {
  it('treats coordinates as equal when they match at 6 decimal places', () => {
    expect(
      samePendingPin(
        { lat: 40.7580000001, lon: -73.9855 },
        { lat: 40.758, lon: -73.9855 },
      ),
    ).toBe(true)
  })

  it('distinguishes pins that differ beyond 6 decimal places', () => {
    expect(
      samePendingPin(
        { lat: 40.7581, lon: -73.9855 },
        { lat: 40.758, lon: -73.9855 },
      ),
    ).toBe(false)
  })

  it('matches identical floats', () => {
    expect(samePendingPin({ lat: 1.5, lon: -2.25 }, { lat: 1.5, lon: -2.25 })).toBe(true)
  })
})
