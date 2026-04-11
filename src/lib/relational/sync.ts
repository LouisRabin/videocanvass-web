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
import { traceRelationalPullStep } from '../syncPullTrace'

/** High-level sync narrative: `docs/SYNC_CONTRACT.md`. */

/** PostgREST column lists (avoid `*`, trim payload vs unbounded columns). */
const SEL_VC_CASES =
  'id,owner_user_id,organization_id,unit_id,case_number,title,description,created_at_ms,updated_at_ms,lifecycle'
const SEL_VC_LOCATIONS =
  'id,case_id,address_text,lat,lon,bounds,footprint,status,notes,last_visited_at_ms,created_by_user_id,created_at_ms,updated_at_ms'
const SEL_VC_TRACKS =
  'id,case_id,label,kind,route_color,created_by_user_id,created_at_ms,updated_at_ms'
const SEL_VC_TRACK_POINTS =
  'id,case_id,track_id,location_id,address_text,lat,lon,sequence,visited_at_ms,notes,show_on_map,display_time_on_map,map_time_label_offset_x,map_time_label_offset_y,placement_source,created_by_user_id,created_at_ms,updated_at_ms'
const SEL_VC_COLLABORATORS = 'case_id,user_id,role,created_at_ms'
const SEL_VC_ATTACHMENTS =
  'id,case_id,kind,caption,image_data_url,image_storage_path,content_type,created_by_user_id,created_at_ms,updated_at_ms'
const SEL_VC_PROFILES = 'id,display_name,email,tax_number,created_at,app_role'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Compare auth user ids / FK uuids case-insensitively (JWT + IndexedDB may differ in casing). */
function normUuid(s: string): string {
  return s.trim().toLowerCase()
}

/** RLS on `vc_case_collaborators` allows INSERT/UPDATE/DELETE only for the case owner. */
function isSessionOwnerOfCase(data: AppData, caseId: string, sessionUidLower: string): boolean {
  const c = data.cases.find((x) => x.id === caseId)
  return !!c && normUuid(c.ownerUserId) === sessionUidLower
}

/** `auth.users.id` / JWT `sub` — reject empty or junk so we never upsert `owner_user_id: null` / invalid. */
function assertAuthUuidForVcCases(ownerFromSession: string): string {
  const n = normUuid(ownerFromSession)
  if (!n) {
    throw new Error('Cannot sync cases: missing owner user id. Sign in again.')
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(n)) {
    throw new Error('Cannot sync cases: owner user id is not a valid uuid. Sign in again.')
  }
  return n
}

/**
 * Payload for `vc_cases` upsert only. Never reads `c.ownerUserId` for `owner_user_id` — always session uuid.
 * Omits nullable `organization_id` / `unit_id` when unset so we do not send explicit `null` for those keys.
 */
