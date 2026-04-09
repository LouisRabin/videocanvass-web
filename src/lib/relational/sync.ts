import type { PostgrestError } from '@supabase/supabase-js'
import { z } from 'zod'
import { supabase } from '../supabase'
import { getRelationalAuthUserId } from '../supabaseAuthSession'
import type {
  AppData,
  AppUser,
  CaseAttachment,
  CaseCollaborator,
  CaseFile,
  Location,
  Track,
  TrackPoint,
} from '../types'
import { DEFAULT_DATA, AppDataSchema } from '../types'
import { deleteCaseAttachmentFromStorage } from './storageAttachment'

/** High-level sync narrative: `docs/SYNC_CONTRACT.md`. */

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Compare auth user ids / FK uuids case-insensitively (JWT + IndexedDB may differ in casing). */
function normUuid(s: string): string {
  return s.trim().toLowerCase()
}

/** Include table name in the message so the sync bar / console show where push failed. */
function relationalPushError(table: string, err: PostgrestError): Error {
  const parts = [err.message, err.details, err.hint].filter((x) => typeof x === 'string' && x.trim())
  return new Error(`${table}: ${parts.join(' — ')}`)
}

/** Tombstone keys are `${caseId}::${userId}`; split on first `::` only (ids must not contain `::`). */
function parseCaseCollaboratorTombstoneKey(key: string): { case_id: string; user_id: string } | null {
  const i = key.indexOf('::')
  if (i <= 0 || i >= key.length - 2) return null
  return { case_id: key.slice(0, i), user_id: key.slice(i + 2) }
}

type ProfileRow = {
  id: string
  display_name: string
  email: string
  tax_number: string
  created_at: string
  app_role?: string | null
}

function profileToUser(p: ProfileRow): AppUser {
  const role = (p.app_role ?? '').trim().toLowerCase()
  const emailRaw = (p.email ?? '').trim()
  const email = z.string().email().safeParse(emailRaw).success ? emailRaw : 'user@local.invalid'
  const taxRaw = (p.tax_number ?? '').trim()
  const taxNumber = taxRaw.length > 0 ? taxRaw : '—'
  return {
    id: p.id,
    displayName: p.display_name?.trim() || emailRaw || 'User',
    email,
    taxNumber,
    createdAt: new Date(p.created_at).getTime(),
    ...(role === 'admin' ? { appRole: 'admin' as const } : {}),
  }
}

type CaseRow = {
  id: string
  owner_user_id: string
  organization_id: string | null
  unit_id: string | null
  case_number: string
  title: string
  description: string
  created_at_ms: number
  updated_at_ms: number
  lifecycle?: string | null
}

function rowToCase(r: CaseRow): CaseFile {
  const lc = (r.lifecycle ?? 'open').trim().toLowerCase()
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    organizationId: r.organization_id ?? null,
    unitId: r.unit_id ?? null,
    caseNumber: r.case_number,
    title: r.title,
    description: r.description ?? '',
    createdAt: r.created_at_ms,
    updatedAt: r.updated_at_ms,
    lifecycle: lc === 'closed' ? 'closed' : 'open',
  }
}

function caseToRow(c: CaseFile, ownerUserIdForRow?: string): Record<string, unknown> {
  return {
    id: c.id,
    owner_user_id: ownerUserIdForRow ?? c.ownerUserId,
    organization_id: c.organizationId ?? null,
    unit_id: c.unitId ?? null,
    case_number: c.caseNumber,
    title: c.title,
    description: c.description ?? '',
    created_at_ms: c.createdAt,
    updated_at_ms: c.updatedAt,
    lifecycle: c.lifecycle ?? 'open',
  }
}

type LocRow = {
  id: string
  case_id: string
  address_text: string
  lat: number
  lon: number
  bounds: unknown
  footprint: unknown
  status: string
  notes: string
  last_visited_at_ms: number | null
  created_by_user_id: string
  created_at_ms: number
  updated_at_ms: number
}

