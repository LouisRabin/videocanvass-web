import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  appDataSyncFingerprint,
  fetchRemotePayloadUpdatedAt,
  pullAndMergeWithLocal,
  REMOTE_SYNC_POLL_MS,
  writeLocalDataCache,
} from './db'
import { relationalBackendEnabled } from './backendMode'
import { SHARED_WORKSPACE_ID, hasSupabaseConfig, supabase } from './supabase'
import { setSyncStatus } from './syncStatus'
import type { AppData } from './types'

/**
 * Supabase Realtime + periodic pull for relational tables or legacy `vc_app_state` JSON.
 * Kept separate from {@link StoreProvider} so `store.tsx` stays focused on CRUD and optimistic updates.
 */
export function useSupabaseAppDataSync(params: {
  ready: boolean
  dataRef: MutableRefObject<AppData>
  setData: Dispatch<SetStateAction<AppData>>
  lastRemoteUpdatedAtRef: MutableRefObject<string | null>
  syncPullInFlightRef: MutableRefObject<boolean>
}): void {
  const { ready, dataRef, setData, lastRemoteUpdatedAtRef, syncPullInFlightRef } = params

  useEffect(() => {
    if (!ready || !hasSupabaseConfig || !supabase) return
    const sb = supabase

    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let resumeTimer: ReturnType<typeof setTimeout> | null = null

    if (relationalBackendEnabled()) {
      const applyRelationalMerge = async () => {
        if (cancelled || syncPullInFlightRef.current) return
        syncPullInFlightRef.current = true
        try {
          const cur = dataRef.current
          const merged = await pullAndMergeWithLocal(cur)
          if (cancelled || !merged) return
          if (appDataSyncFingerprint(merged) === appDataSyncFingerprint(cur)) return
          dataRef.current = merged
          setData(merged)
          await writeLocalDataCache(merged)
          setSyncStatus({
            mode: 'supabase_ok',
            message: 'Updated from database',
            remoteMergeNotice:
              'Some entries were updated from the server. Re-check open cases if something looks unexpected.',
          })
        } catch (e) {
          console.warn('Relational sync pull failed:', e)
        } finally {
          syncPullInFlightRef.current = false
        }
      }

      const scheduleRelationalMerge = () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = window.setTimeout(() => {
          debounceTimer = null
          void applyRelationalMerge()
        }, 120)
      }

      const scheduleResumeRelational = () => {
        if (document.visibilityState !== 'visible') return
        if (resumeTimer) clearTimeout(resumeTimer)
        resumeTimer = window.setTimeout(() => {
          resumeTimer = null
          void applyRelationalMerge()
        }, 80)
      }

      const tables = [
        'vc_cases',
        'vc_locations',
        'vc_tracks',
        'vc_track_points',
        'vc_case_collaborators',
        'vc_case_attachments',
        'vc_profiles',
        'vc_user_unit_members',
      ] as const
      const channel = sb.channel('vc_relational_changes')
      for (const table of tables) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => scheduleRelationalMerge())
      }
      void channel.subscribe()
      const pollTimer = window.setInterval(() => void applyRelationalMerge(), REMOTE_SYNC_POLL_MS)
      void applyRelationalMerge()

      document.addEventListener('visibilitychange', scheduleResumeRelational)
      window.addEventListener('pageshow', scheduleResumeRelational)
      window.addEventListener('online', scheduleResumeRelational)

      return () => {
        cancelled = true
        window.clearInterval(pollTimer)
        if (debounceTimer) window.clearTimeout(debounceTimer)
        if (resumeTimer) window.clearTimeout(resumeTimer)
        document.removeEventListener('visibilitychange', scheduleResumeRelational)
        window.removeEventListener('pageshow', scheduleResumeRelational)
        window.removeEventListener('online', scheduleResumeRelational)
        void sb.removeChannel(channel)
      }
    }

    const applyRemoteMerge = async (fromRealtime: boolean, force = false) => {
      if (cancelled || syncPullInFlightRef.current) return
      syncPullInFlightRef.current = true
      try {
        const ts = await fetchRemotePayloadUpdatedAt()
        if (!force) {
          if (cancelled || ts == null) return
          if (!fromRealtime && ts === lastRemoteUpdatedAtRef.current) return
        } else if (cancelled) {
          return
        }
        if (ts != null) lastRemoteUpdatedAtRef.current = ts
        const cur = dataRef.current
        const merged = await pullAndMergeWithLocal(cur)
        if (cancelled || !merged) return
        if (appDataSyncFingerprint(merged) === appDataSyncFingerprint(cur)) return
        dataRef.current = merged
        setData(merged)
        await writeLocalDataCache(merged)
        setSyncStatus({ mode: 'supabase_ok', message: 'Updated from shared workspace' })
      } catch (e) {
        console.warn('Collaborative sync pull failed:', e)
      } finally {
        syncPullInFlightRef.current = false
      }
    }

    const scheduleMerge = (fromRealtime = false) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        void applyRemoteMerge(fromRealtime)
      }, 120)
    }

    const scheduleResumeMerge = () => {
      if (document.visibilityState !== 'visible') return
      if (resumeTimer) clearTimeout(resumeTimer)
      resumeTimer = window.setTimeout(() => {
        resumeTimer = null
        void applyRemoteMerge(false, true)
      }, 80)
    }

    const pollTimer = window.setInterval(() => void applyRemoteMerge(false), REMOTE_SYNC_POLL_MS)

    const channel = sb
      .channel(`vc_app_state:${SHARED_WORKSPACE_ID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vc_app_state',
          filter: `workspace_id=eq.${SHARED_WORKSPACE_ID}`,
        },
        () => scheduleMerge(true),
      )
      .subscribe()

    void fetchRemotePayloadUpdatedAt().then((t) => {
      if (!cancelled && t) lastRemoteUpdatedAtRef.current = t
    })
    void applyRemoteMerge(false)

    document.addEventListener('visibilitychange', scheduleResumeMerge)
    window.addEventListener('pageshow', scheduleResumeMerge)
    window.addEventListener('online', scheduleResumeMerge)

    return () => {
      cancelled = true
      window.clearInterval(pollTimer)
      if (debounceTimer) window.clearTimeout(debounceTimer)
      if (resumeTimer) window.clearTimeout(resumeTimer)
      document.removeEventListener('visibilitychange', scheduleResumeMerge)
      window.removeEventListener('pageshow', scheduleResumeMerge)
      window.removeEventListener('online', scheduleResumeMerge)
      void sb.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs/setState stable; only `ready` gates setup
  }, [ready])
}
