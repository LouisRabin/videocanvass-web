import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  appDataSyncFingerprint,
  fetchRemotePayloadUpdatedAt,
  caseCollaboratorTombstoneKey,
  findDuplicateLocationForCase,
  loadData,
  mergeAppData,
  normalizeAppData,
  pullAndMergeWithLocal,
  REMOTE_SYNC_POLL_MS,
  saveData,
  writeLocalDataCache,
} from './db'
import { relationalBackendEnabled } from './backendMode'
import { SHARED_WORKSPACE_ID, hasSupabaseConfig, supabase } from './supabase'
import { logVcAudit } from './relational/auditLog'
import { deleteCaseAttachmentFromStorage, uploadCaseAttachmentFromDataUrl } from './relational/storageAttachment'
import { adjustPendingRemoteSaves, setSyncStatus } from './syncStatus'
import { newId } from './id'
import { pickRouteColorForNewTrack } from './trackColors'
import {
  assertPermission,
  canAddCaseContent,
  canDeleteAllTracksForCase,
  canDeleteCase,
  canDeleteLocation,
  canDeleteTrack,
  canDeleteCaseAttachment,
  canDeleteTrackPoint,
  canEditCaseAttachment,
  canEditCaseMeta,
  canEditLocation,
  canEditTrack,
  canEditTrackPoint,
  canManageCollaborators,
  findCase,
} from './casePermissions'
import type {
  AddressBounds,
  AppData,
  AppUser,
  CanvassStatus,
  CaseAttachment,
  CaseAttachmentKind,
  CaseCollaborator,
  CaseFile,
  Location,
  Track,
  TrackPoint,
} from './types'

type StoreState = {
  ready: boolean
  data: AppData
  createCase: (input: { ownerUserId: string; caseName: string; description?: string }) => Promise<string>
  deleteCase: (actorUserId: string, caseId: string) => Promise<void>
  updateCase: (
    actorUserId: string,
    caseId: string,
    patch: Partial<Pick<CaseFile, 'caseNumber' | 'title' | 'description' | 'lifecycle'>>,
  ) => Promise<void>
  addCaseAttachment: (
    actorUserId: string,
    input: { caseId: string; kind: CaseAttachmentKind; caption?: string; imageDataUrl: string },
  ) => Promise<string>
  updateCaseAttachment: (
    actorUserId: string,
    attachmentId: string,
    patch: Partial<Pick<CaseAttachment, 'kind' | 'caption'>>,
  ) => Promise<void>
  deleteCaseAttachment: (actorUserId: string, attachmentId: string) => Promise<void>
  addCaseCollaborator: (actorUserId: string, input: { caseId: string; collaboratorUserId: string }) => Promise<void>
  removeCaseCollaborator: (actorUserId: string, input: { caseId: string; collaboratorUserId: string }) => Promise<void>
  createLocation: (input: {
    caseId: string
    createdByUserId: string
    addressText: string
    lat: number
    lon: number
    bounds?: AddressBounds | null
    status: CanvassStatus
    notes?: string
  }) => Promise<string>
  deleteLocation: (actorUserId: string, locationId: string) => Promise<void>
  createTrack: (input: { caseId: string; createdByUserId: string; label: string; kind: Track['kind'] }) => Promise<string>
  updateTrack: (actorUserId: string, trackId: string, patch: Partial<Pick<Track, 'label' | 'kind' | 'routeColor'>>) => Promise<void>
  deleteTrack: (actorUserId: string, trackId: string) => Promise<void>
  deleteAllTracksForCase: (actorUserId: string, caseId: string) => Promise<void>
  createTrackPoint: (
    input:
      | { caseId: string; createdByUserId: string; trackId: string; locationId: string; visitedAt?: number | null }
      | { caseId: string; createdByUserId: string; trackId: string; lat: number; lon: number; label?: string; visitedAt?: number | null },
  ) => Promise<string>
  deleteTrackPoint: (actorUserId: string, pointId: string) => Promise<void>
  updateTrackPoint: (
    actorUserId: string,
    pointId: string,
    patch: Partial<
      Pick<
        TrackPoint,
        | 'addressText'
        | 'lat'
        | 'lon'
        | 'visitedAt'
        | 'notes'
        | 'showOnMap'
        | 'displayTimeOnMap'
        | 'mapTimeLabelOffsetX'
        | 'mapTimeLabelOffsetY'
      >
    >,
  ) => Promise<void>
  updateLocation: (
    actorUserId: string,
    locationId: string,
    patch: Partial<Pick<Location, 'addressText' | 'lat' | 'lon' | 'status' | 'notes' | 'lastVisitedAt' | 'footprint'>>,
  ) => Promise<void>
}

