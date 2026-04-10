import localforage from 'localforage'
import {
  AppDataSchema,
  DEFAULT_DATA,
  type AppData,
  type CaseCollaborator,
  type TrackPoint,
} from './types'
import { relationalBackendEnabled } from './backendMode'
import { SHARED_WORKSPACE_ID, hasSupabaseConfig, supabase } from './supabase'
import {
  ensureRelationalClientSession,
  getRelationalAuthUserIdWithTimeout,
  getUsableSessionOrSignOut,
  RELATIONAL_AUTH_USER_ID_TIMEOUT_MS,
} from './supabaseAuthSession'
import { setSyncStatus } from './syncStatus'

/** Merge rules, polling, and Realtime overview: `docs/SYNC_CONTRACT.md`. */
const STORE_KEY = 'videocanvass:data:v1'

/** Cap how long first relational pull can block store bootstrap (slow network / hung PostgREST). */
const RELATIONAL_BOOTSTRAP_REMOTE_MS = 22_000
/** Cap legacy `vc_app_state` fetch so SPA reaches UI when row is missing or API stalls. */
const SHARED_TABLE_BOOTSTRAP_MS = 14_000

function formatDbErrorForSync(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === 'string' && m.trim()) return m.trim()
  }
  if (e instanceof Error && e.message.trim()) return e.message.trim()
  return 'unknown error'
}

/** Fallback pull when Realtime is slow or missed (mobile WebViews / background tabs often throttle WS). */
export const REMOTE_SYNC_POLL_MS = 8_000

function migrateTrackPointUpdatedAt(data: AppData): AppData {
  return {
    ...data,
    trackPoints: data.trackPoints.map((p) => ({
      ...p,
      updatedAt: p.updatedAt ?? p.createdAt,
    })),
  }
}

function migrateTrackUpdatedAt(data: AppData): AppData {
  return {
    ...data,
    tracks: data.tracks.map((t) => ({
      ...t,
      updatedAt: t.updatedAt ?? t.createdAt,
    })),
  }
}

function normalizeTrackPointSequences(data: AppData): AppData {
  const byTrack = new Map<string, TrackPoint[]>()
  for (const p of data.trackPoints) {
    const arr = byTrack.get(p.trackId) ?? []
    arr.push(p)
    byTrack.set(p.trackId, arr)
  }
  const nextList: TrackPoint[] = []
  for (const arr of byTrack.values()) {
    const sorted = arr.slice().sort((a, b) => {
      const ds = a.sequence - b.sequence
      if (ds !== 0) return ds
      const dt = (a.visitedAt ?? a.createdAt) - (b.visitedAt ?? b.createdAt)
      if (dt !== 0) return dt
      const dc = a.createdAt - b.createdAt
      if (dc !== 0) return dc
      return a.id.localeCompare(b.id)
    })
    sorted.forEach((p, i) => nextList.push({ ...p, sequence: i }))
  }
  return { ...data, trackPoints: nextList }
}

/** Backfill empty createdByUserId to the case owner (legacy rows). */
function migrateCreatedByUserIds(data: AppData): AppData {
  const ownerByCase = new Map<string, string>()
  for (const c of data.cases) {
    ownerByCase.set(c.id, c.ownerUserId)
  }

  const locations = data.locations.map((l) => {
    if (l.createdByUserId?.trim()) return l
    const owner = ownerByCase.get(l.caseId) ?? ''
    return { ...l, createdByUserId: owner }
  })

  const tracks = data.tracks.map((t) => {
    if (t.createdByUserId?.trim()) return t
    const owner = ownerByCase.get(t.caseId) ?? ''
    return { ...t, createdByUserId: owner }
  })

  const trackPoints = data.trackPoints.map((p) => {
    if (p.createdByUserId?.trim()) return p
    const owner = ownerByCase.get(p.caseId) ?? ''
    return { ...p, createdByUserId: owner }
  })

  const caseAttachments = data.caseAttachments.map((a) => {
    if (a.createdByUserId?.trim()) return a
    const owner = ownerByCase.get(a.caseId) ?? ''
    return { ...a, createdByUserId: owner }
  })

  return { ...data, locations, tracks, trackPoints, caseAttachments }
}

function migrateCaseOrgAndAttachments(data: AppData): AppData {
  return {
    ...data,
    deletedCaseCollaboratorKeys: data.deletedCaseCollaboratorKeys ?? [],
    cases: data.cases.map((c) => ({
      ...c,
      organizationId: c.organizationId ?? null,
      unitId: c.unitId ?? null,
      lifecycle: c.lifecycle ?? 'open',
    })),
    caseAttachments: data.caseAttachments.map((a) => ({
      ...a,
      imageDataUrl: a.imageDataUrl ?? '',
      imageStoragePath: a.imageStoragePath ?? null,
      contentType: a.contentType ?? '',
    })),
  }
}

