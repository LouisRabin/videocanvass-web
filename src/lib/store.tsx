import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loadData, saveData } from './db'
import { newId } from './id'
import type { AddressBounds, AppData, CanvassStatus, CaseFile, Location, Track, TrackPoint } from './types'

type StoreState = {
  ready: boolean
  data: AppData
  createCase: (input: { caseName: string; description?: string }) => Promise<string>
  deleteCase: (caseId: string) => Promise<void>
  updateCase: (caseId: string, patch: Partial<Pick<CaseFile, 'caseNumber' | 'title' | 'description'>>) => Promise<void>
  createLocation: (input: {
    caseId: string
    addressText: string
    lat: number
    lon: number
    bounds?: AddressBounds | null
    status: CanvassStatus
    notes?: string
  }) => Promise<string>
  deleteLocation: (locationId: string) => Promise<void>
  createTrack: (input: { caseId: string; label: string }) => Promise<string>
  updateTrack: (trackId: string, patch: Partial<Pick<Track, 'label' | 'kind' | 'routeColor'>>) => Promise<void>
  deleteTrack: (trackId: string) => Promise<void>
  deleteAllTracksForCase: (caseId: string) => Promise<void>
  createTrackPoint: (
    input:
      | { caseId: string; trackId: string; locationId: string; visitedAt?: number | null }
      | { caseId: string; trackId: string; lat: number; lon: number; label?: string; visitedAt?: number | null },
  ) => Promise<string>
  deleteTrackPoint: (pointId: string) => Promise<void>
  updateTrackPoint: (
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
    locationId: string,
    patch: Partial<Pick<Location, 'addressText' | 'lat' | 'lon' | 'status' | 'notes' | 'lastVisitedAt' | 'footprint'>>,
  ) => Promise<void>
}

const StoreCtx = createContext<StoreState | null>(null)

export function StoreProvider(props: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<AppData>({ version: 1, cases: [], locations: [], tracks: [], trackPoints: [] })
  const dataRef = useRef<AppData>({ version: 1, cases: [], locations: [], tracks: [], trackPoints: [] })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const d = await loadData()
      if (!alive) return
      dataRef.current = d
      setData(d)
      setReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  const persist = useCallback(async (next: AppData) => {
    dataRef.current = next
    setData(next)
    await saveData(next)
  }, [])

  const createCase = useCallback(
    async (input: { caseName: string; description?: string }) => {
      const now = Date.now()
      const id = newId('case')
      const caseName = input.caseName.trim()
      const current = dataRef.current
      const c: CaseFile = {
        id,
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
    async (caseId: string) => {
      const current = dataRef.current
      const next: AppData = {
        ...current,
        cases: current.cases.filter((c) => c.id !== caseId),
        locations: current.locations.filter((l) => l.caseId !== caseId),
        tracks: current.tracks.filter((t) => t.caseId !== caseId),
        trackPoints: current.trackPoints.filter((p) => p.caseId !== caseId),
      }
      await persist(next)
    },
    [persist],
  )

  const updateCase = useCallback(
    async (caseId: string, patch: Partial<Pick<CaseFile, 'caseNumber' | 'title' | 'description'>>) => {
      const now = Date.now()
      const current = dataRef.current
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

  const createLocation = useCallback(
    async (input: {
      caseId: string
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
    async (locationId: string) => {
      const current = dataRef.current
      const loc = current.locations.find((l) => l.id === locationId)
      const now = Date.now()
      const next: AppData = {
        ...current,
        locations: current.locations.filter((l) => l.id !== locationId),
        trackPoints: current.trackPoints.filter((p) => p.locationId !== locationId),
        cases: loc ? current.cases.map((c) => (c.id === loc.caseId ? { ...c, updatedAt: now } : c)) : current.cases,
      }
      await persist(next)
    },
    [persist],
  )

  const createTrack = useCallback(
    async (input: { caseId: string; label: string }) => {
      const now = Date.now()
      const id = newId('track')
      const current = dataRef.current
      const label = input.label.trim()

      const t: Track = {
        id,
        caseId: input.caseId,
        label: label || 'Track',
        kind: 'person',
        routeColor: '',
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
    async (trackId: string, patch: Partial<Pick<Track, 'label' | 'kind' | 'routeColor'>>) => {
      const now = Date.now()
      const current = dataRef.current
      const existing = current.tracks.find((t) => t.id === trackId)
      const caseId = existing?.caseId
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
    async (trackId: string) => {
      const now = Date.now()
      const current = dataRef.current
      const existing = current.tracks.find((t) => t.id === trackId)
      const caseId = existing?.caseId
      const next: AppData = {
        ...current,
        tracks: current.tracks.filter((t) => t.id !== trackId),
        trackPoints: current.trackPoints.filter((p) => p.trackId !== trackId),
        cases: caseId ? current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)) : current.cases,
      }
      await persist(next)
    },
    [persist],
  )

  const deleteAllTracksForCase = useCallback(
    async (caseId: string) => {
      const now = Date.now()
      const current = dataRef.current
      const next: AppData = {
        ...current,
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
        | { caseId: string; trackId: string; locationId: string; visitedAt?: number | null }
        | { caseId: string; trackId: string; lat: number; lon: number; label?: string; visitedAt?: number | null },
    ) => {
      const subjectVisitedAt = 'visitedAt' in input ? (input.visitedAt ?? null) : null
      const stamp = Date.now()
      const current = dataRef.current
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
          createdAt: stamp,
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
        createdAt: stamp,
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
    async (pointId: string) => {
      const now = Date.now()
      const current = dataRef.current
      const pt = current.trackPoints.find((p) => p.id === pointId)
      if (!pt) return
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
      const trackPoints = rest.map((p) => (p.trackId !== trackId ? p : { ...p, sequence: idToSeq.get(p.id) ?? 0 }))

      const next: AppData = {
        ...current,
        trackPoints,
        cases: current.cases.map((c) => (c.id === caseId ? { ...c, updatedAt: now } : c)),
      }
      await persist(next)
    },
    [persist],
  )

  const updateTrackPoint = useCallback(
    async (
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
      const caseId = pt.caseId
      const next: AppData = {
        ...current,
        trackPoints: current.trackPoints.map((p) => {
          if (p.id !== pointId) return p
          const merged = { ...p, ...patch }
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
      locationId: string,
      patch: Partial<Pick<Location, 'addressText' | 'lat' | 'lon' | 'status' | 'notes' | 'lastVisitedAt' | 'footprint'>>,
    ) => {
      const now = Date.now()
      const current = dataRef.current
      const existing = current.locations.find((l) => l.id === locationId)
      const caseId = existing?.caseId
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