function rowToLocation(r: LocRow): Location {
  return {
    id: r.id,
    caseId: r.case_id,
    addressText: r.address_text,
    lat: r.lat,
    lon: r.lon,
    bounds: (r.bounds as Location['bounds']) ?? null,
    footprint: (r.footprint as Location['footprint']) ?? null,
    status: r.status as Location['status'],
    notes: r.notes ?? '',
    lastVisitedAt: r.last_visited_at_ms,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at_ms,
    updatedAt: r.updated_at_ms,
  }
}

function locationToRow(l: Location): Record<string, unknown> {
  return {
    id: l.id,
    case_id: l.caseId,
    address_text: l.addressText,
    lat: l.lat,
    lon: l.lon,
    bounds: l.bounds,
    footprint: l.footprint,
    status: l.status,
    notes: l.notes,
    last_visited_at_ms: l.lastVisitedAt,
    created_by_user_id: l.createdByUserId,
    created_at_ms: l.createdAt,
    updated_at_ms: l.updatedAt,
  }
}

type TrackRow = {
  id: string
  case_id: string
  label: string
  kind: string
  route_color: string
  created_by_user_id: string
  created_at_ms: number
  updated_at_ms: number
}

function rowToTrack(r: TrackRow): Track {
  return {
    id: r.id,
    caseId: r.case_id,
    label: r.label,
    kind: r.kind as Track['kind'],
    routeColor: r.route_color ?? '',
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at_ms,
    updatedAt: r.updated_at_ms,
  }
}

function trackToRow(t: Track): Record<string, unknown> {
  return {
    id: t.id,
    case_id: t.caseId,
    label: t.label,
    kind: t.kind,
    route_color: t.routeColor ?? '',
    created_by_user_id: t.createdByUserId,
    created_at_ms: t.createdAt,
    updated_at_ms: t.updatedAt ?? t.createdAt,
  }
}

type TpRow = {
  id: string
  case_id: string
  track_id: string
  location_id: string | null
  address_text: string
  lat: number
  lon: number
  sequence: number
  visited_at_ms: number | null
  notes: string
  show_on_map: boolean
  display_time_on_map: boolean
  map_time_label_offset_x: number
  map_time_label_offset_y: number
  placement_source?: string | null
  created_by_user_id: string
  created_at_ms: number
  updated_at_ms: number
}

function rowToTrackPoint(r: TpRow): TrackPoint {
  const ps = r.placement_source === 'import' ? 'import' : 'map'
  return {
    id: r.id,
    caseId: r.case_id,
    trackId: r.track_id,
    locationId: r.location_id,
    addressText: r.address_text,
    lat: r.lat,
    lon: r.lon,
    sequence: r.sequence,
    visitedAt: r.visited_at_ms,
    notes: r.notes ?? '',
    showOnMap: r.show_on_map,
    displayTimeOnMap: r.display_time_on_map,
    mapTimeLabelOffsetX: r.map_time_label_offset_x,
    mapTimeLabelOffsetY: r.map_time_label_offset_y,
    placementSource: ps,
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at_ms,
    updatedAt: r.updated_at_ms,
  }
}

function trackPointToRow(p: TrackPoint): Record<string, unknown> {
  return {
    id: p.id,
    case_id: p.caseId,
    track_id: p.trackId,
    location_id: p.locationId,
    address_text: p.addressText,
    lat: p.lat,
    lon: p.lon,
    sequence: p.sequence,
    visited_at_ms: p.visitedAt,
    notes: p.notes,
    show_on_map: p.showOnMap,
    display_time_on_map: p.displayTimeOnMap,
    map_time_label_offset_x: p.mapTimeLabelOffsetX,
    map_time_label_offset_y: p.mapTimeLabelOffsetY,
    placement_source: p.placementSource === 'import' ? 'import' : 'map',
    created_by_user_id: p.createdByUserId,
    created_at_ms: p.createdAt,
    updated_at_ms: p.updatedAt ?? p.createdAt,
  }
}