export function normalizeAppData(data: AppData): AppData {
  return migrateCreatedByUserIds(
    normalizeTrackPointSequences(
      migrateTrackPointUpdatedAt(migrateTrackUpdatedAt(migrateCaseOrgAndAttachments(data))),
    ),
  )
}

localforage.config({
  name: 'VideoCanvass',
  storeName: 'vc_store',
  description: 'Offline storage for VideoCanvass MVP',
})

async function loadSharedData(): Promise<AppData | null> {
  if (!hasSupabaseConfig || !supabase) return null
  const sb = supabase

  const loadInner = async (): Promise<AppData | null> => {
    try {
      const { data, error } = await sb
        .from('vc_app_state')
        .select('payload')
        .eq('workspace_id', SHARED_WORKSPACE_ID)
        .maybeSingle()
      if (error) {
        console.warn('Supabase load failed, falling back to local storage:', error.message)
        setSyncStatus({ mode: 'local_fallback', message: `Supabase load failed: ${error.message}` })
        return null
      }
      if (!data?.payload) return DEFAULT_DATA
      const parsed = AppDataSchema.safeParse(data.payload)
      if (!parsed.success) {
        console.warn('Supabase payload parse failed; refusing to treat payload as empty/default.')
        setSyncStatus({ mode: 'local_fallback', message: 'Supabase payload parse failed' })
        return null
      }
      setSyncStatus({ mode: 'supabase_ok', message: 'Supabase load OK' })
      return normalizeAppData(parsed.data)
    } catch (err) {
      console.warn('Supabase load threw unexpectedly, falling back to local storage:', err)
      setSyncStatus({ mode: 'local_fallback', message: 'Supabase load threw unexpectedly' })
      return null
    }
  }

  type RaceOk = { tag: 'ok'; value: AppData | null }
  type RaceTo = { tag: 'timeout' }
  const raced = await Promise.race([
    loadInner().then((value): RaceOk => ({ tag: 'ok', value })),
    new Promise<RaceTo>((resolve) => {
      setTimeout(() => resolve({ tag: 'timeout' }), SHARED_TABLE_BOOTSTRAP_MS)
    }),
  ])
  if (raced.tag === 'timeout') {
    console.warn(`vc_app_state bootstrap timed out after ${SHARED_TABLE_BOOTSTRAP_MS}ms`)
    setSyncStatus({
      mode: 'local_fallback',
      message: 'Cloud workspace load timed out; using local data or empty start.',
    })
    return null
  }
  return raced.value
}

async function saveSharedData(data: AppData): Promise<boolean> {
  if (!hasSupabaseConfig || !supabase) return false
  try {
    const { error } = await supabase.from('vc_app_state').upsert(
      {
        workspace_id: SHARED_WORKSPACE_ID,
        payload: data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' },
    )
    if (error) {
      console.warn('Supabase save failed, falling back to local storage:', error.message)
      setSyncStatus({ mode: 'local_fallback', message: `Supabase save failed: ${error.message}` })
      return false
    }
    setSyncStatus({ mode: 'supabase_ok', message: 'Supabase save OK' })
    return true
  } catch (err) {
    console.warn('Supabase save threw unexpectedly, falling back to local storage:', err)
    setSyncStatus({ mode: 'local_fallback', message: 'Supabase save threw unexpectedly' })
    return false
  }
}

function mergeById<T>(
  local: T[],
  remote: T[],
  getId: (item: T) => string,
  getUpdatedAt: (item: T) => number,
): T[] {
  const merged = new Map<string, T>()

  for (const item of remote) {
    merged.set(getId(item), item)
  }

  for (const item of local) {
    const id = getId(item)
    const existing = merged.get(id)
    if (!existing) {
      merged.set(id, item)
      continue
    }
    const localTs = getUpdatedAt(item)
    const remoteTs = getUpdatedAt(existing)
    merged.set(id, localTs >= remoteTs ? item : existing)
  }

  return Array.from(merged.values())
}

export function caseCollaboratorTombstoneKey(caseId: string, userId: string): string {
  return `${caseId}::${userId}`
}

function mergeCollaborators(local: CaseCollaborator[], remote: CaseCollaborator[]): CaseCollaborator[] {
  return mergeById(
    local,
    remote,
    (c) => caseCollaboratorTombstoneKey(c.caseId, c.userId),
    (c) => c.createdAt,
  )
}

function mergeTombstoneIds(a: string[] | undefined, b: string[] | undefined): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])]
}

