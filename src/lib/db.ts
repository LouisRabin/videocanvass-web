import localforage from 'localforage'
import { AppDataSchema, DEFAULT_DATA, type AppData, type TrackPoint } from './types'
import { SHARED_WORKSPACE_ID, hasSupabaseConfig, supabase } from './supabase'

const STORE_KEY = 'videocanvass:data:v1'

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

localforage.config({
  name: 'VideoCanvass',
  storeName: 'vc_store',
  description: 'Offline storage for VideoCanvass MVP',
})

async function loadSharedData(): Promise<AppData | null> {
  if (!hasSupabaseConfig || !supabase) return null
  const { data, error } = await supabase.from('vc_app_state').select('payload').eq('workspace_id', SHARED_WORKSPACE_ID).maybeSingle()
  if (error) {
    console.warn('Supabase load failed, falling back to local storage:', error.message)
    return null
  }
  if (!data?.payload) return DEFAULT_DATA
  const parsed = AppDataSchema.safeParse(data.payload)
  return parsed.success ? normalizeTrackPointSequences(parsed.data) : DEFAULT_DATA
}

async function saveSharedData(data: AppData): Promise<boolean> {
  if (!hasSupabaseConfig || !supabase) return false
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
    return false
  }
  return true
}

export async function loadData(): Promise<AppData> {
  const shared = await loadSharedData()
  if (shared) return shared
  const raw = await localforage.getItem<unknown>(STORE_KEY)
  if (!raw) return DEFAULT_DATA
  const parsed = AppDataSchema.safeParse(raw)
  return parsed.success ? normalizeTrackPointSequences(parsed.data) : DEFAULT_DATA
}

export async function saveData(data: AppData): Promise<void> {
  const savedRemote = await saveSharedData(data)
  if (savedRemote) return
  await localforage.setItem(STORE_KEY, data)
}