function vcCasePayloadForUpsert(c: CaseFile, ownerUuidLower: string): Record<string, unknown> {
  const owner_user_id = assertAuthUuidForVcCases(ownerUuidLower)
  const row: Record<string, unknown> = {
    id: c.id,
    owner_user_id,
    case_number: c.caseNumber,
    title: c.title,
    description: c.description ?? '',
    created_at_ms: c.createdAt,
    updated_at_ms: c.updatedAt,
    lifecycle: c.lifecycle ?? 'open',
  }
  const org = c.organizationId?.trim()
  if (org) row.organization_id = normUuid(org)
  const unit = c.unitId?.trim()
  if (unit) row.unit_id = normUuid(unit)
  return row
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

/** Row shape from `vc_profiles` or `vc_search_profiles_for_case_team`. */
export type VcProfileRow = {
  id: string
  display_name: string
  email: string
  tax_number: string
  created_at: string
  app_role?: string | null
}

export function appUserFromVcProfileRow(p: VcProfileRow): AppUser {
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

function profileToUser(p: VcProfileRow): AppUser {
  return appUserFromVcProfileRow(p)
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

async function loadMyUnitIdsForSession(
  sb: NonNullable<typeof supabase>,
  sessionUid: string | null,
): Promise<string[]> {
  const u = sessionUid?.trim()
  if (!u) return []
  const { data: rows, error } = await sb.from('vc_user_unit_members').select('unit_id').eq('user_id', u)
  if (error) {
    console.warn('loadAppDataFromRelational vc_user_unit_members:', error.message)
    return []
  }
  const out = new Set<string>()
  for (const r of rows ?? []) {
    const id = String((r as { unit_id: string }).unit_id ?? '')
      .trim()
      .toLowerCase()
    if (id) out.add(id)
  }
  return [...out]
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

function collectProfileUserIds(
  sessionUid: string | null,
  cases: CaseFile[],
  locRows: LocRow[] | null | undefined,
  trackRows: TrackRow[] | null | undefined,
  tpRows: TpRow[] | null | undefined,
  collabRows: CollabRow[] | null | undefined,
  attRows: AttRow[] | null | undefined,
): string[] {
  const s = new Set<string>()
  const add = (id: string | null | undefined) => {
    const n = normUuid(id ?? '')
    if (n) s.add(n)
  }
  add(sessionUid)
  for (const c of cases) add(c.ownerUserId)
  for (const r of locRows ?? []) add(r.created_by_user_id)
  for (const r of trackRows ?? []) add(r.created_by_user_id)
  for (const r of tpRows ?? []) add(r.created_by_user_id)
  for (const r of collabRows ?? []) add(r.user_id)
  for (const r of attRows ?? []) add(r.created_by_user_id)
  return [...s]
}

async function loadVcProfilesBatched(sb: NonNullable<typeof supabase>, ids: string[]): Promise<VcProfileRow[]> {
  if (!ids.length) return []
  const out: VcProfileRow[] = []
  for (const batch of chunk(ids, 150)) {
    const t0 = performance.now()
    const { data, error } = await sb.from('vc_profiles').select(SEL_VC_PROFILES).in('id', batch)
    traceRelationalPullStep('vc_profiles(batch)', t0, data?.length)
    if (error) {
      console.warn('loadAppDataFromRelational vc_profiles:', error.message)
      continue
    }
    out.push(...(((data ?? []) as unknown[]) as VcProfileRow[]))
  }
  return out
}

export async function loadAppDataFromRelational(opts?: {
  /** When set (including `null`), empty-case path skips `getRelationalAuthUserId` (avoids a second hung Auth round-trip). */
  emptyCaseUserId?: string | null
}): Promise<AppData | null> {
  if (!supabase) return null
  const sb = supabase
  const { normalizeAppData } = await import('../db')

  const sessionUidPromise =
    opts && Object.prototype.hasOwnProperty.call(opts, 'emptyCaseUserId')
      ? Promise.resolve(opts.emptyCaseUserId ?? null)
      : getRelationalAuthUserId(sb)

  const tCases = performance.now()
  const [{ data: casesRows, error: e1 }, sessionUid] = await Promise.all([
    sb.from('vc_cases').select(SEL_VC_CASES),
    sessionUidPromise,
  ])
  traceRelationalPullStep('vc_cases', tCases, casesRows?.length)
  if (e1) {
    console.warn('loadAppDataFromRelational vc_cases:', e1.message)
    return null
  }
  const cases = (casesRows as CaseRow[]).map(rowToCase)
  const caseIds = cases.map((c) => c.id)
  if (caseIds.length === 0) {
    const uid = sessionUid
    const tEmpty = performance.now()
    const [{ data: selfRow }, myUnitIds] = await Promise.all([
      uid
        ? sb.from('vc_profiles').select(SEL_VC_PROFILES).eq('id', uid).maybeSingle()
        : Promise.resolve({ data: null as VcProfileRow | null }),
      loadMyUnitIdsForSession(sb, uid),
    ])
    traceRelationalPullStep('vc_profiles_empty_case', tEmpty, selfRow ? 1 : 0)
    const users: AppUser[] = selfRow ? [profileToUser(selfRow as VcProfileRow)] : []
    const empty: AppData = {
      ...DEFAULT_DATA,
      users,
      myUnitIds,
    }
    const parsedEmpty = AppDataSchema.safeParse(empty)
    if (!parsedEmpty.success) {
      console.warn('loadAppDataFromRelational empty state parse:', parsedEmpty.error)
      return normalizeAppData({ ...DEFAULT_DATA, users: [], myUnitIds })
    }
    return normalizeAppData(parsedEmpty.data)
  }

  const tParallel = performance.now()
  const [
    { data: locRows, error: e2 },
    { data: trackRows, error: e3 },
    { data: tpRows, error: e4 },
    { data: collabRows, error: e5 },
    { data: attRows, error: e6 },
    myUnitIds,
  ] = await Promise.all([
    sb.from('vc_locations').select(SEL_VC_LOCATIONS).in('case_id', caseIds),
    sb.from('vc_tracks').select(SEL_VC_TRACKS).in('case_id', caseIds),
    sb.from('vc_track_points').select(SEL_VC_TRACK_POINTS).in('case_id', caseIds),
    sb.from('vc_case_collaborators').select(SEL_VC_COLLABORATORS).in('case_id', caseIds),
    sb.from('vc_case_attachments').select(SEL_VC_ATTACHMENTS).in('case_id', caseIds),
    loadMyUnitIdsForSession(sb, sessionUid),
  ])
  traceRelationalPullStep('parallel_case_children', tParallel, (locRows?.length ?? 0) + (tpRows?.length ?? 0))

  for (const [e, label] of [
    [e2, 'vc_locations'],
    [e3, 'vc_tracks'],
    [e4, 'vc_track_points'],
    [e5, 'vc_case_collaborators'],
    [e6, 'vc_case_attachments'],
  ] as const) {
    if (e) console.warn(`loadAppDataFromRelational ${label}:`, e.message)
  }

  const profileIds = collectProfileUserIds(sessionUid, cases, locRows, trackRows, tpRows, collabRows, attRows)
  const profRows = await loadVcProfilesBatched(sb, profileIds)

  const users = profRows.map(profileToUser)

  const raw: AppData = {
    version: 1,
    cases,
    locations: ((locRows ?? []) as LocRow[]).map(rowToLocation),
    tracks: ((trackRows ?? []) as TrackRow[]).map(rowToTrack),
    trackPoints: ((tpRows ?? []) as TpRow[]).map(rowToTrackPoint),
    caseCollaborators: ((collabRows ?? []) as CollabRow[]).map(rowToCollab),
    caseAttachments: ((attRows ?? []) as AttRow[]).map(rowToAttachment),
    users,
    myUnitIds,
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
  const { ensureRelationalClientSession } = await import('../supabaseAuthSession')
  const uidHint = authUserIdFromSession?.trim()
  let aligned = await ensureRelationalClientSession(sb, uidHint || undefined)
  // Hint can be briefly stale vs shared storage while another tab/device refreshes; fall back to current session.
  if (!aligned && uidHint) {
    aligned = await ensureRelationalClientSession(sb)
  }
  if (!aligned) {
    throw new Error(
      uidHint
        ? 'Not signed in, or the session could not be verified. Try again, or refresh the page.'
        : 'Not signed in',
    )
  }
  const uidKey = assertAuthUuidForVcCases(aligned.userId)

  const jwtMatchesSession = async (): Promise<boolean> => {
    const { data: jwtUser, error: jwtErr } = await sb.auth.getUser()
    if (jwtErr?.message) {
      console.warn('[sync] getUser before relational push:', jwtErr.message)
    }
    const jwtSub = jwtUser?.user?.id?.trim()
    return Boolean(jwtSub && normUuid(jwtSub) === uidKey)
  }

  if (!(await jwtMatchesSession())) {
    const { error: refErr } = await sb.auth.refreshSession()
    if (refErr?.message) {
      console.warn('[sync] refreshSession before relational push (jwt align):', refErr.message)
    }
    const again = await ensureRelationalClientSession(sb, uidKey)
    if (!again || normUuid(again.userId) !== uidKey) {
      throw new Error(
        'Could not verify your sign-in with the server. Check your connection, try again in a moment, or refresh the page.',
      )
    }
    if (!(await jwtMatchesSession())) {
      throw new Error(
        'Could not verify your sign-in with the server. Try again in a moment, or refresh the page.',
      )
    }
  }

  const { normalizeAppData } = await import('../db')
  const d = normalizeAppData(data)

  // RLS: only the case owner may insert/update vc_cases. Pushing every case (e.g. collaborator copies
  // or stale IndexedDB rows with a different owner_user_id) causes "new row violates row-level security".
  const casesOwnedBySession = d.cases.filter((c) => normUuid(c.ownerUserId) === uidKey)

  // Upsert hits UPDATE on id conflict. If the server row belongs to someone else, UPDATE USING fails
  // (and PostgREST often reports it as a WITH CHECK / "new row" style RLS error). Skip those ids.
  const ownedIds = casesOwnedBySession.map((c) => c.id)
  const remoteOwnerById = new Map<string, string>()
  for (const idBatch of chunk(ownedIds, 200)) {
    if (!idBatch.length) continue
    const { data: rpcRows, error: rpcErr } = await sb.rpc('vc_case_owners_for_ids', { p_ids: idBatch })
    if (!rpcErr && rpcRows != null) {
      for (const r of rpcRows as { id: string; owner_user_id: string }[]) {
        remoteOwnerById.set(r.id, r.owner_user_id)
      }
      continue
    }
    if (rpcErr) {
      console.warn(
        '[sync] vc_case_owners_for_ids RPC failed; using RLS-visible preselect (apply migration 20260411190000_vc_case_owners_for_ids_rpc.sql for reliable inserts):',
        rpcErr.message,
      )
    }
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

  const forInsert = casesSafeForVcCasesUpsert.filter((c) => !remoteOwnerById.has(c.id))
  const forUpsert = casesSafeForVcCasesUpsert.filter(
    (c) => remoteOwnerById.has(c.id) && normUuid(remoteOwnerById.get(c.id)!) === uidKey,
  )

  if (import.meta.env.VITE_VC_DEBUG === 'true' && casesSafeForVcCasesUpsert.length) {
    const {
      data: { session: dbgSession },
    } = await sb.auth.getSession()
    console.warn('[vc_debug] vc_cases push', {
      hasAccessToken: Boolean(dbgSession?.access_token),
      sessionUserId: dbgSession?.user?.id ?? null,
      ownerNorm: uidKey,
      insertCount: forInsert.length,
      upsertCount: forUpsert.length,
    })
  }

  for (const batch of chunk(
    forInsert.map((c) => vcCasePayloadForUpsert(c, uidKey)),
    80,
  )) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_cases').insert(batch)
    if (error) throw relationalPushError('vc_cases(insert)', error)
  }
  for (const batch of chunk(
    forUpsert.map((c) => vcCasePayloadForUpsert(c, uidKey)),
    80,
  )) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_cases').upsert(batch, { onConflict: 'id' })
    if (error) throw relationalPushError('vc_cases(upsert)', error)
  }

  const collaboratorsOwnedCasesOnly = d.caseCollaborators.filter((cc) =>
    isSessionOwnerOfCase(d, cc.caseId, uidKey),
  )
  for (const batch of chunk(collaboratorsOwnedCasesOnly.map(collabToRow), 120)) {
    if (!batch.length) continue
    const { error } = await sb.from('vc_case_collaborators').upsert(batch, { onConflict: 'case_id,user_id' })
    if (error) throw relationalPushError('vc_case_collaborators', error)
  }

  const deletedCollabKeysOwnedCasesOnly = d.deletedCaseCollaboratorKeys.filter((key) => {
    const p = parseCaseCollaboratorTombstoneKey(key)
    return p != null && isSessionOwnerOfCase(d, p.case_id, uidKey)
  })
  for (const batch of chunk(deletedCollabKeysOwnedCasesOnly, 40)) {
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
      .eq('owner_user_id', uidKey)
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