/**
 * Compact signature for comparing two AppData snapshots without stringifying huge fields
 * (e.g. base64 `imageDataUrl`). Used to skip redundant React state / IndexedDB writes after sync pulls.
 */
export function appDataSyncFingerprint(d: AppData): string {
  const sortStrs = (xs: string[]) => xs.slice().sort().join('\n')
  const caseKey = (c: CaseCollaborator) => caseCollaboratorTombstoneKey(c.caseId, c.userId)
  const rows = <T,>(items: T[], key: (t: T) => string, ts: (t: T) => number) =>
    items
      .map((x) => `${key(x)}\t${ts(x)}`)
      .sort()
      .join('\n')

  const attRows = d.caseAttachments
    .map((a) => {
      const img = a.imageDataUrl?.trim() ?? ''
      return `${a.id}\t${a.updatedAt ?? a.createdAt}\t${img.length}\t${(a.imageStoragePath ?? '').trim()}`
    })
    .sort()
    .join('\n')

  return JSON.stringify({
    v: d.version,
    dc: sortStrs(d.deletedCaseIds),
    dl: sortStrs(d.deletedLocationIds),
    dt: sortStrs(d.deletedTrackIds),
    dp: sortStrs(d.deletedTrackPointIds),
    da: sortStrs(d.deletedCaseAttachmentIds),
    dk: sortStrs(d.deletedCaseCollaboratorKeys),
    cases: rows(d.cases, (c) => c.id, (c) => c.updatedAt ?? c.createdAt),
    locs: rows(d.locations, (l) => l.id, (l) => l.updatedAt ?? l.createdAt),
    tracks: rows(d.tracks, (t) => t.id, (t) => (t.updatedAt ?? t.createdAt)),
    pts: rows(d.trackPoints, (p) => p.id, (p) => p.updatedAt ?? p.createdAt),
    users: rows(d.users, (u) => u.id, (u) => u.createdAt),
    collab: rows(d.caseCollaborators, caseKey, (c) => c.createdAt),
    att: attRows,
  })
}

export function mergeAppData(local: AppData, remote: AppData): AppData {
  const delCases = new Set(mergeTombstoneIds(local.deletedCaseIds, remote.deletedCaseIds))
  const delLocs = new Set(mergeTombstoneIds(local.deletedLocationIds, remote.deletedLocationIds))
  const delTracks = new Set(mergeTombstoneIds(local.deletedTrackIds, remote.deletedTrackIds))
  const delPoints = new Set(mergeTombstoneIds(local.deletedTrackPointIds, remote.deletedTrackPointIds))
  const delAtt = new Set(mergeTombstoneIds(local.deletedCaseAttachmentIds, remote.deletedCaseAttachmentIds))
  const delCollabKeys = new Set(
    mergeTombstoneIds(local.deletedCaseCollaboratorKeys, remote.deletedCaseCollaboratorKeys),
  )

  const locCases = local.cases.filter((c) => !delCases.has(c.id))
  const remCases = remote.cases.filter((c) => !delCases.has(c.id))
  const locLocs = local.locations.filter((l) => !delLocs.has(l.id) && !delCases.has(l.caseId))
  const remLocs = remote.locations.filter((l) => !delLocs.has(l.id) && !delCases.has(l.caseId))
  const locTracks = local.tracks.filter((t) => !delTracks.has(t.id) && !delCases.has(t.caseId))
  const remTracks = remote.tracks.filter((t) => !delTracks.has(t.id) && !delCases.has(t.caseId))
  const locPts = local.trackPoints.filter(
    (p) => !delPoints.has(p.id) && !delCases.has(p.caseId) && !delTracks.has(p.trackId),
  )
  const remPts = remote.trackPoints.filter(
    (p) => !delPoints.has(p.id) && !delCases.has(p.caseId) && !delTracks.has(p.trackId),
  )

  const collabKey = (c: CaseCollaborator) => caseCollaboratorTombstoneKey(c.caseId, c.userId)
  const locCollab = local.caseCollaborators.filter(
    (c) => !delCases.has(c.caseId) && !delCollabKeys.has(collabKey(c)),
  )
  const remCollab = remote.caseCollaborators.filter(
    (c) => !delCases.has(c.caseId) && !delCollabKeys.has(collabKey(c)),
  )

  const locAtt = local.caseAttachments.filter((a) => !delAtt.has(a.id) && !delCases.has(a.caseId))
  const remAtt = remote.caseAttachments.filter((a) => !delAtt.has(a.id) && !delCases.has(a.caseId))

  return normalizeAppData({
    version: 1,
    deletedCaseIds: [...delCases],
    deletedLocationIds: [...delLocs],
    deletedTrackIds: [...delTracks],
    deletedTrackPointIds: [...delPoints],
    deletedCaseAttachmentIds: [...delAtt],
    deletedCaseCollaboratorKeys: [...delCollabKeys],
    cases: mergeById(locCases, remCases, (x) => x.id, (x) => x.updatedAt ?? x.createdAt),
    locations: mergeById(locLocs, remLocs, (x) => x.id, (x) => x.updatedAt ?? x.createdAt),
    tracks: mergeById(locTracks, remTracks, (x) => x.id, (x) => x.updatedAt ?? x.createdAt),
    trackPoints: mergeById(locPts, remPts, (x) => x.id, (x) => x.updatedAt ?? x.createdAt),
    users: mergeById(local.users, remote.users, (x) => x.id, (x) => x.createdAt),
    caseCollaborators: mergeCollaborators(locCollab, remCollab),
    caseAttachments: mergeById(locAtt, remAtt, (x) => x.id, (x) => x.updatedAt ?? x.createdAt),
  })
}

