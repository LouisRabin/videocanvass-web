import localforage from 'localforage'
import { AppDataSchema, DEFAULT_DATA, type AppData, type CaseCollaborator, type TrackPoint } from './types'
import { SHARED_WORKSPACE_ID, hasSupabaseConfig, supabase } from './supabase'
import { setSyncStatus } from './syncStatus'

const STORE_KEY = 'videocanvass:data:v1'

/** How often to pull shared state when Supabase is configured (Realtime also triggers pulls). */
export const REMOTE_SYNC_POLL_MS = 12_000

function migrateTrackPointUpdatedAt(data: AppData): AppData {
  return {
    ...data,
    trackPoints: data.trackPoints.map((p) => ({
      ...p,
      updatedAt: p.updatedAt ?? p.createdAt,
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

export function normalizeAppData(data: AppData): AppData {
  return migrateCreatedByUserIds(normalizeTrackPointSequences(migrateTrackPointUpdatedAt(data)))
}

localforage.config({
  name: 'VideoCanvass',
  storeName: 'vc_store',
  description: 'Offline storage for VideoCanvass MVP',
})

async function loadSharedData(): Promise<AppData | null> {
  if (!hasSupabaseConfig || !supabase) return null
  try {
    const { data, error } = await supabase.from('vc_app_state').select('payload').eq('workspace_id', SHARED_WORKSPACE_ID).maybeSingle()
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

function mergeCollaborators(local: CaseCollaborator[], remote: CaseCollaborator[]): CaseCollaborator[] {
  return mergeById(
    local,
    remote,
    (c) => `${c.caseId}::${c.userId}`,
    (c) => c.createdAt,
  )
}

function mergeTombstoneIds(a: string[] | undefined, b: string[] | undefined): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])]
}

export function mergeAppData(local: AppData, remote: AppData): AppData {
  const delCases = new Set(mergeTombstoneIds(local.deletedCaseIds, remote.deletedCaseIds))
  const delLocs = new Set(mergeTombstoneIds(local.deletedLocationIds, remote.deletedLocationIds))
  const delTracks = new Set(mergeTombstoneIds(local.deletedTrackIds, remote.deletedTrackIds))
  const delPoints = new Set(mergeTombstoneIds(local.deletedTrackPointIds, remote.deletedTrackPointIds))
  const delAtt = new Set(mergeTombstoneIds(local.deletedCaseAttachmentIds, remote.deletedCaseAttachmentIds))

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

  const locCollab = local.caseCollaborators.filter((c) => !delCases.has(c.caseId))
  const remCollab = remote.caseCollaborators.filter((c) => !delCases.has(c.caseId))

  const locAtt = local.caseAttachments.filter((a) => !delAtt.has(a.id) && !delCases.has(a.caseId))
  const remAtt = remote.caseAttachments.filter((a) => !delAtt.has(a.id) && !delCases.has(a.caseId))

  return normalizeAppData({
    version: 1,
    deletedCaseIds: [...delCases],
    deletedLocationIds: [...delLocs],
    deletedTrackIds: [...delTracks],
    deletedTrackPointIds: [...delPoints],
    deletedCaseAttachmentIds: [...delAtt],
    cases: mergeById(locCases, remCases, (x) => x.id, (x) => x.updatedAt ?? x.createdAt),
    locations: mergeById(locLocs, remLocs, (x) => x.id, (x) => x.updatedAt ?? x.createdAt),
    tracks: mergeById(locTracks, remTracks, (x) => x.id, (x) => x.createdAt),
    trackPoints: mergeById(locPts, remPts, (x) => x.id, (x) => x.updatedAt ?? x.createdAt),
    users: mergeById(local.users, remote.users, (x) => x.id, (x) => x.createdAt),
    caseCollaborators: mergeCollaborators(locCollab, remCollab),
    caseAttachments: mergeById(locAtt, remAtt, (x) => x.id, (x) => x.updatedAt ?? x.createdAt),
  })
}

export async function loadData(): Promise<AppData> {
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
  const remote = await loadSharedData()
  if (!remote) return null
  return mergeAppData(local, remote)
}

/** Persist to IndexedDB only (after a remote pull; does not upsert to Supabase). */
export async function writeLocalDataCache(data: AppData): Promise<void> {
  await localforage.setItem(STORE_KEY, normalizeAppData(data))
}