type CollabRow = {
  case_id: string
  user_id: string
  role: string
  created_at_ms: number
}

function rowToCollab(r: CollabRow): CaseCollaborator {
  return {
    caseId: r.case_id,
    userId: r.user_id,
    role: r.role === 'viewer' ? 'viewer' : 'editor',
    createdAt: r.created_at_ms,
  }
}

function collabToRow(c: CaseCollaborator): Record<string, unknown> {
  return {
    case_id: c.caseId,
    user_id: c.userId,
    role: c.role,
    created_at_ms: c.createdAt,
  }
}

type AttRow = {
  id: string
  case_id: string
  kind: string
  caption: string
  image_data_url: string | null
  image_storage_path: string | null
  content_type: string | null
  created_by_user_id: string
  created_at_ms: number
  updated_at_ms: number
}

function rowToAttachment(r: AttRow): CaseAttachment {
  return {
    id: r.id,
    caseId: r.case_id,
    kind: r.kind as CaseAttachment['kind'],
    caption: r.caption ?? '',
    imageDataUrl: r.image_data_url ?? '',
    imageStoragePath: r.image_storage_path ?? null,
    contentType: r.content_type ?? '',
    createdByUserId: r.created_by_user_id,
    createdAt: r.created_at_ms,
    updatedAt: r.updated_at_ms,
  }
}

function attachmentToRow(a: CaseAttachment): Record<string, unknown> {
  return {
    id: a.id,
    case_id: a.caseId,
    kind: a.kind,
    caption: a.caption,
    image_data_url: a.imageDataUrl?.trim() ? a.imageDataUrl : null,
    image_storage_path: a.imageStoragePath?.trim() ? a.imageStoragePath : null,
    content_type: a.contentType?.trim() ? a.contentType : null,
    created_by_user_id: a.createdByUserId,
    created_at_ms: a.createdAt,
    updated_at_ms: a.updatedAt,
  }
}

export async function loadAppDataFromRelational(): Promise<AppData | null> {
  if (!supabase) return null
  const { normalizeAppData } = await import('../db')

  const { data: casesRows, error: e1 } = await supabase.from('vc_cases').select('*')
  if (e1) {
    console.warn('loadAppDataFromRelational vc_cases:', e1.message)
    return null
  }
  const cases = (casesRows as CaseRow[]).map(rowToCase)
  const caseIds = cases.map((c) => c.id)
  if (caseIds.length === 0) {
    const uid = await getRelationalAuthUserId(supabase)
    const { data: selfRow } = uid
      ? await supabase.from('vc_profiles').select('*').eq('id', uid).maybeSingle()
      : { data: null as ProfileRow | null }
    const users: AppUser[] = selfRow ? [profileToUser(selfRow as ProfileRow)] : []
    const empty: AppData = {
      ...DEFAULT_DATA,
      users,
    }
    const parsedEmpty = AppDataSchema.safeParse(empty)
    if (!parsedEmpty.success) {
      console.warn('loadAppDataFromRelational empty state parse:', parsedEmpty.error)
      return normalizeAppData({ ...DEFAULT_DATA, users: [] })
    }
    return normalizeAppData(parsedEmpty.data)
  }

  const [
    { data: locRows, error: e2 },
    { data: trackRows, error: e3 },
    { data: tpRows, error: e4 },
    { data: collabRows, error: e5 },
    { data: attRows, error: e6 },
    { data: profRows, error: e7 },
  ] = await Promise.all([
    supabase.from('vc_locations').select('*').in('case_id', caseIds),
    supabase.from('vc_tracks').select('*').in('case_id', caseIds),
    supabase.from('vc_track_points').select('*').in('case_id', caseIds),
    supabase.from('vc_case_collaborators').select('*').in('case_id', caseIds),
    supabase.from('vc_case_attachments').select('*').in('case_id', caseIds),
    supabase.from('vc_profiles').select('*'),
  ])

  for (const [e, label] of [
    [e2, 'vc_locations'],
    [e3, 'vc_tracks'],
    [e4, 'vc_track_points'],
    [e5, 'vc_case_collaborators'],
    [e6, 'vc_case_attachments'],
    [e7, 'vc_profiles'],
  ] as const) {
    if (e) console.warn(`loadAppDataFromRelational ${label}:`, e.message)
  }

  const users = ((profRows ?? []) as ProfileRow[]).map(profileToUser)

  const raw: AppData = {
    version: 1,
    cases,
    locations: ((locRows ?? []) as LocRow[]).map(rowToLocation),
    tracks: ((trackRows ?? []) as TrackRow[]).map(rowToTrack),
    trackPoints: ((tpRows ?? []) as TpRow[]).map(rowToTrackPoint),
    caseCollaborators: ((collabRows ?? []) as CollabRow[]).map(rowToCollab),
    caseAttachments: ((attRows ?? []) as AttRow[]).map(rowToAttachment),
    users,
    deletedCaseIds: [],
    deletedLocationIds: [],
    deletedTrackIds: [],
    deletedTrackPointIds: [],
    deletedCaseAttachmentIds: [],
    deletedCaseCollaboratorKeys: [],
  }

  const parsed = AppDataSchema.safeParse(raw)
  if (!parsed.success) {
    console.warn('loadAppDataFromRelational parse:', parsed.error)
    return null
  }
  return normalizeAppData(parsed.data)
}