const StoreCtx = createContext<StoreState | null>(null)

function pushTombstone(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id]
}

function ensurePocUsers(data: AppData): AppData {
  if (relationalBackendEnabled()) return data
  if (data.users.length > 0) return data
  const now = Date.now()
  const users: AppUser[] = [
    { id: 'u-demo-1', displayName: 'Det. Alex Rivera', email: 'alex.rivera.demo@nypd.local', taxNumber: 'TAX1001', createdAt: now },
    { id: 'u-demo-2', displayName: 'Det. Morgan Lee', email: 'morgan.lee.demo@nypd.local', taxNumber: 'TAX1002', createdAt: now },
    {
      id: 'u-demo-3',
      displayName: 'Sgt. Jordan Patel',
      email: 'jordan.patel.demo@nypd.local',
      taxNumber: 'TAX2001',
      createdAt: now,
    },
  ]
  return { ...data, users }
}

export function StoreProvider(props: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<AppData>({
    version: 1,
    cases: [],
    locations: [],
    tracks: [],
    trackPoints: [],
    users: [],
    caseCollaborators: [],
    caseAttachments: [],
    deletedCaseIds: [],
    deletedLocationIds: [],
    deletedTrackIds: [],
    deletedTrackPointIds: [],
    deletedCaseAttachmentIds: [],
    deletedCaseCollaboratorKeys: [],
  })
  const dataRef = useRef<AppData>({
    version: 1,
    cases: [],
    locations: [],
    tracks: [],
    trackPoints: [],
    users: [],
    caseCollaborators: [],
    caseAttachments: [],
    deletedCaseIds: [],
    deletedLocationIds: [],
    deletedTrackIds: [],
    deletedTrackPointIds: [],
    deletedCaseAttachmentIds: [],
    deletedCaseCollaboratorKeys: [],
  })
  /** Last seen Supabase `vc_app_state.updated_at` to skip redundant full pulls. */
  const lastRemoteUpdatedAtRef = useRef<string | null>(null)
  /** Avoid overlapping pull/merge work (poll + realtime can stack and freeze the UI). */
  const syncPullInFlightRef = useRef(false)
  /** Serialize remote commits so save completions apply in order. */
  const remoteCommitChainRef = useRef(Promise.resolve())

  useEffect(() => {
    let alive = true
    ;(async () => {
      const loaded = await loadData()
      const d = ensurePocUsers(loaded)
      if (!alive) return
      dataRef.current = d
      setData(d)
      // Avoid blind startup writes that can accidentally overwrite shared cloud
      // state if a transient load/parsing issue occurred.
      const usersWereSeeded = loaded.users.length === 0 && d.users.length > 0
      if (usersWereSeeded) {
        const canonical = await saveData(d)
        dataRef.current = canonical
        setData(canonical)
      }
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  /** Auth session changes reload the dataset (relational backend only). */
  useEffect(() => {
    if (!relationalBackendEnabled() || !supabase) return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async () => {
      const d = await loadData()
      const next = ensurePocUsers(d)
      dataRef.current = next
      setData(next)
      await writeLocalDataCache(next)
    })
    return () => subscription.unsubscribe()
  }, [])

  /**
   * Commits optimistic state remotely, then merges canonical response with latest local edits
   * so older async saves cannot clobber newer in-flight user actions.
   */
  const commitOptimisticToRemote = useCallback(async (optimistic: AppData) => {
    try {
      const canonical = await saveData(optimistic)
      const latest = dataRef.current
      const final = mergeAppData(latest, canonical)
      dataRef.current = final
      setData(final)
    } catch (e) {
      // Keep optimistic local state on transient network/save failures.
      // Poll/realtime merge will reconcile with remote when available again.
      throw e
    }
    if (hasSupabaseConfig && supabase) {
      const t = await fetchRemotePayloadUpdatedAt()
      if (t) lastRemoteUpdatedAtRef.current = t
    }
  }, [])

  const persist = useCallback(
    (next: AppData) => {
      const optimistic = normalizeAppData(next)
      dataRef.current = optimistic
      setData(optimistic)
      void writeLocalDataCache(optimistic)
      adjustPendingRemoteSaves(1)
      remoteCommitChainRef.current = remoteCommitChainRef.current
        .then(() => commitOptimisticToRemote(optimistic))
        .catch((e) => {
          console.warn('Remote commit chain failed:', e)
        })
        .finally(() => {
          adjustPendingRemoteSaves(-1)
        })
    },
    [commitOptimisticToRemote],
  )

  /** Supabase Realtime + periodic pull: relational tables or legacy shared JSON blob. */
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
          const {
            data: { session },
          } = await sb.auth.getSession()
          if (!session?.user) return
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
  }, [ready])

  const createCase = useCallback(
    async (input: { ownerUserId: string; caseName: string; description?: string }) => {
      const now = Date.now()
      const id = newId('case')
      const caseName = input.caseName.trim()
      const current = dataRef.current
      const c: CaseFile = {
        id,
        ownerUserId: input.ownerUserId.trim(),
        organizationId: null,
        unitId: null,
        caseNumber: caseName,
        title: caseName,
        description: (input.description ?? '').trim(),
        createdAt: now,
        updatedAt: now,
        lifecycle: 'open',
      }
      const next: AppData = {
        ...current,
        cases: [c, ...current.cases],
      }
      await persist(next)
      return id
    },
    [persist],
  )

  const deleteCase = useCallback(
    async (actorUserId: string, caseId: string) => {
      const current = dataRef.current
      assertPermission(canDeleteCase(current, caseId, actorUserId))
      if (relationalBackendEnabled() && supabase) {
        void logVcAudit(supabase, {
          actorUserId: actorUserId.trim(),
          action: 'case.delete',
          entityType: 'case',
          entityId: caseId,
          caseId,
        })
      }
      const next: AppData = {
        ...current,
        deletedCaseIds: pushTombstone(current.deletedCaseIds, caseId),
        cases: current.cases.filter((c) => c.id !== caseId),
        locations: current.locations.filter((l) => l.caseId !== caseId),
        tracks: current.tracks.filter((t) => t.caseId !== caseId),
        trackPoints: current.trackPoints.filter((p) => p.caseId !== caseId),
        caseCollaborators: current.caseCollaborators.filter((cc) => cc.caseId !== caseId),
        caseAttachments: current.caseAttachments.filter((a) => a.caseId !== caseId),
      }
      await persist(next)
    },
    [persist],
  )

  const updateCase = useCallback(
    async (
      actorUserId: string,
      caseId: string,
      patch: Partial<Pick<CaseFile, 'caseNumber' | 'title' | 'description' | 'lifecycle'>>,
    ) => {
      const now = Date.now()
      const current = dataRef.current
      assertPermission(canEditCaseMeta(current, caseId, actorUserId))
      const next: AppData = {
        ...current,
        cases: current.cases.map((c) =>
          c.id === caseId
            ? {
                ...c,
                ...patch,
                updatedAt: now,
              }
            : c,
        ),
      }
      await persist(next)
    },
    [persist],
  )

  const addCaseAttachment = useCallback(
    async (
      actorUserId: string,
      input: { caseId: string; kind: CaseAttachmentKind; caption?: string; imageDataUrl: string },
    ) => {
      const url = input.imageDataUrl.trim()
      if (!url.startsWith('data:image/')) throw new Error('addCaseAttachment: expected a data:image URL')
      const now = Date.now()
      const id = newId('att')
      const current = dataRef.current
      const actor = actorUserId.trim()
      assertPermission(canAddCaseContent(current, input.caseId, actor))
      let imageDataUrl = url
      let imageStoragePath: string | null = null
      let contentType = ''
      if (relationalBackendEnabled() && supabase) {
        try {
          const up = await uploadCaseAttachmentFromDataUrl(supabase, input.caseId, id, url)
          imageStoragePath = up.path
          contentType = up.contentType
          imageDataUrl = ''
        } catch (e) {
          console.warn('Attachment upload failed; storing data URL only:', e)
        }
      }
      const row: CaseAttachment = {
        id,
        caseId: input.caseId,
        kind: input.kind,
        caption: (input.caption ?? '').trim().slice(0, 200),
        imageDataUrl,
        imageStoragePath,
        contentType,
        createdByUserId: actor,
        createdAt: now,
        updatedAt: now,
      }
      const next: AppData = {
        ...current,
        caseAttachments: [row, ...current.caseAttachments],
        cases: current.cases.map((c) => (c.id === input.caseId ? { ...c, updatedAt: now } : c)),
      }
      await persist(next)
      return id
    },
    [persist],
  )

  const updateCaseAttachment = useCallback(
    async (actorUserId: string, attachmentId: string, patch: Partial<Pick<CaseAttachment, 'kind' | 'caption'>>) => {
      const now = Date.now()
      const current = dataRef.current
      const existing = current.caseAttachments.find((a) => a.id === attachmentId)
      if (!existing) return
      assertPermission(canEditCaseAttachment(current, actorUserId, existing))
      const caseId = existing.caseId
      const next: AppData = {
        ...current,
        caseAttachments: current.caseAttachments.map((a) =>
          a.id === attachmentId
            ? {
                ...a,
                ...patch,
                caption:
                  patch.caption !== undefined ? patch.caption.trim().slice(0, 200) : a.caption,
                updatedAt: now,
              }
            : a,
        ),
        cases: current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)),
      }
      await persist(next)
    },
    [persist],
  )

  const deleteCaseAttachment = useCallback(
    async (actorUserId: string, attachmentId: string) => {
      const now = Date.now()
      const current = dataRef.current
      const att = current.caseAttachments.find((a) => a.id === attachmentId)
      if (!att) return
      assertPermission(canDeleteCaseAttachment(current, actorUserId, att))
      const caseId = att.caseId
      if (relationalBackendEnabled() && supabase && att.imageStoragePath?.trim()) {
        void deleteCaseAttachmentFromStorage(supabase, att.imageStoragePath)
      }
      if (relationalBackendEnabled() && supabase) {
        void logVcAudit(supabase, {
          actorUserId: actorUserId.trim(),
          action: 'attachment.delete',
          entityType: 'case_attachment',
          entityId: attachmentId,
          caseId,
        })
      }
      const next: AppData = {
        ...current,
        deletedCaseAttachmentIds: pushTombstone(current.deletedCaseAttachmentIds, attachmentId),
        caseAttachments: current.caseAttachments.filter((a) => a.id !== attachmentId),
        cases: current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)),
      }
      await persist(next)
    },
    [persist],
  )

  const addCaseCollaborator = useCallback(
    async (actorUserId: string, input: { caseId: string; collaboratorUserId: string }) => {
      const current = dataRef.current
      assertPermission(canManageCollaborators(current, input.caseId, actorUserId))
      const c = findCase(current, input.caseId)
      if (!c) throw new Error('Case not found')
      const uid = input.collaboratorUserId.trim()
      if (!uid || uid === c.ownerUserId) return
      if (current.caseCollaborators.some((cc) => cc.caseId === input.caseId && cc.userId === uid)) return
      const row: CaseCollaborator = {
        caseId: input.caseId,
        userId: uid,
        role: 'editor',
        createdAt: Date.now(),
      }
      const next: AppData = {
        ...current,
        caseCollaborators: [...current.caseCollaborators, row],
      }
      if (relationalBackendEnabled() && supabase) {
        void logVcAudit(supabase, {
          actorUserId: actorUserId.trim(),
          action: 'case_collaborator.add',
          entityType: 'case_collaborator',
          entityId: uid,
          caseId: input.caseId,
          meta: { collaboratorUserId: uid },
        })
      }
      await persist(next)
    },
    [persist],
  )

  const removeCaseCollaborator = useCallback(
    async (actorUserId: string, input: { caseId: string; collaboratorUserId: string }) => {
      const current = dataRef.current
      assertPermission(canManageCollaborators(current, input.caseId, actorUserId))
      const uid = input.collaboratorUserId.trim()
      const collabKey = caseCollaboratorTombstoneKey(input.caseId, uid)
      const next: AppData = {
        ...current,
        deletedCaseCollaboratorKeys: pushTombstone(current.deletedCaseCollaboratorKeys, collabKey),
        caseCollaborators: current.caseCollaborators.filter((cc) => !(cc.caseId === input.caseId && cc.userId === uid)),
      }
      if (relationalBackendEnabled() && supabase) {
        void logVcAudit(supabase, {
          actorUserId: actorUserId.trim(),
          action: 'case_collaborator.remove',
          entityType: 'case_collaborator',
          entityId: uid,
          caseId: input.caseId,
          meta: { collaboratorUserId: uid },
        })
      }
      await persist(next)
    },
    [persist],
  )

  const createLocation = useCallback(
    async (input: {
      caseId: string
      createdByUserId: string
      addressText: string
      lat: number
      lon: number
      bounds?: AddressBounds | null
      status: CanvassStatus
      notes?: string
    }) => {
      const now = Date.now()
      const current = dataRef.current
      assertPermission(canAddCaseContent(current, input.caseId, input.createdByUserId.trim()))
      const dup = findDuplicateLocationForCase(
        current.locations,
        input.caseId,
        input.addressText.trim(),
        input.lat,
        input.lon,
      )
      if (dup) {
        const inNotes = (input.notes ?? '').trim()
        const mergedLoc: Location = {
          ...dup,
          status: input.status,
          notes: inNotes || dup.notes,
          bounds: dup.bounds ?? input.bounds ?? null,
          addressText:
            input.addressText.trim().length > dup.addressText.trim().length ? input.addressText.trim() : dup.addressText,
          updatedAt: now,
        }
        const next: AppData = {
          ...current,
          locations: current.locations.map((l) => (l.id === dup.id ? mergedLoc : l)),
          cases: current.cases.map((c) => (c.id === input.caseId ? { ...c, updatedAt: now } : c)),
        }
        persist(next)
        return dup.id
      }
      const id = newId('loc')
      const loc: Location = {
        id,
        caseId: input.caseId,
        addressText: input.addressText.trim(),
        lat: input.lat,
        lon: input.lon,
        bounds: input.bounds ?? null,
        footprint: null,
        status: input.status,
        notes: (input.notes ?? '').trim(),
        lastVisitedAt: null,
        createdByUserId: input.createdByUserId.trim(),
        createdAt: now,
        updatedAt: now,
      }
      const next: AppData = {
        ...current,
        locations: [loc, ...current.locations],
        cases: current.cases.map((c) => (c.id === input.caseId ? { ...c, updatedAt: now } : c)),
      }
      persist(next)
      return id
    },
    [persist],
  )

  const deleteLocation = useCallback(
    async (actorUserId: string, locationId: string) => {
      const current = dataRef.current
      const loc = current.locations.find((l) => l.id === locationId)
      if (!loc) return
      assertPermission(canDeleteLocation(current, actorUserId, loc))
      const now = Date.now()
      const next: AppData = {
        ...current,
        deletedLocationIds: pushTombstone(current.deletedLocationIds, locationId),
        locations: current.locations.filter((l) => l.id !== locationId),
        trackPoints: current.trackPoints.filter((p) => p.locationId !== locationId),
        cases: loc ? current.cases.map((c) => (c.id === loc.caseId ? { ...c, updatedAt: now } : c)) : current.cases,
      }
      await persist(next)
    },
    [persist],
  )

  const createTrack = useCallback(
    async (input: { caseId: string; createdByUserId: string; label: string; kind: Track['kind'] }) => {
      const now = Date.now()
      const id = newId('track')
      const current = dataRef.current
      assertPermission(canAddCaseContent(current, input.caseId, input.createdByUserId.trim()))
      const label = input.label.trim()
      const existing = current.tracks.filter((t) => t.caseId === input.caseId)
      const routeColor = pickRouteColorForNewTrack(existing, id)

      const t: Track = {
        id,
        caseId: input.caseId,
        label: label || 'Track',
        kind: input.kind,
        routeColor,
        createdByUserId: input.createdByUserId.trim(),
        createdAt: now,
      }

      const next: AppData = {
        ...current,
        tracks: [t, ...current.tracks],
        cases: current.cases.map((c) => (c.id === input.caseId ? { ...c, updatedAt: now } : c)),
      }

      await persist(next)
      return id
    },
    [persist],
  )

  const updateTrack = useCallback(
    async (actorUserId: string, trackId: string, patch: Partial<Pick<Track, 'label' | 'kind' | 'routeColor'>>) => {
      const now = Date.now()
      const current = dataRef.current
      const existing = current.tracks.find((t) => t.id === trackId)
      if (!existing) return
      assertPermission(canEditTrack(current, actorUserId, existing))
      const caseId = existing.caseId
      const next: AppData = {
        ...current,
        tracks: current.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                ...patch,
                label: (patch.label ?? t.label).trim() || 'Track',
                routeColor: typeof patch.routeColor === 'string' ? patch.routeColor.trim().slice(0, 32) : t.routeColor ?? '',
              }
            : t,
        ),
        cases: caseId ? current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)) : current.cases,
      }
      await persist(next)
    },
    [persist],
  )

  const deleteTrack = useCallback(
    async (actorUserId: string, trackId: string) => {
      const now = Date.now()
      const current = dataRef.current
      const existing = current.tracks.find((t) => t.id === trackId)
      if (!existing) return
      assertPermission(canDeleteTrack(current, actorUserId, existing))
      const caseId = existing.caseId
      let deletedTrackPointIds = current.deletedTrackPointIds
      for (const p of current.trackPoints) {
        if (p.trackId === trackId) deletedTrackPointIds = pushTombstone(deletedTrackPointIds, p.id)
      }
      const next: AppData = {
        ...current,
        deletedTrackIds: pushTombstone(current.deletedTrackIds, trackId),
        deletedTrackPointIds,
        tracks: current.tracks.filter((t) => t.id !== trackId),
        trackPoints: current.trackPoints.filter((p) => p.trackId !== trackId),
        cases: caseId ? current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)) : current.cases,
      }
      await persist(next)
    },
    [persist],
  )

  const deleteAllTracksForCase = useCallback(
    async (actorUserId: string, caseId: string) => {
      const now = Date.now()
      const current = dataRef.current
      assertPermission(canDeleteAllTracksForCase(current, caseId, actorUserId))
      let deletedTrackIds = current.deletedTrackIds
      let deletedTrackPointIds = current.deletedTrackPointIds
      for (const t of current.tracks) {
        if (t.caseId === caseId) deletedTrackIds = pushTombstone(deletedTrackIds, t.id)
      }
      for (const p of current.trackPoints) {
        if (p.caseId === caseId) deletedTrackPointIds = pushTombstone(deletedTrackPointIds, p.id)
      }
      const next: AppData = {
        ...current,
        deletedTrackIds,
        deletedTrackPointIds,
        tracks: current.tracks.filter((t) => t.caseId !== caseId),
        trackPoints: current.trackPoints.filter((p) => p.caseId !== caseId),
        cases: current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)),
      }
      await persist(next)
    },
    [persist],
  )

  const nextTrackSequence = useCallback((current: AppData, trackId: string) => {
    let max = -1
    for (const p of current.trackPoints) {
      if (p.trackId !== trackId) continue
      max = Math.max(max, p.sequence)
    }
    return max + 1
  }, [])

  const createTrackPoint = useCallback(
    async (
      input:
        | { caseId: string; createdByUserId: string; trackId: string; locationId: string; visitedAt?: number | null }
        | {
            caseId: string
            createdByUserId: string
            trackId: string
            lat: number
            lon: number
            label?: string
            visitedAt?: number | null
          },
    ) => {
      const subjectVisitedAt = 'visitedAt' in input ? (input.visitedAt ?? null) : null
      const stamp = Date.now()
      const current = dataRef.current
      const actor = input.createdByUserId.trim()
      assertPermission(canAddCaseContent(current, input.caseId, actor))
      const sequence = nextTrackSequence(current, input.trackId)

      const id = newId('trackpt')

      if ('locationId' in input) {
        const loc = current.locations.find((l) => l.id === input.locationId && l.caseId === input.caseId)
        if (!loc) throw new Error('createTrackPoint: location not found')

        const canvassStamp = subjectVisitedAt ?? stamp

        const tp: TrackPoint = {
          id,
          caseId: input.caseId,
          trackId: input.trackId,
          locationId: input.locationId,
          addressText: loc.addressText,
          lat: loc.lat,
          lon: loc.lon,
          sequence,
          visitedAt: subjectVisitedAt,
          notes: '',
          showOnMap: true,
          displayTimeOnMap: false,
          mapTimeLabelOffsetX: 0,
          mapTimeLabelOffsetY: 0,
          createdByUserId: actor,
          createdAt: stamp,
          updatedAt: stamp,
        }

        const next: AppData = {
          ...current,
          trackPoints: [tp, ...current.trackPoints],
          locations: current.locations.map((l) =>
            l.id === input.locationId ? { ...l, lastVisitedAt: canvassStamp, updatedAt: canvassStamp } : l,
          ),
          cases: current.cases.map((c) => (c.id === input.caseId ? { ...c, updatedAt: stamp } : c)),
        }
        persist(next)
        return id
      }

      const label = input.label?.trim() || `Step ${sequence + 1}`
      const tp: TrackPoint = {
        id,
        caseId: input.caseId,
        trackId: input.trackId,
        locationId: null,
        addressText: label,
        lat: input.lat,
        lon: input.lon,
        sequence,
        visitedAt: subjectVisitedAt,
        notes: '',
        showOnMap: true,
        displayTimeOnMap: false,
        mapTimeLabelOffsetX: 0,
        mapTimeLabelOffsetY: 0,
        createdByUserId: actor,
        createdAt: stamp,
        updatedAt: stamp,
      }

      const next: AppData = {
        ...current,
        trackPoints: [tp, ...current.trackPoints],
        cases: current.cases.map((c) => (c.id === input.caseId ? { ...c, updatedAt: stamp } : c)),
      }
      persist(next)
      return id
    },
    [nextTrackSequence, persist],
  )

  const deleteTrackPoint = useCallback(
    async (actorUserId: string, pointId: string) => {
      const now = Date.now()
      const current = dataRef.current
      const pt = current.trackPoints.find((p) => p.id === pointId)
      if (!pt) return
      assertPermission(canDeleteTrackPoint(current, actorUserId, pt))
      const caseId = pt.caseId
      const trackId = pt.trackId
      const rest = current.trackPoints.filter((p) => p.id !== pointId)
      const forTrack = rest.filter((p) => p.trackId === trackId)
      const sorted = forTrack
        .slice()
        .sort(
          (a, b) =>
            a.sequence - b.sequence ||
            (a.visitedAt ?? a.createdAt) - (b.visitedAt ?? b.createdAt) ||
            a.id.localeCompare(b.id),
        )
      const idToSeq = new Map(sorted.map((p, i) => [p.id, i]))
      const trackPoints = rest.map((p) => {
        if (p.trackId !== trackId) return p
        const newSeq = idToSeq.get(p.id) ?? 0
        if (p.sequence === newSeq) return p
        return { ...p, sequence: newSeq, updatedAt: now }
      })

      const next: AppData = {
        ...current,
        deletedTrackPointIds: pushTombstone(current.deletedTrackPointIds, pointId),
        trackPoints,
        cases: current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)),
      }
      await persist(next)
    },
    [persist],
  )

  const updateTrackPoint = useCallback(
    async (
      actorUserId: string,
      pointId: string,
      patch: Partial<
        Pick<
          TrackPoint,
          | 'addressText'
          | 'lat'
          | 'lon'
          | 'visitedAt'
          | 'notes'
          | 'showOnMap'
          | 'displayTimeOnMap'
          | 'mapTimeLabelOffsetX'
          | 'mapTimeLabelOffsetY'
        >
      >,
    ) => {
      const now = Date.now()
      const current = dataRef.current
      const pt = current.trackPoints.find((p) => p.id === pointId)
      if (!pt) return
      assertPermission(canEditTrackPoint(current, actorUserId, pt))
      const caseId = pt.caseId
      const next: AppData = {
        ...current,
        trackPoints: current.trackPoints.map((p) => {
          if (p.id !== pointId) return p
          const merged: TrackPoint = { ...p, ...patch, updatedAt: now }
          if (patch.addressText !== undefined) {
            merged.addressText = patch.addressText.trim() || p.addressText
          }
          return merged
        }),
        cases: current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)),
      }
      await persist(next)
    },
    [persist],
  )

  const updateLocation = useCallback(
    async (
      actorUserId: string,
      locationId: string,
      patch: Partial<Pick<Location, 'addressText' | 'lat' | 'lon' | 'status' | 'notes' | 'lastVisitedAt' | 'footprint'>>,
    ) => {
      const now = Date.now()
      const current = dataRef.current
      const existing = current.locations.find((l) => l.id === locationId)
      if (!existing) return
      assertPermission(canEditLocation(current, actorUserId, existing))
      const caseId = existing.caseId
      const next: AppData = {
        ...current,
        locations: current.locations.map((l) =>
          l.id === locationId
            ? {
                ...l,
                ...patch,
                updatedAt: now,
              }
            : l,
        ),
        cases: caseId ? current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)) : current.cases,
      }
      await persist(next)
    },
    [persist],
  )

  const value: StoreState = useMemo(
    () => ({
      ready,
      data,
      createCase,
      deleteCase,
      updateCase,
      addCaseAttachment,
      updateCaseAttachment,
      deleteCaseAttachment,
      addCaseCollaborator,
      removeCaseCollaborator,
      createLocation,
      deleteLocation,
      createTrack,
      updateTrack,
      deleteTrack,
      deleteAllTracksForCase,
      createTrackPoint,
      deleteTrackPoint,
      updateTrackPoint,
      updateLocation,
    }),
    [
      ready,
      data,
      createCase,
      deleteCase,
      updateCase,
      addCaseAttachment,
      updateCaseAttachment,
      deleteCaseAttachment,
      addCaseCollaborator,
      removeCaseCollaborator,
      createLocation,
      deleteLocation,
      createTrack,
      updateTrack,
      deleteTrack,
      deleteAllTracksForCase,
      createTrackPoint,
      deleteTrackPoint,
      updateTrackPoint,
      updateLocation,
    ],
  )

  return <StoreCtx.Provider value={value}>{props.children}</StoreCtx.Provider>
}

export function useStore(): StoreState {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

