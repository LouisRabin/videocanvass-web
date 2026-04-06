/**
 * Case access and edit rules for owners vs team members (collaborators).
 *
 * Owner: full control. Team member: add addresses; edit locations they created OR in "Needs Follow up";
 * delete only locations they created; add tracks/points; edit/delete tracks and points they created;
 * cannot rename/delete case or manage collaborators. Legacy rows with empty createdByUserId count as the case owner.
 */

import type { AppData, CaseAttachment, CaseFile, Location, Track, TrackPoint } from './types'

class PermissionDeniedError extends Error {
  constructor(message = 'Permission denied') {
    super(message)
    this.name = 'PermissionDeniedError'
  }
}

export function assertPermission(cond: boolean, message?: string): asserts cond {
  if (!cond) throw new PermissionDeniedError(message)
}

export function findCase(data: AppData, caseId: string): CaseFile | undefined {
  return data.cases.find((c) => c.id === caseId)
}

function isCaseOwner(caseFile: CaseFile, userId: string): boolean {
  return caseFile.ownerUserId === userId
}

/** User has a collaborator row on this case (any role). */
function isCaseCollaborator(data: AppData, caseId: string, userId: string): boolean {
  return data.caseCollaborators.some((cc) => cc.caseId === caseId && cc.userId === userId)
}

export function hasCaseAccess(data: AppData, caseId: string, userId: string): boolean {
  const c = findCase(data, caseId)
  if (!c) return false
  if (isCaseOwner(c, userId)) return true
  return isCaseCollaborator(data, caseId, userId)
}

function effectiveLocationCreatorId(loc: Location, caseOwnerId: string): string {
  return loc.createdByUserId.trim() || caseOwnerId
}

function effectiveTrackCreatorId(t: Track, caseOwnerId: string): string {
  return t.createdByUserId.trim() || caseOwnerId
}

function effectiveTrackPointCreatorId(p: TrackPoint, caseOwnerId: string): string {
  return p.createdByUserId.trim() || caseOwnerId
}

export function canEditCaseMeta(data: AppData, caseId: string, actorUserId: string): boolean {
  const c = findCase(data, caseId)
  return !!c && isCaseOwner(c, actorUserId)
}

export function canDeleteCase(data: AppData, caseId: string, actorUserId: string): boolean {
  return canEditCaseMeta(data, caseId, actorUserId)
}

/** Create locations, tracks, track points (and similar). */
export function canAddCaseContent(data: AppData, caseId: string, actorUserId: string): boolean {
  return hasCaseAccess(data, caseId, actorUserId)
}

export function canEditLocation(data: AppData, actorUserId: string, loc: Location): boolean {
  const c = findCase(data, loc.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  if (!hasCaseAccess(data, loc.caseId, actorUserId)) return false
  const ownerId = c.ownerUserId
  if (effectiveLocationCreatorId(loc, ownerId) === actorUserId) return true
  if (loc.status === 'camerasNoAnswer') return true
  return false
}

export function canDeleteLocation(data: AppData, actorUserId: string, loc: Location): boolean {
  const c = findCase(data, loc.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  if (!hasCaseAccess(data, loc.caseId, actorUserId)) return false
  return effectiveLocationCreatorId(loc, c.ownerUserId) === actorUserId
}

export function canEditTrack(data: AppData, actorUserId: string, track: Track): boolean {
  const c = findCase(data, track.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  if (!hasCaseAccess(data, track.caseId, actorUserId)) return false
  return effectiveTrackCreatorId(track, c.ownerUserId) === actorUserId
}

export function canDeleteTrack(data: AppData, actorUserId: string, track: Track): boolean {
  return canEditTrack(data, actorUserId, track)
}

export function canDeleteAllTracksForCase(data: AppData, caseId: string, actorUserId: string): boolean {
  return canEditCaseMeta(data, caseId, actorUserId)
}

export function canEditTrackPoint(data: AppData, actorUserId: string, pt: TrackPoint): boolean {
  const c = findCase(data, pt.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  if (!hasCaseAccess(data, pt.caseId, actorUserId)) return false
  return effectiveTrackPointCreatorId(pt, c.ownerUserId) === actorUserId
}

export function canDeleteTrackPoint(data: AppData, actorUserId: string, pt: TrackPoint): boolean {
  return canEditTrackPoint(data, actorUserId, pt)
}

export function canManageCollaborators(data: AppData, caseId: string, actorUserId: string): boolean {
  return canEditCaseMeta(data, caseId, actorUserId)
}

function effectiveCaseAttachmentCreatorId(a: CaseAttachment, caseOwnerId: string): string {
  return a.createdByUserId.trim() || caseOwnerId
}

export function canEditCaseAttachment(data: AppData, actorUserId: string, att: CaseAttachment): boolean {
  const c = findCase(data, att.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  if (!hasCaseAccess(data, att.caseId, actorUserId)) return false
  return effectiveCaseAttachmentCreatorId(att, c.ownerUserId) === actorUserId
}

export function canDeleteCaseAttachment(data: AppData, actorUserId: string, att: CaseAttachment): boolean {
  return canEditCaseAttachment(data, actorUserId, att)
}