export async function loadData(): Promise<AppData> {
  if (relationalBackendEnabled() && supabase) {
    const sb = supabase
    // Drop expired / tokenless sessions so we do not treat them as "logged in" (blocks login + remote load).
    const quickSession = await getUsableSessionOrSignOut(sb)
    if (!quickSession?.user) {
      setSyncStatus({ mode: 'local_fallback', message: 'Sign in to load cloud data' })
      const local = await loadLocalData()
      return local ?? DEFAULT_DATA
    }

    const auth = await getRelationalAuthUserIdWithTimeout(sb, RELATIONAL_AUTH_USER_ID_TIMEOUT_MS)
    if (auth.timedOut) {
      setSyncStatus({
        mode: 'local_fallback',
        message: 'Auth check timed out; using local data or retry. Your session may still work for sync.',
      })
    }

    const { loadAppDataFromRelational } = await import('./relational/sync')
    type RaceOk = { tag: 'ok'; value: Awaited<ReturnType<typeof loadAppDataFromRelational>> }
    type RaceTo = { tag: 'timeout' }
    const remoteRaced = await Promise.race([
      loadAppDataFromRelational({
        emptyCaseUserId: auth.timedOut ? null : auth.uid,
      }).then((value): RaceOk => ({ tag: 'ok', value })),
      new Promise<RaceTo>((resolve) => {
        setTimeout(() => resolve({ tag: 'timeout' }), RELATIONAL_BOOTSTRAP_REMOTE_MS)
      }),
    ])
    const remote = remoteRaced.tag === 'ok' ? remoteRaced.value : null
    if (remoteRaced.tag === 'timeout') {
      console.warn(`Relational bootstrap timed out after ${RELATIONAL_BOOTSTRAP_REMOTE_MS}ms`)
      setSyncStatus({
        mode: 'local_fallback',
        message: 'Database load timed out; you can use local data or retry after sign-in.',
      })
      const local = await loadLocalData()
      return local ?? DEFAULT_DATA
    }
    if (remote) {
      try {
        await Promise.race([
          localforage.setItem(STORE_KEY, remote),
          new Promise<never>((_, rej) => {
            setTimeout(() => rej(new Error('IndexedDB setItem timed out')), 12_000)
          }),
        ])
      } catch (e) {
        console.warn('Local cache write failed or timed out:', e)
      }
      setSyncStatus({ mode: 'supabase_ok', message: 'Loaded from database' })
      return remote
    }
    setSyncStatus({ mode: 'local_fallback', message: 'Database load failed or empty' })
    const local = await loadLocalData()
    return local ?? DEFAULT_DATA
  }

  if (!hasSupabaseConfig || !supabase) {
    setSyncStatus({ mode: 'local_fallback', message: 'Supabase env missing; using local storage' })
  }

  // Fast-first startup: hydrate from IndexedDB immediately when available.
  // Collaborative sync merges remote shortly after ready (store effect), so
  // home screen does not block on network latency.
  const local = await loadLocalData()
  if (local) return local
  const shared = await loadSharedData()

  if (shared) {
    // Keep a local mirror so transient Supabase read failures on refresh do not
    // appear as "all data disappeared".
    await localforage.setItem(STORE_KEY, shared)
    return shared
  }
  return DEFAULT_DATA
}

