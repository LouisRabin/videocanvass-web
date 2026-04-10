import { describe, expect, it } from 'vitest'
import {
  canAddCaseContent,
  canDeleteLocation,
  canDeleteTrack,
  canDeleteTrackPoint,
  canEditLocation,
  canEditTrack,
  canEditTrackPoint,
  canMutateCaseContent,
  hasCaseAccess,
} from '../src/lib/casePermissions'
import type { AppData, CaseFile, Location, Track, TrackPoint } from '../src/lib/types'
import { DEFAULT_DATA } from '../src/lib/types'

const baseCase = (ownerId: string): CaseFile => ({
  id: 'case-1',
  ownerUserId: ownerId,
  organizationId: null,
  unitId: null,
  caseNumber: 'C-1',
  title: 'Test case',
  description: '',
  createdAt: 1,
  updatedAt: 1,
  lifecycle: 'open',
})

const sampleLoc = (createdBy: string): Location => ({
  id: 'loc-1',
  caseId: 'case-1',
  addressText: '1 Main St',
  lat: 40,
  lon: -73,
  bounds: null,
  footprint: null,
  status: 'noCameras',
  notes: '',
  lastVisitedAt: null,
  createdByUserId: createdBy,
  createdAt: 1,
  updatedAt: 1,
})

const sampleTrack = (createdBy: string): Track => ({
  id: 'tr-1',
  caseId: 'case-1',
  label: 'Track A',
  kind: 'person',
  routeColor: '',
  createdByUserId: createdBy,
  createdAt: 1,
  updatedAt: 1,
})

const samplePoint = (createdBy: string): TrackPoint => ({
  id: 'tp-1',
  caseId: 'case-1',
  trackId: 'tr-1',
  locationId: null,
  addressText: 'Pin',
  lat: 40,
  lon: -73,
  sequence: 0,
  visitedAt: null,
  notes: '',
  showOnMap: true,
  displayTimeOnMap: false,
  mapTimeLabelOffsetX: 0,
  mapTimeLabelOffsetY: 0,
  placementSource: 'map',
  createdByUserId: createdBy,
  createdAt: 1,
  updatedAt: 1,
})

function dataWith(
  overrides: Partial<{
    caseFile: CaseFile
    collaborators: AppData['caseCollaborators']
    locations: Location[]
  }>,
): AppData {
  const caseFile = overrides.caseFile ?? baseCase('owner-1')
  return {
    ...DEFAULT_DATA,
    cases: [caseFile],
    caseCollaborators: overrides.collaborators ?? [],
    locations: overrides.locations ?? [],
  }
}

describe('canMutateCaseContent / viewer vs editor', () => {
  it('owner can mutate', () => {
    const d = dataWith({})
    expect(canMutateCaseContent(d, 'case-1', 'owner-1')).toBe(true)
    expect(canAddCaseContent(d, 'case-1', 'owner-1')).toBe(true)
  })

  it('viewer collaborator cannot mutate', () => {
    const d = dataWith({
      collaborators: [{ caseId: 'case-1', userId: 'u-view', role: 'viewer', createdAt: 1 }],
    })
    expect(hasCaseAccess(d, 'case-1', 'u-view')).toBe(true)
    expect(canMutateCaseContent(d, 'case-1', 'u-view')).toBe(false)
    expect(canAddCaseContent(d, 'case-1', 'u-view')).toBe(false)
  })

  it('editor collaborator can mutate (add)', () => {
    const d = dataWith({
      collaborators: [{ caseId: 'case-1', userId: 'u-ed', role: 'editor', createdAt: 1 }],
    })
    expect(canMutateCaseContent(d, 'case-1', 'u-ed')).toBe(true)
    expect(canAddCaseContent(d, 'case-1', 'u-ed')).toBe(true)
  })

  it('editor can edit any location but only delete own; viewer cannot edit', () => {
    const locByOwner = sampleLoc('owner-1')
    const d = dataWith({
      collaborators: [{ caseId: 'case-1', userId: 'u-ed', role: 'editor', createdAt: 1 }],
      locations: [locByOwner],
    })
    expect(canEditLocation(d, 'u-ed', locByOwner)).toBe(true)
    expect(canDeleteLocation(d, 'u-ed', locByOwner)).toBe(false)

    const locOwn = sampleLoc('u-ed')
    const dOwn = dataWith({
      collaborators: [{ caseId: 'case-1', userId: 'u-ed', role: 'editor', createdAt: 1 }],
      locations: [locOwn],
    })
    expect(canDeleteLocation(dOwn, 'u-ed', locOwn)).toBe(true)

    const dView = dataWith({
      collaborators: [{ caseId: 'case-1', userId: 'u-view', role: 'viewer', createdAt: 1 }],
      locations: [{ ...locOwn, createdByUserId: 'u-view' }],
    })
    expect(canEditLocation(dView, 'u-view', dView.locations[0]!)).toBe(false)
  })

  it('editor can edit any track / track point but only delete if creator', () => {
    const tr = sampleTrack('owner-1')
    const pt = samplePoint('owner-1')
    const d = dataWith({
      collaborators: [{ caseId: 'case-1', userId: 'u-ed', role: 'editor', createdAt: 1 }],
    })
    expect(canEditTrack(d, 'u-ed', tr)).toBe(true)
    expect(canDeleteTrack(d, 'u-ed', tr)).toBe(false)
    expect(canEditTrackPoint(d, 'u-ed', pt)).toBe(true)
    expect(canDeleteTrackPoint(d, 'u-ed', pt)).toBe(false)

    const trOwn = sampleTrack('u-ed')
    const ptOwn = samplePoint('u-ed')
    expect(canDeleteTrack(d, 'u-ed', trOwn)).toBe(true)
    expect(canDeleteTrackPoint(d, 'u-ed', ptOwn)).toBe(true)
  })

  it('stranger has no access', () => {
    const d = dataWith({})
    expect(hasCaseAccess(d, 'case-1', 'nobody')).toBe(false)
    expect(canMutateCaseContent(d, 'case-1', 'nobody')).toBe(false)
  })

  it('unit member has read access without collaborator row but cannot mutate (matches vc_case_visible / vc_case_editor)', () => {
    const unitId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const d = dataWith({
      caseFile: { ...baseCase('owner-1'), unitId },
    })
    expect(hasCaseAccess(d, 'case-1', 'u-unit')).toBe(false)
    const d2 = { ...d, myUnitIds: [unitId] }
    expect(hasCaseAccess(d2, 'case-1', 'u-unit')).toBe(true)
    expect(canMutateCaseContent(d2, 'case-1', 'u-unit')).toBe(false)
    expect(canAddCaseContent(d2, 'case-1', 'u-unit')).toBe(false)
  })
})