export async function pushAppDataToRelational(data: AppData, authUserIdFromSession?: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client missing')
  const sb = supabase
  let uidRaw = authUserIdFromSession?.trim()
  if (!uidRaw) {
    const { prepareRelationalWriteAuth } = await import('../supabaseAuthSession')
    const p = await prepareRelationalWriteAuth(sb)
    if (!p) throw new Error('Not signed in')
    uidRaw = p.userId
  }
  const uidKey = normUuid(uidRaw)
  const ownerUuidForRow = uidKey

  const { normalizeAppData } = await import('../db')
  const d = normalizeAppData(data)

  // RLS: only the case owner may insert/update vc_cases. Pushing every case (e.g. collaborator copies
  // or stale IndexedDB rows with a different owner_user_id) causes "new row violates row-level security".
  const casesOwnedBySession = d.cases.filter((c) => normUuid(c.ownerUserId) === uidKey)

  // Upsert hits UPDATE on id conflict. If the server row belongs to someone else, UPDATE USING fails
  // (and PostgREST often reports it as a WITH CHECK / "new row" style RLS error). Skip those ids.
  const ownedIds = casesOwnedBySession.map((c) => c.id)
  const remoteOwnerById = new Map<string, string>()
  for (const idBatch of chunk(ownedIds, 100)) {
    if (!idBatch.length) continue
    const { data: existingRows, error: preErr } = await sb.from('vc_cases').select('id, owner_user_id').in('id', idBatch)
    if (preErr) throw relationalPushError('vc_cases(preselect)', preErr)
    for (const r of existingRows ?? []) {
      const row = r as { id: string; owner_user_id: string }
      remoteOwnerById.set(row.id, row.owner_user_id)
    }
  }

  const casesSafeForVcCasesUpsert = casesOwnedBySession.filter((c) => {
    const remoteOwner = remoteOwnerById.get(c.id)
    if (remoteOwner == null) return true
    return normUuid(remoteOwner) === uidKey
  })
  const skippedCaseRows = casesOwnedBySession.length - casesSafeForVcCasesUpsert.length
  if (skippedCaseRows > 0) {
    console.warn(
      `[sync] Skipping ${skippedCaseRows} vc_cases upsert(s): case id already exists on the server under another owner (fix local owner or remove the duplicate case).`,
    )
  }

  // `owner_user_id` must equal JWT `sub` (lowercase uuid string matches Postgres auth.uid()).
  for (const batch of chunk(casesSafeForVcCasesUpsert.map((c) => caseToRow(c, ownerUuidForRow)), 80)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_cases').upsert(batch, { onConflict: 'id' })
    if (error) throw relationalPushError('vc_cases', error)
  }

  for (const batch of chunk(d.caseCollaborators.map(collabToRow), 120)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_case_collaborators').upsert(batch, { onConflict: 'case_id,user_id' })
    if (error) throw relationalPushError('vc_case_collaborators', error)
  }

  for (const batch of chunk(d.deletedCaseCollaboratorKeys, 40)) {
    if (!batch.length) continue
    const pairs = batch
      .map(parseCaseCollaboratorTombstoneKey)
      .filter((p): p is NonNullable<typeof p> => p != null)
    if (!pairs.length) continue
    const results = await Promise.all(
      pairs.map(({ case_id, user_id }) =>
        sb.from('vc_case_collaborators').delete().match({ case_id, user_id }),
      ),
    )
    for (const { error } of results) {
      if (error) throw relationalPushError('vc_case_collaborators(delete)', error)
    }
  }

  for (const batch of chunk(d.locations.map(locationToRow), 120)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_locations').upsert(batch, { onConflict: 'id' })
    if (error) throw relationalPushError('vc_locations', error)
  }

  for (const batch of chunk(d.tracks.map(trackToRow), 120)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_tracks').upsert(batch, { onConflict: 'id' })
    if (error) throw relationalPushError('vc_tracks', error)
  }

  for (const batch of chunk(d.trackPoints.map(trackPointToRow), 120)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_track_points').upsert(batch, { onConflict: 'id' })
    if (error) throw relationalPushError('vc_track_points', error)
  }

  for (const batch of chunk(d.caseAttachments.map(attachmentToRow), 80)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_case_attachments').upsert(batch, { onConflict: 'id' })
    if (error) throw relationalPushError('vc_case_attachments', error)
  }

  for (const batch of chunk(d.deletedCaseIds, 50)) {
    if (!batch.length) continue
    const { data: ownIds, error: selErr } = await sb
      .from('vc_cases')
      .select('id')
      .in('id', batch)
      .eq('owner_user_id', ownerUuidForRow)
    if (selErr) throw relationalPushError('vc_cases(delete:select)', selErr)
    const ids = (ownIds ?? []).map((r) => (r as { id: string }).id)
    if (!ids.length) continue
    const { error } = await sb.from('vc_cases').delete().in('id', ids)
    if (error) throw relationalPushError('vc_cases(delete)', error)
  }

  for (const batch of chunk(d.deletedLocationIds, 80)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_locations').delete().in('id', batch)
    if (error) throw relationalPushError('vc_locations(delete)', error)
  }

  for (const batch of chunk(d.deletedTrackIds, 80)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_tracks').delete().in('id', batch)
    if (error) throw relationalPushError('vc_tracks(delete)', error)
  }

  for (const batch of chunk(d.deletedTrackPointIds, 80)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_track_points').delete().in('id', batch)
    if (error) throw relationalPushError('vc_track_points(delete)', error)
  }

  const attsToDelete = d.deletedCaseAttachmentIds
  if (attsToDelete.length) {
    const { data: existing } = await sb.from('vc_case_attachments').select('id,image_storage_path').in('id', attsToDelete)
    for (const row of existing ?? []) {
      const path = (row as { image_storage_path?: string }).image_storage_path
      if (path) await deleteCaseAttachmentFromStorage(sb, path)
    }
    const { error } = await sb.from('vc_case_attachments').delete().in('id', attsToDelete)
    if (error) throw relationalPushError('vc_case_attachments(delete)', error)
  }
}