/**
 * Merges with latest remote when Supabase is configured, writes canonical payload to disk/server, and returns that payload.
 * Callers must replace in-memory state with the return value so the UI matches what was stored (union of peers’ rows).
 */
export async function saveData(data: AppData): Promise<AppData> {
  if (relationalBackendEnabled() && supabase) {
    const payloadToSave = normalizeAppData(data)
    const writeAuth = await ensureRelationalClientSession(supabase)
    if (!writeAuth) {
      await localforage.setItem(STORE_KEY, payloadToSave)
      setSyncStatus({ mode: 'local_fallback', message: 'Not signed in; saved locally only' })
      return payloadToSave
    }
    try {
      const { pushAppDataToRelational } = await import('./relational/sync')
      await pushAppDataToRelational(payloadToSave, writeAuth.userId)
      await localforage.setItem(STORE_KEY, payloadToSave)
      setSyncStatus({ mode: 'supabase_ok', message: 'Saved to database' })
      return payloadToSave
    } catch (e) {
      console.warn('Relational save failed:', e)
      await localforage.setItem(STORE_KEY, payloadToSave)
      const detail = formatDbErrorForSync(e)
      const clipped = detail.length > 200 ? `${detail.slice(0, 197)}…` : detail
      const rlsHint =
        /row-level security|\brls\b/i.test(detail) ? ' Try refreshing the page or signing in again.' : ''
      setSyncStatus({ mode: 'local_fallback', message: `Database save failed: ${clipped}${rlsHint}` })
      return payloadToSave
    }
  }

  let payloadToSave: AppData
  if (hasSupabaseConfig && supabase) {
    const remote = await loadSharedData()
    payloadToSave = remote ? mergeAppData(data, remote) : normalizeAppData(data)
  } else {
    payloadToSave = normalizeAppData(data)
  }

  const savedRemote = await saveSharedData(payloadToSave)
  // Always update local cache with the canonical payload, even when remote save
  // succeeded, so refresh fallback remains consistent.
  await localforage.setItem(STORE_KEY, payloadToSave)
  if (savedRemote) {
    return payloadToSave
  }
  if (!hasSupabaseConfig || !supabase) {
    setSyncStatus({ mode: 'local_fallback', message: 'Saved locally (Supabase not configured)' })
  }
  return payloadToSave
}

async function loadLocalData(): Promise<AppData | null> {
  try {
    const raw = await localforage.getItem<unknown>(STORE_KEY)
    if (!raw) return null
    const parsed = AppDataSchema.safeParse(raw)
    if (!parsed.success) return null
    return normalizeAppData(parsed.data)
  } catch (err) {
    console.warn('Local storage load failed:', err)
    return null
  }
}

/** Server row `updated_at` for change detection (avoids downloading full payload every poll when unchanged). */
export async function fetchRemotePayloadUpdatedAt(): Promise<string | null> {
  if (relationalBackendEnabled()) return null
  if (!hasSupabaseConfig || !supabase) return null
  try {
    const { data, error } = await supabase
      .from('vc_app_state')
      .select('updated_at')
      .eq('workspace_id', SHARED_WORKSPACE_ID)
      .maybeSingle()
    if (error) {
      console.warn('fetchRemotePayloadUpdatedAt:', error.message)
      return null
    }
    const raw = data?.updated_at
    if (raw == null) return null
    return typeof raw === 'string' ? raw : String(raw)
  } catch (err) {
    console.warn('fetchRemotePayloadUpdatedAt threw:', err)
    return null
  }
}

/** Merge latest remote JSON blob into the current in-memory dataset (per-entity LWW). */
export async function pullAndMergeWithLocal(local: AppData): Promise<AppData | null> {
  if (relationalBackendEnabled() && supabase) {
    const quick = await getUsableSessionOrSignOut(supabase)
    if (!quick?.user) return null
    const auth = await getRelationalAuthUserIdWithTimeout(supabase, RELATIONAL_AUTH_USER_ID_TIMEOUT_MS)
    if (!auth.uid && !auth.timedOut) return null
    const { loadAppDataFromRelational } = await import('./relational/sync')
    const remote = await loadAppDataFromRelational({
      emptyCaseUserId: auth.timedOut ? null : auth.uid,
    })
    if (!remote) return null
    return mergeAppData(local, remote)
  }
  const remote = await loadSharedData()
  if (!remote) return null
  return mergeAppData(local, remote)
}

/** Persist to IndexedDB only (after a remote pull; does not upsert to Supabase). */
export async function writeLocalDataCache(data: AppData): Promise<void> {
  await localforage.setItem(STORE_KEY, normalizeAppData(data))
}

