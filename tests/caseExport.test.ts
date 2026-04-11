import { describe, expect, it } from 'vitest'
import {
  clearExportSelections,
  selectAllExportSelections,
  validateCaseExportSelections,
  type CaseExportSelections,
} from '../src/lib/caseExportOptions'
import { locationsToExportCoords, trackPointsToExportCoords } from '../src/lib/caseExportCoords'
import { buildCaseTracksCsvContent, sortTrackPointsForExportCsv } from '../src/lib/caseTracksCsv'
import type { Location, Track, TrackPoint } from '../src/lib/types'

function sel(p: Partial<CaseExportSelections>): CaseExportSelections {
  return { ...clearExportSelections(), ...p }
}

describe('validateCaseExportSelections', () => {
  it('rejects when nothing selected', () => {
    expect(validateCaseExportSelections(clearExportSelections())).toMatch(/at least one export format/i)
  })

  it('rejects PDF with no sections', () => {
    expect(
      validateCaseExportSelections(
        sel({
          pdf: true,
          pdfSummary: false,
          pdfAddressesTable: false,
          pdfTracksTable: false,
          pdfMapFull: false,
          pdfMapAddresses: false,
          pdfMapTracks: false,
        }),
      ),
    ).toMatch(/at least one PDF section/i)
  })

  it('accepts CSV only', () => {
    expect(validateCaseExportSelections(sel({ csvAddresses: true }))).toBeNull()
  })

  it('accepts PDF with summary only', () => {
    expect(validateCaseExportSelections(sel({ pdf: true, pdfSummary: true }))).toBeNull()
  })

  it('rejects Fit paths when paths exist but none checked', () => {
    expect(
      validateCaseExportSelections(
        sel({
          pdf: true,
          pdfSummary: true,
          pdfMapTracks: true,
          pdfMapPathTrackIds: [],
        }),
        { pdfPathChoiceCount: 2 },
      ),
    ).toMatch(/at least one path/i)
  })

  it('rejects PDF address sections when no canvass results selected', () => {
    expect(
      validateCaseExportSelections(
        sel({
          pdf: true,
          pdfSummary: false,
          pdfAddressesTable: true,
          pdfTracksTable: false,
          pdfMapFull: false,
          pdfMapAddresses: false,
          pdfMapTracks: false,
          exportAddressStatuses: [],
        }),
      ),
    ).toMatch(/canvass result/i)
  })
})

describe('selectAllExportSelections', () => {
  it('enables all flags', () => {
    const a = selectAllExportSelections()
    expect(a.csvAddresses && a.csvTracks && a.pdf).toBe(true)
    expect(a.pdfMapFull && a.pdfMapAddresses && a.pdfMapTracks).toBe(true)
    expect(a.pdfMapPathTrackIds).toEqual([])
    expect(a.exportAddressStatuses.length).toBe(4)
  })
})

describe('caseExportCoords', () => {
  it('maps locations and track points', () => {
    const locs: Location[] = [
      {
        id: 'l1',
        caseId: 'c1',
        addressText: '1 Main',
        lat: 1,
        lon: 2,
        bounds: null,
        footprint: null,
        status: 'noCameras',
        notes: '',
        lastVisitedAt: null,
        createdByUserId: '',
        createdAt: 0,
        updatedAt: 0,
      },
    ]
    expect(locationsToExportCoords(locs)).toEqual([{ lat: 1, lon: 2 }])
    const pts: TrackPoint[] = [
      {
        id: 'p2',
        caseId: 'c1',
        trackId: 't1',
        locationId: null,
        addressText: 'step',
        lat: 3,
        lon: 4,
        sequence: 1,
        visitedAt: null,
        notes: '',
        showOnMap: true,
        displayTimeOnMap: false,
        mapTimeLabelOffsetX: 0,
        mapTimeLabelOffsetY: 0,
        placementSource: 'map',
        createdByUserId: '',
        createdAt: 0,
      },
      {
        id: 'p1',
        caseId: 'c1',
        trackId: 't1',
        locationId: null,
        addressText: 'step',
        lat: 5,
        lon: 6,
        sequence: 0,
        visitedAt: null,
        notes: '',
        showOnMap: true,
        displayTimeOnMap: false,
        mapTimeLabelOffsetX: 0,
        mapTimeLabelOffsetY: 0,
        placementSource: 'map',
        createdByUserId: '',
        createdAt: 0,
      },
    ]
    const sorted = sortTrackPointsForExportCsv(pts)
    expect(sorted.map((p) => p.sequence)).toEqual([0, 1])
    expect(trackPointsToExportCoords(sortTrackPointsForExportCsv(pts))).toEqual([
      { lat: 5, lon: 6 },
      { lat: 3, lon: 4 },
    ])
  })
})

describe('buildCaseTracksCsvContent', () => {
  it('includes header and escaped fields', () => {
    const tracks: Track[] = [
      {
        id: 't1',
        caseId: 'c1',
        label: 'Subject A',
        kind: 'person',
        routeColor: '',
        createdByUserId: '',
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const points: TrackPoint[] = [
      {
        id: 'p1',
        caseId: 'c1',
        trackId: 't1',
        locationId: null,
        addressText: 'Has,comma',
        lat: 10,
        lon: 20,
        sequence: 0,
        visitedAt: null,
        notes: 'Say "hi"',
        showOnMap: true,
        displayTimeOnMap: false,
        mapTimeLabelOffsetX: 0,
        mapTimeLabelOffsetY: 0,
        placementSource: 'import',
        createdByUserId: '',
        createdAt: 0,
      },
    ]
    const csv = buildCaseTracksCsvContent(tracks, points)
    expect(csv.split('\n')[0]).toContain('trackLabel')
    expect(csv).toMatch(/"Has,comma"/)
    expect(csv).toMatch(/"Say ""hi"""/)
  })
})
