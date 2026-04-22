/**
 * Case access and edit rules for owners vs team members (collaborators).
 *
 * **Read access** (`hasCaseAccess`): owner, any collaborator (viewer or editor), or **unit member** when the case
 * has `unitId` and the user’s `myUnitIds` (from `vc_user_unit_members`) contains that unit — matches `vc_case_visible`.
 *
 * **Mutations** (`canMutateCaseContent`): owner or collaborator with role **editor** only — matches Postgres
 * `vc_case_editor` / RLS on `vc_locations`, `vc_tracks`, etc. **Viewers** may open the case but cannot
 * create or edit content (avoids UI allowing actions that the database rejects).
 *
 * Per-entity rules for editors: may **edit** any address (status, notes, geometry, etc.), track metadata, and
 * track-point notes/times on the case; may **delete** only locations, tracks, and track points they created.
 * Owners keep full control. Cannot rename/delete case or manage collaborators (owner only).
 * Legacy rows with empty `createdByUserId` count as the case owner for creator checks.
 */

import type { AppData, AppUser, CaseAttachment, CaseFile, Location, Track, TrackPoint } from './types'

/** Display + tax for the “Notes - …” heading (creator of the address or track step). */
export type NotesHeadingContributor = Pick<AppUser, 'displayName' | 'taxNumber'>

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

function normId(s: string): string {
  return s.trim().toLowerCase()
}

/** Case is assigned to a unit and the signed-in user’s merged `myUnitIds` includes it. */
function isCaseVisibleViaUnit(data: AppData, c: CaseFile): boolean {
  const uid = (c.unitId ?? '').trim()
  if (!uid) return false
  const key = normId(uid)
  return data.myUnitIds.some((x) => normId(x) === key)
}

export function hasCaseAccess(data: AppData, caseId: string, userId: string): boolean {
  const c = findCase(data, caseId)
  if (!c) return false
  if (isCaseOwner(c, userId)) return true
  if (isCaseCollaborator(data, caseId, userId)) return true
  return isCaseVisibleViaUnit(data, c)
}

/**
 * True if this user may INSERT/UPDATE/DELETE case content (locations, tracks, points, attachments).
 * Aligns with `public.vc_case_editor` in Supabase RLS: owner or collaborator with `role === 'editor'`.
 */
export function canMutateCaseContent(data: AppData, caseId: string, actorUserId: string): boolean {
  const c = findCase(data, caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  const row = data.caseCollaborators.find((cc) => cc.caseId === caseId && cc.userId === actorUserId)
  return row?.role === 'editor'
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
  return canMutateCaseContent(data, caseId, actorUserId)
}

export function canEditLocation(data: AppData, actorUserId: string, loc: Location): boolean {
  const c = findCase(data, loc.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  return canMutateCaseContent(data, loc.caseId, actorUserId)
}

export function canDeleteLocation(data: AppData, actorUserId: string, loc: Location): boolean {
  const c = findCase(data, loc.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  if (!canMutateCaseContent(data, loc.caseId, actorUserId)) return false
  return effectiveLocationCreatorId(loc, c.ownerUserId) === actorUserId
}

export function canEditTrack(data: AppData, actorUserId: string, track: Track): boolean {
  const c = findCase(data, track.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  return canMutateCaseContent(data, track.caseId, actorUserId)
}

export function canDeleteTrack(data: AppData, actorUserId: string, track: Track): boolean {
  const c = findCase(data, track.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  if (!canMutateCaseContent(data, track.caseId, actorUserId)) return false
  return effectiveTrackCreatorId(track, c.ownerUserId) === actorUserId
}

export function canDeleteAllTracksForCase(data: AppData, caseId: string, actorUserId: string): boolean {
  return canEditCaseMeta(data, caseId, actorUserId)
}

export function canEditTrackPoint(data: AppData, actorUserId: string, pt: TrackPoint): boolean {
  const c = findCase(data, pt.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  return canMutateCaseContent(data, pt.caseId, actorUserId)
}

export function canDeleteTrackPoint(data: AppData, actorUserId: string, pt: TrackPoint): boolean {
  const c = findCase(data, pt.caseId)
  if (!c) return false
  if (isCaseOwner(c, actorUserId)) return true
  if (!canMutateCaseContent(data, pt.caseId, actorUserId)) return false
  return effectiveTrackPointCreatorId(pt, c.ownerUserId) === actorUserId
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
  if (!canMutateCaseContent(data, att.caseId, actorUserId)) return false
  return effectiveCaseAttachmentCreatorId(att, c.ownerUserId) === actorUserId
}

export function canDeleteCaseAttachment(data: AppData, actorUserId: string, att: CaseAttachment): boolean {
  return canEditCaseAttachment(data, actorUserId, att)
}

/** Who added this address (empty `createdByUserId` → case owner), for notes UI attribution. */
export function notesHeadingContributorForLocation(data: AppData, loc: Location): NotesHeadingContributor | null {
  const c = findCase(data, loc.caseId)
  if (!c) return null
  const uid = effectiveLocationCreatorId(loc, c.ownerUserId)
  const u = data.users.find((x) => x.id === uid)
  if (u) return { displayName: u.displayName, taxNumber: u.taxNumber }
  if (uid.trim()) return { displayName: 'Unknown collaborator', taxNumber: '—' }
  return null
}

/** Who added this tracking step (empty `createdByUserId` → case owner), for notes UI attribution. */
export function notesHeadingContributorForTrackPoint(
  data: AppData,
  point: TrackPoint,
): NotesHeadingContributor | null {
  const c = findCase(data, point.caseId)
  if (!c) return null
  const uid = effectiveTrackPointCreatorId(point, c.ownerUserId)
  const u = data.users.find((x) => x.id === uid)
  if (u) return { displayName: u.displayName, taxNumber: u.taxNumber }
  if (uid.trim()) return { displayName: 'Unknown collaborator', taxNumber: '—' }
  return null
}
