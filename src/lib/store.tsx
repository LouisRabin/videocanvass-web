import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchRemotePayloadUpdatedAt,
  loadData,
  mergeAppData,
  normalizeAppData,
  pullAndMergeWithLocal,
  REMOTE_SYNC_POLL_MS,
  saveData,
  writeLocalDataCache,
} from './db'
import { SHARED_WORKSPACE_ID, hasSupabaseConfig, supabase } from './supabase'
import { setSyncStatus } from './syncStatus'
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
    patch: Partial<Pick<CaseFile, 'caseNumber' | 'title' | 'description'>>,
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
  })
  /** Last seen Supabase `vc_app_state.updated_at` to skip redundant full pulls. */
  const lastRemoteUpdatedAtRef = useRef<string | null>(null)
  /** Debounce full `saveData` (remote fetch + merge + upsert) after local edits — avoids one round-trip per track point tap. */
  const remotePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remotePersistChainRef = useRef(Promise.resolve())

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

  const persist = useCallback(async (next: AppData) => {
    const local = normalizeAppData(next)
    dataRef.current = local
    setData(local)
    await writeLocalDataCache(local)

    if (!hasSupabaseConfig || !supabase) return

    if (remotePersistTimerRef.current) clearTimeout(remotePersistTimerRef.current)
      remotePersistTimerRef.current = setTimeout(() => {
      remotePersistTimerRef.current = null
      remotePersistChainRef.current = remotePersistChainRef.current
        .then(async () => {
          try {
            // Snapshotted: `saveData` awaits network I/O; the user may keep editing meanwhile.
            const snapshot = dataRef.current
            const merged = await saveData(snapshot)
            const latest = dataRef.current
            const final = mergeAppData(latest, merged)
            dataRef.current = final
            setData(final)
            await writeLocalDataCache(final)
            const t = await fetchRemotePayloadUpdatedAt()
            if (t) lastRemoteUpdatedAtRef.current = t
          } catch (e) {
            console.warn('Debounced Supabase persist failed:', e)
          }
        })
        .catch((e) => console.warn('Remote persist chain:', e))
    }, 400)
  }, [])

  useEffect(() => {
    return () => {
      if (remotePersistTimerRef.current) {
        clearTimeout(remotePersistTimerRef.current)
        remotePersistTimerRef.current = null
      }
    }
  }, [])

  /** Supabase Realtime + periodic pull so multiple detectives on the same workspace see each other's changes. */
  useEffect(() => {
    if (!ready || !hasSupabaseConfig || !supabase) return
    const sb = supabase

    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const applyRemoteMerge = async (fromRealtime: boolean) => {
      if (cancelled) return
      try {
        const ts = await fetchRemotePayloadUpdatedAt()
        if (cancelled || ts == null) return
        // Realtime can fire for a new payload while `updated_at` still matches our last poll (same-ms writes);
        // skipping would leave route steps out of sync across devices.
        if (!fromRealtime && ts === lastRemoteUpdatedAtRef.current) return
        lastRemoteUpdatedAtRef.current = ts
        const cur = dataRef.current
        const merged = await pullAndMergeWithLocal(cur)
        if (cancelled || !merged) return
        const latest = dataRef.current
        const final = mergeAppData(latest, merged)
        if (JSON.stringify(final) === JSON.stringify(latest)) return
        dataRef.current = final
        setData(final)
        await writeLocalDataCache(final)
        setSyncStatus({ mode: 'supabase_ok', message: 'Updated from shared workspace' })
      } catch (e) {
        console.warn('Collaborative sync pull failed:', e)
      }
    }

    const scheduleMerge = (fromRealtime = false) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        void applyRemoteMerge(fromRealtime)
      }, 400)
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

    return () => {
      cancelled = true
      window.clearInterval(pollTimer)
      if (debounceTimer) window.clearTimeout(debounceTimer)
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
        caseNumber: caseName,
        title: caseName,
        description: (input.description ?? '').trim(),
        createdAt: now,
        updatedAt: now,
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
      patch: Partial<Pick<CaseFile, 'caseNumber' | 'title' | 'description'>>,
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
      const row: CaseAttachment = {
        id,
        caseId: input.caseId,
        kind: input.kind,
        caption: (input.caption ?? '').trim().slice(0, 200),
        imageDataUrl: url,
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
      await persist(next)
    },
    [persist],
  )

  const removeCaseCollaborator = useCallback(
    async (actorUserId: string, input: { caseId: string; collaboratorUserId: string }) => {
      const current = dataRef.current
      assertPermission(canManageCollaborators(current, input.caseId, actorUserId))
      const uid = input.collaboratorUserId.trim()
      const next: AppData = {
        ...current,
        caseCollaborators: current.caseCollaborators.filter((cc) => !(cc.caseId === input.caseId && cc.userId === uid)),
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
      const id = newId('loc')
      const current = dataRef.current
      assertPermission(canAddCaseContent(current, input.caseId, input.createdByUserId.trim()))
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
      await persist(next)
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
        updatedAt: now,
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
                updatedAt: now,
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

        await persist(next)
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

      await persist(next)
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

