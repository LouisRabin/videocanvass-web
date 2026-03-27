import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, Polygon, Rectangle, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Layout } from './Layout'
import { Modal } from './Modal'
import { useStore } from '../lib/store'
import type { CanvassStatus, Location, Track, TrackPoint } from '../lib/types'
import { statusColor, statusLabel } from '../lib/types'
import { GEOCODE_SCOPE, searchPlaces, type PlaceSuggestion } from '../lib/geocode'
import { fetchBuildingFootprint, reverseGeocodeAddressText } from '../lib/building'

import L from 'leaflet'

const TRACK_COLOR_PALETTE = ['#3b82f6', '#f97316', '#a855f7', '#14b8a6', '#ef4444', '#22c55e', '#f59e0b', '#10b981'] as const

function paletteColorForTrackIndex(tracks: Track[], trackId: string): string {
  const idx = tracks.findIndex((t) => t.id === trackId)
  return TRACK_COLOR_PALETTE[Math.max(0, idx)] ?? '#111827'
}

function trackRouteColor(tracks: Track[], trackId: string): string {
  const t = tracks.find((x) => x.id === trackId)
  const c = (t?.routeColor ?? '').trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c
  if (/^#[0-9A-Fa-f]{3}$/.test(c)) {
    const h = c.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
  }
  return paletteColorForTrackIndex(tracks, trackId)
}

function sortTrackPointsStable(a: TrackPoint, b: TrackPoint): number {
  const ds = a.sequence - b.sequence
  if (ds !== 0) return ds
  const dt = (a.visitedAt ?? a.createdAt) - (b.visitedAt ?? b.createdAt)
  if (dt !== 0) return dt
  return a.id.localeCompare(b.id)
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function formatSubjectTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const MAP_LABEL_OFFSET_MAX = 800

function clampMapLabelOffset(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-MAP_LABEL_OFFSET_MAX, Math.min(MAP_LABEL_OFFSET_MAX, Math.round(n)))
}

function timeLabelTetherScreenEndpoints(
  map: {
    latLngToContainerPoint(ll: InstanceType<typeof L.LatLng>): { x: number; y: number }
    containerPointToLatLng(pt: { x: number; y: number }): { lat: number; lng: number }
  },
  pinLat: number,
  pinLon: number,
  timeMarkerLat: number,
  timeMarkerLng: number,
  _labelW: number,
  labelH: number,
): { pinX: number; pinY: number; chipX: number; chipY: number } {
  const pinAnchorPx = map.latLngToContainerPoint(L.latLng(pinLat, pinLon))
  const pinX = pinAnchorPx.x
  const pinY = pinAnchorPx.y

  const anchorPx = map.latLngToContainerPoint(L.latLng(timeMarkerLat, timeMarkerLng))
  // The label marker anchor sits at bottom-center of the chip divIcon.
  // Use the chip center for a continuously moving tether endpoint.
  const chipX = anchorPx.x
  const chipY = anchorPx.y - labelH / 2
  return { pinX, pinY, chipX, chipY }
}

function timeLabelTetherLatLngs(
  map: {
    latLngToContainerPoint(ll: InstanceType<typeof L.LatLng>): { x: number; y: number }
    containerPointToLatLng(pt: { x: number; y: number }): { lat: number; lng: number }
  },
  pinLat: number,
  pinLon: number,
  timeMarkerLat: number,
  timeMarkerLng: number,
  labelW: number,
  labelH: number,
): [[number, number], [number, number]] {
  const se = timeLabelTetherScreenEndpoints(map, pinLat, pinLon, timeMarkerLat, timeMarkerLng, labelW, labelH)
  const a = map.containerPointToLatLng(L.point(se.pinX, se.pinY))
  const b = map.containerPointToLatLng(L.point(se.chipX, se.chipY))
  return [
    [a.lat, a.lng],
    [b.lat, b.lng],
  ]
}

function colorPickerValueForTrack(tracks: Track[], t: Track): string {
  const c = (t.routeColor ?? '').trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c
  return paletteColorForTrackIndex(tracks, t.id)
}

function extendBoundsWithLocations(
  b: any,
  locs: Array<Pick<Location, 'lat' | 'lon' | 'bounds' | 'footprint'>>,
): any {
  let out = b
  for (const p of locs) {
    const lb = L.latLngBounds(locationBounds(p))
    out = out ? out.extend(lb) : lb
  }
  return out
}

function extendBoundsWithPathPoints(
  b: any,
  pts: Array<{ lat: number; lon: number }>,
): any {
  let out = b
  for (const p of pts) {
    const ll = L.latLng(p.lat, p.lon)
    out = out ? out.extend(ll) : L.latLngBounds(ll, ll)
  }
  return out
}

export function CasePage(props: { caseId: string; onBack: () => void }) {
  const {
    data,
    createLocation,
    updateLocation,
    deleteLocation,
    createTrack,
    updateTrack,
    deleteTrack,
    deleteAllTracksForCase,
    createTrackPoint,
    deleteTrackPoint,
    updateTrackPoint,
  } =
    useStore()
  const c = data.cases.find((x) => x.id === props.caseId) ?? null

  const locations = useMemo(() => data.locations.filter((l) => l.caseId === props.caseId), [data.locations, props.caseId])

  const [filters, setFilters] = useState<Record<CanvassStatus, boolean>>({
    noCameras: true,
    camerasNoAnswer: true,
    notProbativeFootage: true,
    probativeFootage: true,
  })

  const filtered = useMemo(() => locations.filter((l) => filters[l.status]), [locations, filters])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(() => (selectedId ? locations.find((l) => l.id === selectedId) ?? null : null), [locations, selectedId])

  const mapPins = useMemo(() => {
    const base = filtered.length ? filtered : locations
    if (!selectedId) return base
    const sel = locations.find((l) => l.id === selectedId)
    if (!sel) return base
    if (base.some((l) => l.id === sel.id)) return base
    return [sel, ...base]
  }, [filtered, locations, selectedId])

  const counts = useMemo(() => {
    const base: Record<CanvassStatus, number> = { noCameras: 0, camerasNoAnswer: 0, notProbativeFootage: 0, probativeFootage: 0 }
    for (const l of locations) base[l.status]++
    return base
  }, [locations])

  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')
  const [caseTab, setCaseTab] = useState<'addresses' | 'tracking'>('addresses')

  const caseTracks = useMemo(() => data.tracks.filter((t) => t.caseId === props.caseId), [data.tracks, props.caseId])
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null)
  const [autoContinuationTrackId, setAutoContinuationTrackId] = useState<string | null>(null)
  const [visibleTrackIds, setVisibleTrackIds] = useState<Record<string, boolean>>({})
  const caseTrackPoints = useMemo(() => data.trackPoints.filter((p) => p.caseId === props.caseId), [data.trackPoints, props.caseId])

  const trackForMapAdd = useMemo(() => {
    if (activeTrackId) return activeTrackId
    if (autoContinuationTrackId && caseTracks.some((t) => t.id === autoContinuationTrackId)) return autoContinuationTrackId
    return caseTracks[0]?.id ?? null
  }, [activeTrackId, autoContinuationTrackId, caseTracks])
  const [showManageTracks, setShowManageTracks] = useState(false)
  const [selectedTrackPointId, setSelectedTrackPointId] = useState<string | null>(null)

  useEffect(() => {
    if (!activeTrackId) return
    if (caseTracks.some((t) => t.id === activeTrackId)) return
    setActiveTrackId(null)
  }, [caseTracks, activeTrackId])

  useEffect(() => {
    if (!autoContinuationTrackId) return
    if (caseTracks.some((t) => t.id === autoContinuationTrackId)) return
    setAutoContinuationTrackId(caseTracks[0]?.id ?? null)
  }, [caseTracks, autoContinuationTrackId])

  useEffect(() => {
    if (activeTrackId) {
      setAutoContinuationTrackId(activeTrackId)
      return
    }
    if (!selectedTrackPointId) return
    const p = caseTrackPoints.find((x) => x.id === selectedTrackPointId)
    if (p) setAutoContinuationTrackId(p.trackId)
  }, [activeTrackId, selectedTrackPointId, caseTrackPoints])

  useEffect(() => {
    setVisibleTrackIds((prev) => {
      const next: Record<string, boolean> = { ...prev }
      for (const t of caseTracks) {
        if (next[t.id] == null) next[t.id] = true
      }
      for (const id of Object.keys(next)) {
        if (!caseTracks.some((t) => t.id === id)) delete next[id]
      }
      return next
    })
  }, [caseTracks])

  useEffect(() => {
    if (selectedId && !locations.some((l) => l.id === selectedId)) setSelectedId(null)
  }, [locations, selectedId])

  useEffect(() => {
    if (caseTab !== 'tracking') setSelectedTrackPointId(null)
  }, [caseTab])

  useEffect(() => {
    if (!selectedTrackPointId || !activeTrackId) return
    const p = caseTrackPoints.find((x) => x.id === selectedTrackPointId)
    if (!p || p.trackId !== activeTrackId) setSelectedTrackPointId(null)
  }, [activeTrackId, selectedTrackPointId, caseTrackPoints])

  // Address add UI (autocomplete)
  const [addr, setAddr] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [loadingSug, setLoadingSug] = useState(false)
  const [geoBias, setGeoBias] = useState<{ lat: number; lon: number } | null>(null)

  // Map-click create flow: user must choose a status before we create a saved location.
  const [pendingAdd, setPendingAdd] = useState<null | { lat: number; lon: number; addressText: string }>(null)
  const [pendingAddBusy, setPendingAddBusy] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBias({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      () => {},
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 5 * 60 * 1000 },
    )
  }, [])

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    const q = addr.trim()
    if (q.length < 3) {
      setSuggestions([])
      setLoadingSug(false)
      return
    }
    setLoadingSug(true)
    const t = window.setTimeout(() => {
      ;(async () => {
        const res = await searchPlaces(q, { signal: ctrl.signal, bias: geoBias ?? undefined })
        if (!alive) return
        setSuggestions(res)
        setLoadingSug(false)
      })().catch(() => {
        if (!alive) return
        setSuggestions([])
        setLoadingSug(false)
      })
    }, 280)
    return () => {
      alive = false
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [addr, geoBias])

  const defaultCenter = useMemo(() => {
    const first = mapPins[0] ?? locations[0]
    if (first) return [first.lat, first.lon] as [number, number]
    const tp = caseTrackPoints[0]
    if (tp) return [tp.lat, tp.lon] as [number, number]
    return [40.7128, -74.006] as [number, number]
  }, [mapPins, locations, caseTrackPoints])

  const trackingMapPoints = useMemo(() => {
    const pts: Array<{ lat: number; lon: number }> = []
    for (const p of caseTrackPoints) {
      if (visibleTrackIds[p.trackId] === false) continue
      if (p.showOnMap === false) continue
      pts.push({ lat: p.lat, lon: p.lon })
    }
    return pts
  }, [caseTrackPoints, visibleTrackIds])

  const selectedTrackPoint = useMemo(
    () => (selectedTrackPointId ? caseTrackPoints.find((p) => p.id === selectedTrackPointId) ?? null : null),
    [caseTrackPoints, selectedTrackPointId],
  )

  const selectedTrackPointStepIndex = useMemo(() => {
    if (!selectedTrackPoint) return 0
    const pts = caseTrackPoints
      .filter((p) => p.trackId === selectedTrackPoint.trackId)
      .slice()
      .sort(sortTrackPointsStable)
    const i = pts.findIndex((p) => p.id === selectedTrackPoint.id)
    return i >= 0 ? i + 1 : 0
  }, [selectedTrackPoint, caseTrackPoints])

  const fitMapToCanvass = useCallback(() => {
    const m = mapRef.current
    if (!m) return
    const pts = filtered.length ? filtered : locations
    if (!pts.length) return
    const b = extendBoundsWithLocations(null, pts)
    if (b && b.isValid()) m.fitBounds(b.pad(0.2))
  }, [filtered, locations])

  const fitMapToPaths = useCallback(() => {
    const m = mapRef.current
    if (!m) return
    if (!trackingMapPoints.length) return
    const b = extendBoundsWithPathPoints(null, trackingMapPoints)
    if (b && b.isValid()) m.fitBounds(b.pad(0.18))
  }, [trackingMapPoints])

  const fitMapToAll = useCallback(() => {
    const m = mapRef.current
    if (!m) return
    const locPts = filtered.length ? filtered : locations
    let b = extendBoundsWithLocations(null, locPts)
    b = extendBoundsWithPathPoints(b, trackingMapPoints)
    if (b && b.isValid()) m.fitBounds(b.pad(0.2))
  }, [filtered, locations, trackingMapPoints])

  const activeTrackPointsOrdered = useMemo(() => {
    if (!activeTrackId) return []
    return caseTrackPoints.filter((p) => p.trackId === activeTrackId).slice().sort(sortTrackPointsStable)
  }, [caseTrackPoints, activeTrackId])

  const mapRef = useRef<any>(null)
  const MapContainerAny = MapContainer as any

  const canManipulateTrackFn = useCallback(
    (trackId: string) => activeTrackId == null || activeTrackId === trackId,
    [activeTrackId],
  )
  const onSelectTrackPointMap = useCallback((id: string) => setSelectedTrackPointId(id), [])
  const onTrackPointDragEnd = useCallback(
    (pointId: string, lat: number, lon: number) => {
      void updateTrackPoint(pointId, { lat, lon })
    },
    [updateTrackPoint],
  )

  const trackingMapInteraction = useMemo(() => {
    if (caseTab !== 'tracking') return undefined
    return {
      trackPoints: caseTrackPoints,
      visibleTrackIds,
      canManipulateTrack: (tid: string) => activeTrackId == null || activeTrackId === tid,
      onPickPoint: onSelectTrackPointMap,
      onAddPoint: (lat: number, lon: number) => {
        const tid = trackForMapAdd
        if (!tid) return
        void createTrackPoint({ caseId: props.caseId, trackId: tid, lat, lon }).then((id) => {
          setSelectedTrackPointId(id)
        })
      },
      addDisabled: !trackForMapAdd,
    }
  }, [
    caseTab,
    caseTrackPoints,
    visibleTrackIds,
    activeTrackId,
    trackForMapAdd,
    props.caseId,
    createTrackPoint,
    onSelectTrackPointMap,
  ])

  const TileLayerAny = TileLayer as any
  const contentPanelHeight = '100%'
  const controlPaneWidth = 'clamp(260px, 24vw, 340px)'

  if (!c) {
    return (
      <Layout title="Case not found" right={<button onClick={props.onBack} style={btn}>Back</button>}>
        <div style={{ color: '#374151' }}>This case may have been deleted.</div>
      </Layout>
    )
  }

  return (
    <>
      <Layout
      title={c.caseNumber}
      subtitle={c.description ? c.description : undefined}
      right={
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={props.onBack} style={btn}>
            Back
          </button>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, height: '100%', paddingLeft: 12, paddingRight: 16, boxSizing: 'border-box' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: caseTab === 'tracking' ? 'minmax(0,1fr) minmax(220px, 26vw)' : selected ? 'minmax(0,1fr) minmax(240px, 28vw)' : 'minmax(0,1fr)',
            gap: 10,
            alignItems: 'start',
            minHeight: 0,
            height: '100%',
          }}
        >
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: `${controlPaneWidth} minmax(0,1fr)`, alignItems: 'stretch', minHeight: 0 }}>
            <div style={{ ...card, padding: 0, overflowY: 'auto', overflowX: 'hidden', height: contentPanelHeight }}>
              <div style={{ padding: 10, display: 'grid', gap: 8, borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button type="button" style={{ ...viewModeBtn(caseTab === 'addresses'), width: '100%' }} onClick={() => setCaseTab('addresses')}>
                    Video canvassing
                  </button>
                  <button type="button" style={{ ...viewModeBtn(caseTab === 'tracking'), width: '100%' }} onClick={() => setCaseTab('tracking')}>
                    Subject tracking
                  </button>
                </div>

                {caseTab === 'addresses' ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontWeight: 900, fontSize: 14 }}>Add address</div>
                    <input
                      value={addr}
                      onChange={(e) => setAddr(e.target.value)}
                      placeholder={GEOCODE_SCOPE === 'ny' ? 'Start typing a NY address…' : 'Start typing an address…'}
                      style={field}
                    />
                    {GEOCODE_SCOPE === 'ny' ? (
                      <div style={{ color: '#374151', fontSize: 12 }}>Autocomplete is currently scoped to New York addresses.</div>
                    ) : null}
                    {loadingSug ? <div style={{ color: '#374151', fontSize: 12 }}>Searching…</div> : null}
                    {suggestions.length ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {suggestions.map((s) => (
                          <button
                            key={`${s.lat},${s.lon},${s.label}`}
                            style={suggestionBtn}
                            onClick={() => {
                              setAddr('')
                              setSuggestions([])
                              setPendingAdd({ lat: s.lat, lon: s.lon, addressText: s.label })
                              const m = mapRef.current
                              if (m) m.flyTo([s.lat, s.lon], Math.max(m.getZoom(), 16), { duration: 0.6 })
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    ) : addr.trim().length >= 3 ? (
                      /^\d{1,4}-\d{1,4}$/.test(addr.trim()) ? (
                        <div style={{ color: '#374151', fontSize: 12 }}>Add the street name after the house number (e.g., "120-37 170 Street").</div>
                      ) : (
                        <div style={{ color: '#374151', fontSize: 12 }}>No suggestions. Try adding city/state.</div>
                      )
                    ) : null}
                  </div>
                ) : (
                  <div style={{ color: '#374151', fontSize: 13, lineHeight: 1.45 }}>
                    This uses the same map as video canvassing—buildings and subject routes stay visible together. Switch to this tab and
                    click the map (not on a building outline) to add the next numbered step; describe what happened in the prompt.
                  </div>
                )}
              </div>
              <div style={{ ...mapTopBar, flexDirection: 'column', alignItems: 'stretch' }}>
                {caseTab === 'addresses' ? (
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
                    <LegendChip
                      label={`No cameras (${counts.noCameras})`}
                      color={statusColor('noCameras')}
                      on={filters.noCameras}
                      onToggle={() => setFilters((f) => ({ ...f, noCameras: !f.noCameras }))}
                    />
                    <LegendChip
                      label={`No answer (${counts.camerasNoAnswer})`}
                      color={statusColor('camerasNoAnswer')}
                      on={filters.camerasNoAnswer}
                      onToggle={() => setFilters((f) => ({ ...f, camerasNoAnswer: !f.camerasNoAnswer }))}
                    />
                    <LegendChip
                      label={`Not probative (${counts.notProbativeFootage})`}
                      color={statusColor('notProbativeFootage')}
                      on={filters.notProbativeFootage}
                      onToggle={() => setFilters((f) => ({ ...f, notProbativeFootage: !f.notProbativeFootage }))}
                    />
                    <LegendChip
                      label={`Probative (${counts.probativeFootage})`}
                      color={statusColor('probativeFootage')}
                      on={filters.probativeFootage}
                      onToggle={() => setFilters((f) => ({ ...f, probativeFootage: !f.probativeFootage }))}
                    />
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4 }}>
                    Map shows canvass statuses and subject paths. Add steps on the map while this tab is active.
                  </div>
                )}

                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
                  {caseTab === 'addresses' ? (
                    <>
                      <button style={{ ...viewModeBtn(viewMode === 'map'), width: '100%' }} onClick={() => setViewMode('map')}>
                        Map view
                      </button>
                      <button style={{ ...viewModeBtn(viewMode === 'list'), width: '100%' }} onClick={() => setViewMode('list')}>
                        List view
                      </button>
                    </>
                  ) : null}
                  <button type="button" style={{ ...btn, width: '100%' }} onClick={() => fitMapToCanvass()} disabled={!locations.length} title="Zoom to canvass pins">
                    Fit canvass
                  </button>
                  <button type="button" style={{ ...btn, width: '100%' }} onClick={() => fitMapToPaths()} disabled={!trackingMapPoints.length} title="Zoom to visible tracks">
                    Fit paths
                  </button>
                  <button type="button" style={{ ...btn, width: '100%' }} onClick={() => fitMapToAll()} disabled={!locations.length && !trackingMapPoints.length} title="Zoom to show everything">
                    Fit all
                  </button>
                  <button
                    type="button"
                    style={{ ...btn, width: '100%' }}
                    onClick={() => {
                      if (!navigator.geolocation) return
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          const m = mapRef.current
                          if (!m) return
                          m.flyTo([pos.coords.latitude, pos.coords.longitude], Math.max(m.getZoom(), 16), { duration: 0.6 })
                        },
                        () => {},
                        { enableHighAccuracy: true, timeout: 8000 },
                      )
                    }}
                  >
                    Locate me
                  </button>
                </div>

                {caseTab === 'tracking' || caseTracks.length > 0 ? (
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', alignItems: 'stretch' }}>
                    {caseTracks.length > 0 ? (
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#374151', gridColumn: '1 / -1' }}>Active track</span>
                    ) : caseTab === 'tracking' ? (
                      <span style={{ fontSize: 12, color: '#6b7280', gridColumn: '1 / -1' }}>
                        No tracks yet — add one to plot steps.
                      </span>
                    ) : null}
                    {caseTab === 'tracking' ? (
                      <>
                        <select
                          value={activeTrackId ?? ''}
                          onChange={(e) => setActiveTrackId(e.target.value || null)}
                          style={{ ...select, minWidth: 0, width: '100%', gridColumn: '1 / -1' }}
                          disabled={!caseTracks.length}
                          title="Auto: select or drag any track's steps on the map. A named track: only that track's steps; use the map to add new steps."
                        >
                          <option value="">Auto</option>
                          {caseTracks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <button type="button" style={{ ...btn, width: '100%' }} onClick={() => setShowManageTracks(true)}>
                          Manage tracks
                        </button>
                        <button
                          type="button"
                          style={{ ...btn, width: '100%' }}
                          onClick={() => {
                            const stayAuto = activeTrackId == null
                            const nextN = caseTracks.length + 1
                            void createTrack({ caseId: props.caseId, label: `Track ${nextN}` }).then((id) => {
                              setAutoContinuationTrackId(id)
                              setVisibleTrackIds((prev) => ({ ...prev, [id]: true }))
                              if (!stayAuto) setActiveTrackId(id)
                            })
                          }}
                        >
                          + Track
                        </button>
                      </>
                    ) : null}
                    {caseTracks.map((t) => {
                      const on = visibleTrackIds[t.id] !== false
                      return (
                        <button
                          key={t.id}
                          type="button"
                          style={{ ...viewModeBtn(on), width: '100%' }}
                          onClick={() => setVisibleTrackIds((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                          title={on ? `Hide path: ${t.label}` : `Show path: ${t.label}`}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {caseTab === 'tracking' || viewMode === 'map' ? (
              <div style={{ ...card, padding: 0, overflow: 'hidden', minWidth: 0, marginRight: 12 }}>
                <div style={{ height: contentPanelHeight }}>
                  <MapContainerAny
                    center={defaultCenter}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                    ref={(m: any) => {
                      mapRef.current = m as any
                    }}
                  >
                    <TileLayerAny attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <FitCaseMapFirstLoad locations={mapPins} pathPoints={trackingMapPoints} />
                    <UnifiedMapClick
                      caseTab={caseTab}
                      locations={locations}
                      updateLocation={updateLocation}
                      onSelectLocation={(id) => setSelectedId(id)}
                      canvassAddDisabled={pendingAdd !== null}
                      onRequestCanvassAdd={(input) => {
                        setPendingAdd({ lat: input.lat, lon: input.lon, addressText: input.addressText })
                      }}
                      trackingInteraction={trackingMapInteraction}
                    />
                    <TravelPathOverlay tracks={caseTracks} trackPoints={caseTrackPoints} visibleTrackIds={visibleTrackIds} />
                    {caseTab === 'tracking' || viewMode === 'map' ? (
                      <WaypointTimeLabelLayer
                        tracks={caseTracks}
                        trackPoints={caseTrackPoints}
                        visibleTrackIds={visibleTrackIds}
                        canManipulatePoint={caseTab === 'tracking' ? canManipulateTrackFn : () => false}
                        onSelectPoint={caseTab === 'tracking' ? onSelectTrackPointMap : undefined}
                        labelDraggable={caseTab === 'tracking'}
                        onDragEndLabel={
                          caseTab === 'tracking'
                            ? (pointId, offsetX, offsetY) => {
                                void updateTrackPoint(pointId, {
                                  mapTimeLabelOffsetX: clampMapLabelOffset(offsetX),
                                  mapTimeLabelOffsetY: clampMapLabelOffset(offsetY),
                                })
                              }
                            : undefined
                        }
                      />
                    ) : null}
                    <TrackingWaypointMarkers
                      tracks={caseTracks}
                      trackPoints={caseTrackPoints}
                      visibleTrackIds={visibleTrackIds}
                      selectedPointId={caseTab === 'tracking' ? selectedTrackPointId : null}
                      canManipulatePoint={caseTab === 'tracking' ? canManipulateTrackFn : undefined}
                      onSelectPoint={caseTab === 'tracking' ? onSelectTrackPointMap : undefined}
                      draggable={caseTab === 'tracking'}
                      onDragEndPoint={caseTab === 'tracking' ? onTrackPointDragEnd : undefined}
                    />
                    {mapPins.map((l) => (
                      l.footprint && l.footprint.length >= 3 ? (
                        <Polygon
                          key={l.id}
                          positions={l.footprint}
                          pathOptions={{
                            // Use the status color outline for the selected building.
                            color: selectedId === l.id ? statusColor(l.status) : '#ffffff',
                            weight: selectedId === l.id ? 3.5 : 2,
                            fillColor: statusColor(l.status),
                            // Brighter selection for readability on grayscale tiles.
                            fillOpacity: selectedId === l.id ? 0.72 : 0.38,
                            opacity: selectedId === l.id ? 0.95 : 0.75,
                          }}
                          eventHandlers={{
                            click: (e: any) => {
                              ;(e as any)?.originalEvent?.stopPropagation?.()
                              setSelectedId(l.id)
                            },
                          }}
                        />
                      ) : (
                        <>
                          {l.bounds ? (
                            <Rectangle
                              key={l.id}
                              bounds={locationBounds(l)}
                              pathOptions={{
                            // Footprint may still be loading. Avoid the big "box pop" by
                            // rendering only a subtle outline (and no fill) until the polygon arrives.
                            color: selectedId === l.id ? statusColor(l.status) : '#ffffff',
                            weight: selectedId === l.id ? 3.5 : 1,
                            fillColor: statusColor(l.status),
                            // When footprint is still loading, avoid the "big box pop"
                            // but still show a bright selected cue.
                            fillOpacity: selectedId === l.id ? 0.35 : 0,
                            opacity: selectedId === l.id ? 0.95 : 0,
                              }}
                              eventHandlers={{
                                click: (e: any) => {
                                  ;(e as any)?.originalEvent?.stopPropagation?.()
                                  setSelectedId(l.id)
                                },
                              }}
                            />
                          ) : (
                            // While footprint is loading (new entries), render an invisible hit-target
                            // instead of showing the fallback box.
                            <Rectangle
                              key={l.id}
                              bounds={locationBounds(l)}
                              pathOptions={{
                                color: selectedId === l.id ? '#111827' : '#ffffff',
                                opacity: selectedId === l.id ? 1 : 0,
                                weight: selectedId === l.id ? 3 : 1,
                                fillColor: statusColor(l.status),
                                fillOpacity: selectedId === l.id ? 0.5 : 0,
                              }}
                              eventHandlers={{
                                click: (e: any) => {
                                  ;(e as any)?.originalEvent?.stopPropagation?.()
                                  setSelectedId(l.id)
                                },
                              }}
                            />
                          )}
                        </>
                      )
                    ))}
                  </MapContainerAny>
                </div>
              </div>
            ) : (
              <div style={{ ...card, padding: 0, overflow: 'hidden', minWidth: 0, marginRight: 12 }}>
                <div style={{ ...listHeaderRow, borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 900 }}>Locations ({filtered.length})</div>
                </div>
                {filtered.length ? (
                  <div style={{ maxHeight: contentPanelHeight, overflow: 'auto', display: 'grid' }}>
                    {filtered.map((l) => (
                      <div key={l.id} style={{ ...listRow, background: selectedId === l.id ? '#f9fafb' : 'white' }}>
                        <button style={listRowMainBtn} onClick={() => setSelectedId(l.id)}>
                          <div style={{ fontWeight: 800, textAlign: 'left' }}>{l.addressText}</div>
                          <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ ...statusBadge, background: `${statusColor(l.status)}35`, color: statusColor(l.status) }}>
                              {statusLabel(l.status)}
                            </span>
                            <span style={{ color: '#374151', fontSize: 12 }}>
                              Updated {new Date(l.updatedAt).toLocaleString()}
                            </span>
                          </div>
                        </button>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <RowStatusButton
                            label="No cameras"
                            color={statusColor('noCameras')}
                            active={l.status === 'noCameras'}
                            onClick={() => void updateLocation(l.id, { status: 'noCameras' })}
                          />
                          <RowStatusButton
                            label="No answer"
                            color={statusColor('camerasNoAnswer')}
                            active={l.status === 'camerasNoAnswer'}
                            onClick={() => void updateLocation(l.id, { status: 'camerasNoAnswer' })}
                          />
                          <RowStatusButton
                            label="Not probative"
                            color={statusColor('notProbativeFootage')}
                            active={l.status === 'notProbativeFootage'}
                            onClick={() => void updateLocation(l.id, { status: 'notProbativeFootage' })}
                          />
                          <RowStatusButton
                            label="Probative"
                            color={statusColor('probativeFootage')}
                            active={l.status === 'probativeFootage'}
                            onClick={() => void updateLocation(l.id, { status: 'probativeFootage' })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 14, color: '#374151' }}>No locations in the selected filters.</div>
                )}
              </div>
            )}
          </div>

          {caseTab === 'tracking' ? (
            selectedTrackPoint ? (
              <TrackPointDrawer
                point={selectedTrackPoint}
                stepIndex={selectedTrackPointStepIndex}
                onClose={() => setSelectedTrackPointId(null)}
                onUpdate={(patch) => void updateTrackPoint(selectedTrackPoint.id, patch)}
                onDelete={() => {
                  void deleteTrackPoint(selectedTrackPoint.id)
                  setSelectedTrackPointId(null)
                }}
              />
            ) : (
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ ...listHeaderRow, borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 900, fontSize: 13 }}>
                    {activeTrackId ? `Steps (${activeTrackPointsOrdered.length})` : 'Steps'}
                  </div>
                </div>
                <div style={{ maxHeight: contentPanelHeight, overflow: 'auto' }}>
                  {!activeTrackId ? (
                    <div style={{ padding: 12, color: '#374151', fontSize: 13, lineHeight: 1.45 }}>
                      <strong>Auto</strong> — click a step to select or drag it (even when tracks overlap; the nearest pin under your
                      click wins). Click empty map to add the next step on the same track as your last selection, or on the first
                      track if none yet. Choose a named track above to only edit that track and to see its list here.
                    </div>
                  ) : activeTrackPointsOrdered.length === 0 ? (
                    <div style={{ padding: 12, color: '#374151', fontSize: 13 }}>No steps yet—click the map to add one.</div>
                  ) : (
                    <div style={{ display: 'grid' }}>
                      {activeTrackPointsOrdered.map((p, idx) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedTrackPointId(p.id)}
                          style={{
                            ...listRowMainBtn,
                            textAlign: 'left',
                            padding: '10px 12px',
                            borderBottom: '1px solid #f3f4f6',
                            borderRadius: 0,
                            background: 'white',
                            display: 'grid',
                            gap: 4,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
                            <span style={{ fontWeight: 900, fontSize: 12, color: '#64748b' }}>Step {idx + 1}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#6b7280' }}>Edit →</span>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.25 }}>{p.addressText}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            <span>
                              {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
                            </span>
                            <span>
                              {p.visitedAt != null ? (
                                <>Subject: {formatSubjectTime(p.visitedAt)}</>
                              ) : (
                                <span style={{ opacity: 0.85 }}>No subject time</span>
                              )}
                              {p.displayTimeOnMap && p.visitedAt != null ? ' · time on map' : ''}
                            </span>
                            {p.showOnMap === false ? (
                              <span style={{ ...statusBadge, background: '#f3f4f6', color: '#6b7280' }}>Hidden on map</span>
                            ) : null}
                            {p.locationId ? <span>Linked to canvass</span> : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          ) : selected ? (
            <LocationDrawer
              location={selected}
              onClose={() => setSelectedId(null)}
              onUpdate={(patch) => void updateLocation(selected.id, patch)}
              onDelete={() => {
                void deleteLocation(selected.id)
                setSelectedId(null)
              }}
            />
          ) : null}
        </div>
      </div>
      </Layout>

    <Modal
      title="Add location"
      open={pendingAdd !== null}
      onClose={() => {
        setPendingAdd(null)
      }}
    >
      {pendingAdd ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>Selected point</div>
          <div style={{ fontWeight: 900, lineHeight: 1.2 }}>{pendingAdd.addressText}</div>
          <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>Select a category to add to the list.</div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['noCameras', 'camerasNoAnswer', 'notProbativeFootage', 'probativeFootage'] as const).map((s) => (
              <button
                key={s}
                onClick={async () => {
                  if (pendingAddBusy) return
                  const { lat, lon, addressText } = pendingAdd
                  setPendingAddBusy(true)
                  try {
                    const id = await createLocation({
                      caseId: props.caseId,
                      addressText,
                      lat,
                      lon,
                      status: s,
                    })
                    setPendingAdd(null)
                    setSelectedId(id)

                    void fetchBuildingFootprint(lat, lon)
                      .then((footprint) => {
                        if (!footprint || footprint.length < 3) return
                        void updateLocation(id, { footprint })
                      })
                      .catch(() => {})
                  } finally {
                    setPendingAddBusy(false)
                  }
                }}
                disabled={pendingAddBusy}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 999,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 12,
                  borderColor: statusColor(s),
                    background: pendingAddBusy ? 'white' : `${statusColor(s)}22`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 999, background: statusColor(s), display: 'inline-block' }} />
                {statusLabel(s)}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button style={btn} onClick={() => setPendingAdd(null)} disabled={pendingAddBusy}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      </Modal>

    <Modal
      title="Manage tracks"
      open={showManageTracks}
      onClose={() => setShowManageTracks(false)}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {caseTracks.map((t) => (
          <div
            key={t.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 130px 40px 52px auto',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <input
              value={t.label}
              onChange={(e) => void updateTrack(t.id, { label: e.target.value })}
              style={field}
            />
            <select
              value={t.kind}
              onChange={(e) => void updateTrack(t.id, { kind: e.target.value as any })}
              style={select}
            >
              <option value="person">Person (sidewalk)</option>
              <option value="vehicle">Vehicle (street)</option>
            </select>
            <input
              type="color"
              value={colorPickerValueForTrack(caseTracks, t)}
              onChange={(e) => void updateTrack(t.id, { routeColor: e.target.value })}
              title="Route color on map"
              style={{ width: 40, height: 34, padding: 0, border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer' }}
            />
            <button
              type="button"
              style={btn}
              title="Use automatic color from track order"
              onClick={() => void updateTrack(t.id, { routeColor: '' })}
            >
              Auto
            </button>
            <button
              style={btnDanger}
              onClick={() => {
                void deleteTrack(t.id).then(() => {
                  setVisibleTrackIds((prev) => {
                    const next = { ...prev }
                    delete next[t.id]
                    return next
                  })
                  if (activeTrackId === t.id) setActiveTrackId(caseTracks.find((x) => x.id !== t.id)?.id ?? null)
                })
              }}
              title="Delete track and its steps"
            >
              Delete
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            style={btnDanger}
            disabled={!caseTracks.length}
            title={caseTracks.length ? 'Remove every track and all steps for this case' : 'No tracks to remove'}
            onClick={() => {
              if (!caseTracks.length) return
              if (
                !window.confirm('Delete all tracks and every step on them for this case? This cannot be undone.')
              )
                return
              void deleteAllTracksForCase(props.caseId).then(() => {
                setActiveTrackId(null)
                setAutoContinuationTrackId(null)
                setVisibleTrackIds({})
                setSelectedTrackPointId(null)
              })
            }}
          >
            Delete all tracks
          </button>
          <button style={btn} onClick={() => setShowManageTracks(false)}>
            Close
          </button>
        </div>
      </div>
    </Modal>
    </>
  )
}

function TravelPathOverlay(props: { tracks: Track[]; trackPoints: TrackPoint[]; visibleTrackIds: Record<string, boolean> }) {
  const pointsByTrack = useMemo(() => {
    const m = new Map<string, TrackPoint[]>()
    for (const p of props.trackPoints) {
      const arr = m.get(p.trackId) ?? []
      arr.push(p)
      m.set(p.trackId, arr)
    }
    return m
  }, [props.trackPoints])

  if (!props.tracks.length) return null

  const trackBaseColor = (track: Track): string => trackRouteColor(props.tracks, track.id)

  const normalizeT = (start: number, end: number, value: number): number => {
    const denom = end - start
    if (!Number.isFinite(denom) || denom === 0) return 1
    return Math.max(0, Math.min(1, (value - start) / denom))
  }

  const mixColor = (a: string, b: string, t: number): string => {
    const parse = (hex: string) => {
      const h = hex.replace('#', '')
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
      const n = parseInt(full, 16)
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    }
    const A = parse(a)
    const B = parse(b)
    const lerp = (x: number, y: number) => Math.round(x + (y - x) * t)
    const r = lerp(A.r, B.r)
    const g = lerp(A.g, B.g)
    const bb = lerp(A.b, B.b)
    return `#${((1 << 24) + (r << 16) + (g << 8) + bb).toString(16).slice(1)}`
  }

  const turnaroundThresholdDeg = 135

  const CircleMarkerAny = CircleMarker as any
  const MarkerAny = Marker as any

  const turnMarkers: any[] = []
  const segmentNodes: any[] = []
  const arrowMarkers: any[] = []

  for (const track of props.tracks) {
    if (!props.visibleTrackIds[track.id]) continue
    const pts = (pointsByTrack.get(track.id) ?? [])
      .slice()
      .sort(sortTrackPointsStable)
      .filter((p) => p.showOnMap !== false)
    if (pts.length === 0) continue

    const base = trackBaseColor(track)
    const timeValues = pts.map((p) => p.visitedAt).filter((t): t is number => t != null)
    const useTimeGradient = timeValues.length >= 2
    const firstT = useTimeGradient ? Math.min(...timeValues) : 0
    const lastT = useTimeGradient ? Math.max(...timeValues) : 1

    // Turnaround markers: detect sharp heading reversal at interior vertices.
    for (let i = 1; i <= pts.length - 2; i++) {
      const b1 = bearingDegrees(pts[i - 1]!.lat, pts[i - 1]!.lon, pts[i]!.lat, pts[i]!.lon)
      const b2 = bearingDegrees(pts[i]!.lat, pts[i]!.lon, pts[i + 1]!.lat, pts[i + 1]!.lon)
      const delta = Math.abs(b2 - b1)
      const angleDiff = Math.min(delta, 360 - delta)
      if (angleDiff >= turnaroundThresholdDeg) {
        turnMarkers.push(
          <CircleMarkerAny
            key={`turn-${track.id}-${pts[i]!.id}`}
            center={[pts[i]!.lat, pts[i]!.lon]}
            radius={6.5}
            pathOptions={{
              color: base,
              weight: 3,
              fillColor: '#ffffff',
              fillOpacity: 0.9,
              opacity: 1,
            }}
          />,
        )
      }
    }

    // Segments along true vertex coordinates (no perpendicular offset — keeps arrow aligned with the line).
    // Color gradient by observation time when at least two steps have times; otherwise by position along route.
    for (let i = 0; i <= pts.length - 2; i++) {
      const start = pts[i]!
      const end = pts[i + 1]!
      const t = useTimeGradient
        ? normalizeT(firstT, lastT, end.visitedAt ?? firstT)
        : (i + 1) / Math.max(1, pts.length - 1)
      const faded = mixColor(base, '#ffffff', 0.65)
      const segColor = mixColor(faded, base, t)

      const bearing = bearingDegrees(start.lat, start.lon, end.lat, end.lon)
      const sPos: [number, number] = [start.lat, start.lon]
      const ePos: [number, number] = [end.lat, end.lon]

      segmentNodes.push(
        <Polyline
          key={`seg-${track.id}-${start.id}-${end.id}`}
          positions={[sPos, ePos]}
          pathOptions={{
            color: segColor,
            weight: 4,
            opacity: 0.95,
          }}
        />,
      )

      if (i === pts.length - 2) {
        // Sit the arrow along the last leg, slightly back from the vertex so it doesn't cover the pin.
        const pullBack = 0.22
        const arrLat = end.lat - pullBack * (end.lat - start.lat)
        const arrLon = end.lon - pullBack * (end.lon - start.lon)
        arrowMarkers.push(
          <MarkerAny
            key={`arr-${track.id}-${end.id}`}
            position={[arrLat, arrLon]}
            icon={travelArrowIcon(segColor, bearing)}
            interactive={false}
            zIndexOffset={7500}
          />,
        )
      }
    }
  }

  return (
    <>
      {segmentNodes}
      {arrowMarkers}
      {turnMarkers}
    </>
  )
}

function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180
  const toDeg = (x: number) => (x * 180) / Math.PI
  const dLon = toRad(lon2 - lon1)
  const y = Math.sin(dLon) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon)
  const brng = toDeg(Math.atan2(y, x))
  return (brng + 360) % 360 // 0 = north, clockwise
}

function travelArrowIcon(color: string, bearingDeg: number) {
  // Tip of the triangle sits on the last vertex; rotate around that tip (south-center of the triangle in local coords).
  const html = `<div style="width:14px;height:14px;display:flex;align-items:flex-end;justify-content:center;">
    <div style="
      transform: rotate(${bearingDeg}deg);
      transform-origin: 50% 100%;
      width: 0; height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-bottom: 11px solid ${color};
    "></div>
  </div>`
  return L.divIcon({
    className: '',
    html,
    iconSize: [14, 14],
    iconAnchor: [7, 14],
  })
}

function FitCaseMapFirstLoad(props: {
  locations: Array<Pick<Location, 'lat' | 'lon' | 'bounds' | 'footprint'>>
  pathPoints: Array<{ lat: number; lon: number }>
}) {
  const map = useMap()
  const did = useRef(false)
  useEffect(() => {
    if (did.current) return
    did.current = true
    let b = extendBoundsWithLocations(null, props.locations)
    b = extendBoundsWithPathPoints(b, props.pathPoints)
    if (!b || !b.isValid()) return
    map.fitBounds(b.pad(0.2))
  }, [map, props.locations, props.pathPoints])
  return null
}

function UnifiedMapClick(props: {
  caseTab: 'addresses' | 'tracking'
  locations: Location[]
  updateLocation: (locationId: string, patch: Partial<Pick<Location, 'footprint'>>) => Promise<void>
  onSelectLocation: (locationId: string) => void
  canvassAddDisabled?: boolean
  onRequestCanvassAdd: (input: { lat: number; lon: number; addressText: string }) => void
  trackingInteraction?: {
    trackPoints: TrackPoint[]
    visibleTrackIds: Record<string, boolean>
    canManipulateTrack: (trackId: string) => boolean
    onPickPoint: (pointId: string) => void
    onAddPoint: (lat: number, lon: number) => void
    addDisabled: boolean
    pickRadiusPx?: number
  }
}) {
  const map = useMap()
  const inFlight = useRef(false)
  useMapEvents({
    click: (e: any) => {
      if (props.caseTab === 'tracking') {
        const ti = props.trackingInteraction
        if (!ti) return
        const clickPt = map.latLngToContainerPoint(e.latlng)
        const r = ti.pickRadiusPx ?? 28
        const r2 = r * r
        let bestManip: { id: string; d2: number } | null = null
        let anyPin = false
        for (const p of ti.trackPoints) {
          if (p.showOnMap === false) continue
          if (ti.visibleTrackIds[p.trackId] === false) continue
          const lp = map.latLngToContainerPoint(L.latLng(p.lat, p.lon))
          const dx = lp.x - clickPt.x
          const dy = lp.y - clickPt.y
          const d2 = dx * dx + dy * dy
          if (d2 > r2) continue
          anyPin = true
          if (ti.canManipulateTrack(p.trackId) && (!bestManip || d2 < bestManip.d2)) bestManip = { id: p.id, d2 }
        }
        if (bestManip) {
          ti.onPickPoint(bestManip.id)
          return
        }
        if (anyPin) return
        if (ti.addDisabled) return
        ti.onAddPoint(e.latlng.lat, e.latlng.lng)
        return
      }
      if (props.canvassAddDisabled) return
      if (inFlight.current) return
      inFlight.current = true
      void (async () => {
        const lat = e.latlng.lat
        const lon = e.latlng.lng
        const addressText = await reverseGeocodeAddressText(lat, lon).catch(() => null)
        const text = addressText ?? `Lat ${lat.toFixed(5)}, Lon ${lon.toFixed(5)}`
        const match = findLocationByAddressText(props.locations, text)
        if (match) {
          props.onSelectLocation(match.id)
          if (!match.footprint || match.footprint.length < 3) {
            void fetchBuildingFootprint(match.lat, match.lon)
              .then((footprint) => {
                if (!footprint || footprint.length < 3) return
                void props.updateLocation(match.id, { footprint })
              })
              .catch(() => {})
          }
          return
        }
        props.onRequestCanvassAdd({ lat, lon, addressText: text })
      })().finally(() => {
        inFlight.current = false
      })
    },
  })
  return null
}

const TrackingPinMarkerItem = memo(function TrackingPinMarkerItem(props: {
  pointId: string
  position: [number, number]
  base: string
  stepNum: number
  ring: string
  zIndexOffset: number
  interactive: boolean
  draggable: boolean
  onSelectPoint?: (id: string) => void
  onDragEndPoint?: (id: string, lat: number, lon: number) => void
}) {
  const MarkerAny = Marker as any
  const w = 22
  const h = 24

  const htmlContent = useMemo(
    () =>
      `<div style="display:flex;align-items:center;justify-content:center"><div style="width:22px;height:22px;border-radius:999px;background:${props.base};color:#fff;font-weight:900;font-size:11px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:${props.ring},0 1px 4px rgba(0,0,0,0.25)">${props.stepNum}</div></div>`,
    [props.base, props.ring, props.stepNum],
  )

  const icon = useMemo(
    () => L.divIcon({ html: htmlContent, className: '', iconSize: [w, h], iconAnchor: [11, 12] }),
    [htmlContent],
  )

  const eventHandlers = useMemo(() => {
    const hEv: Record<string, (e: any) => void> = {}
    if (props.onSelectPoint) {
      hEv.click = (e: any) => {
        e?.originalEvent?.stopPropagation?.()
        props.onSelectPoint!(props.pointId)
      }
    }
    if (props.draggable && props.onDragEndPoint) {
      hEv.dragend = (e: any) => {
        const ll = e?.target?.getLatLng?.()
        if (!ll) return
        props.onDragEndPoint!(props.pointId, ll.lat, ll.lng)
      }
    }
    return Object.keys(hEv).length ? hEv : undefined
  }, [props.onSelectPoint, props.draggable, props.onDragEndPoint, props.pointId])

  return (
    <MarkerAny
      position={props.position}
      icon={icon}
      interactive={props.interactive}
      draggable={props.draggable}
      zIndexOffset={props.zIndexOffset}
      eventHandlers={eventHandlers}
    />
  )
})

function TrackingWaypointMarkers(props: {
  tracks: Track[]
  trackPoints: TrackPoint[]
  visibleTrackIds: Record<string, boolean>
  selectedPointId?: string | null
  canManipulatePoint?: (trackId: string) => boolean
  onSelectPoint?: (pointId: string) => void
  draggable?: boolean
  onDragEndPoint?: (pointId: string, lat: number, lon: number) => void
}) {
  const byTrack = new Map<string, TrackPoint[]>()
  for (const p of props.trackPoints) {
    if (props.visibleTrackIds[p.trackId] === false) continue
    const arr = byTrack.get(p.trackId) ?? []
    arr.push(p)
    byTrack.set(p.trackId, arr)
  }
  const nodes: ReactNode[] = []
  for (const track of props.tracks) {
    if (props.visibleTrackIds[track.id] === false) continue
    const pts = (byTrack.get(track.id) ?? []).slice().sort(sortTrackPointsStable).filter((p) => p.showOnMap !== false)
    const base = trackRouteColor(props.tracks, track.id)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!
      const n = i + 1
      const ring = props.selectedPointId === p.id ? '0 0 0 3px #111827' : '0 0 0 2px #fff'
      const canManip = !props.canManipulatePoint || props.canManipulatePoint(track.id)
      const interactive = canManip && !!(props.onSelectPoint || (props.draggable && props.onDragEndPoint))
      const draggable = !!(canManip && props.draggable && props.onDragEndPoint)
      nodes.push(
        <TrackingPinMarkerItem
          key={`wpt-${p.id}`}
          pointId={p.id}
          position={[p.lat, p.lon]}
          base={base}
          stepNum={n}
          ring={ring}
          zIndexOffset={props.selectedPointId === p.id ? 12000 : 8800 + i}
          interactive={interactive}
          draggable={draggable}
          onSelectPoint={canManip ? props.onSelectPoint : undefined}
          onDragEndPoint={canManip ? props.onDragEndPoint : undefined}
        />,
      )
    }
  }
  return <>{nodes}</>
}

const TimeLabelMarkerItem = memo(function TimeLabelMarkerItem(props: {
  pointId: string
  pinLat: number
  pinLon: number
  position: [number, number]
  base: string
  stepNum: number
  timeStr: string
  labelW: number
  labelH: number
  zIndexOffset: number
  interactive: boolean
  draggable: boolean
  onSelectPoint?: (id: string) => void
  onDragLine: (id: string, lat: number, lng: number) => void
  clearDragLine: () => void
  onDragEndLabel?: (id: string, offsetX: number, offsetY: number) => void
}) {
  const map = useMap()
  const MarkerAny = Marker as any

  const htmlContent = useMemo(() => {
    const { base, stepNum, timeStr } = props
    return `<div style="display:flex;align-items:center;gap:5px;padding:3px 8px 3px 4px;border-radius:10px;background:rgba(255,255,255,0.97);border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.14);white-space:nowrap">
  <div style="flex-shrink:0;width:18px;height:18px;border-radius:999px;background:${base};color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.2)">${stepNum}</div>
  <span style="color:#111827;font-size:10px;font-weight:800">${timeStr}</span>
</div>`
  }, [props.base, props.stepNum, props.timeStr])

  const icon = useMemo(
    () =>
      L.divIcon({
        html: htmlContent,
        className: '',
        iconSize: [props.labelW, props.labelH],
        iconAnchor: [props.labelW / 2, props.labelH],
      }),
    [htmlContent, props.labelW, props.labelH],
  )

  const eventHandlers = useMemo(() => {
    const h: Record<string, (e: any) => void> = {}
    if (props.onSelectPoint) {
      h.click = (e: any) => {
        e?.originalEvent?.stopPropagation?.()
        props.onSelectPoint!(props.pointId)
      }
    }
    if (props.draggable && props.onDragEndLabel) {
      h.drag = (e: any) => {
        const ll = e?.target?.getLatLng?.()
        if (!ll) return
        props.onDragLine(props.pointId, ll.lat, ll.lng)
      }
      h.dragend = (e: any) => {
        const ll = e?.target?.getLatLng?.()
        props.clearDragLine()
        if (!ll) return
        const ap = map.latLngToContainerPoint(L.latLng(props.pinLat, props.pinLon))
        const ep = map.latLngToContainerPoint(ll)
        props.onDragEndLabel!(props.pointId, ep.x - ap.x, ep.y - ap.y)
      }
    }
    return Object.keys(h).length ? h : undefined
  }, [
    props.onSelectPoint,
    props.draggable,
    props.onDragEndLabel,
    props.pointId,
    props.pinLat,
    props.pinLon,
    map,
    props.onDragLine,
    props.clearDragLine,
  ])

  return (
    <MarkerAny
      position={props.position}
      icon={icon}
      interactive={props.interactive}
      draggable={props.draggable}
      zIndexOffset={props.zIndexOffset}
      eventHandlers={eventHandlers}
    />
  )
})

function WaypointTimeLabelLayer(props: {
  tracks: Track[]
  trackPoints: TrackPoint[]
  visibleTrackIds: Record<string, boolean>
  canManipulatePoint?: (trackId: string) => boolean
  onSelectPoint?: (pointId: string) => void
  labelDraggable?: boolean
  onDragEndLabel?: (pointId: string, offsetX: number, offsetY: number) => void
}) {
  const map = useMap()
  const [, setMapTick] = useState(0)
  const [dragLineEnd, setDragLineEnd] = useState<null | { pointId: string; lat: number; lng: number }>(null)

  const onDragLine = useCallback((id: string, lat: number, lng: number) => {
    setDragLineEnd({ pointId: id, lat, lng })
  }, [])
  const clearDragLine = useCallback(() => setDragLineEnd(null), [])

  useMapEvents({
    zoomend: () => setMapTick((n) => n + 1),
    moveend: () => setMapTick((n) => n + 1),
  })

  const byTrack = new Map<string, TrackPoint[]>()
  for (const p of props.trackPoints) {
    if (props.visibleTrackIds[p.trackId] === false) continue
    const arr = byTrack.get(p.trackId) ?? []
    arr.push(p)
    byTrack.set(p.trackId, arr)
  }

  type LabelItem = {
    p: TrackPoint
    track: Track
    i: number
    dest: { lat: number; lng: number }
    base: string
    stepNum: number
    timeStr: string
    labelW: number
    labelH: number
    canManip: boolean
  }
  const labelItems: LabelItem[] = []
  for (const track of props.tracks) {
    if (props.visibleTrackIds[track.id] === false) continue
    const pts = (byTrack.get(track.id) ?? []).slice().sort(sortTrackPointsStable).filter((p) => p.showOnMap !== false)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!
      if (!p.displayTimeOnMap || p.visitedAt == null) continue
      const mx = p.mapTimeLabelOffsetX ?? 0
      const my = p.mapTimeLabelOffsetY ?? 0
      const anchorPx = map.latLngToContainerPoint(L.latLng(p.lat, p.lon))
      const destLl = map.containerPointToLatLng(L.point(anchorPx.x + mx, anchorPx.y + my))
      const dest = { lat: destLl.lat, lng: destLl.lng }
      const base = trackRouteColor(props.tracks, track.id)
      const canManip = !props.canManipulatePoint || props.canManipulatePoint(track.id)
      labelItems.push({
        p,
        track,
        i,
        dest,
        base,
        stepNum: i + 1,
        timeStr: escapeHtmlAttr(formatSubjectTime(p.visitedAt)),
        labelW: 132,
        labelH: 26,
        canManip,
      })
    }
  }

  const lines: ReactNode[] = labelItems.map((it) => {
    const end =
      dragLineEnd?.pointId === it.p.id
        ? dragLineEnd
        : { lat: it.dest.lat, lng: it.dest.lng }
    const [pinEnd, chipEnd] = timeLabelTetherLatLngs(map, it.p.lat, it.p.lon, end.lat, end.lng, it.labelW, it.labelH)
    return (
      <Polyline
        key={`time-conn-${it.p.id}`}
        positions={[pinEnd, chipEnd]}
        pathOptions={{
          color: it.base,
          weight: 2,
          dashArray: '5 5',
          opacity: 0.75,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        }}
      />
    )
  })

  const markers: ReactNode[] = labelItems.map((it) => {
    const { p, dest, base, stepNum, timeStr, labelW, labelH, canManip, i } = it
    const pos: [number, number] =
      dragLineEnd?.pointId === p.id ? [dragLineEnd.lat, dragLineEnd.lng] : [dest.lat, dest.lng]
    const interactive = canManip && !!(props.onSelectPoint || (props.labelDraggable && props.onDragEndLabel))
    const draggable = !!(canManip && props.labelDraggable && props.onDragEndLabel)
    return (
      <TimeLabelMarkerItem
        key={`wpt-time-${p.id}`}
        pointId={p.id}
        pinLat={p.lat}
        pinLon={p.lon}
        position={pos}
        base={base}
        stepNum={stepNum}
        timeStr={timeStr}
        labelW={labelW}
        labelH={labelH}
        zIndexOffset={7600 + i}
        interactive={interactive}
        draggable={draggable}
        onSelectPoint={props.onSelectPoint}
        onDragLine={onDragLine}
        clearDragLine={clearDragLine}
        onDragEndLabel={props.onDragEndLabel}
      />
    )
  })

  return (
    <>
      {lines}
      {markers}
    </>
  )
}

function findLocationByAddressText(locations: Location[], clickedAddressText: string): Location | null {
  const clickedKey = normalizeAddressKey(clickedAddressText)
  if (!clickedKey) return null
  for (const l of locations) {
    const key = normalizeAddressKey(l.addressText)
    if (key && key === clickedKey) return l
  }
  return null
}

function normalizeAddressKey(addressText: string): string | null {
  const raw = (addressText ?? '').trim()
  if (!raw) return null

  // Normalize to "first comma segment" (usually: `${housenumber} ${street}`)
  // Example: "160-25 150th St, Queens, New York, United States" -> "160-25 150th St"
  const first = raw.split(',')[0]?.trim() ?? ''
  if (!first) return null

  return first
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // Make sure "160 - 23" and "160-23" match.
    .replace(/\s*-\s*/g, '-')
}

function locationBounds(loc: Pick<Location, 'lat' | 'lon' | 'bounds' | 'footprint'>): any {
  if (loc.footprint && loc.footprint.length >= 3) {
    return L.latLngBounds(loc.footprint)
  }
  if (loc.bounds) {
    return [
      [loc.bounds.south, loc.bounds.west],
      [loc.bounds.north, loc.bounds.east],
    ]
  }

  // Fallback for legacy points without stored bounds.
  // Use a larger fallback so newly added locations are clickable while footprint
  // is loading (footprints are fetched async after save).
  const d = 0.0004
  return [
    [loc.lat - d, loc.lon - d],
    [loc.lat + d, loc.lon + d],
  ]
}

function LegendChip(props: { label: string; color: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={props.onToggle}
      style={{
        ...chip,
        opacity: props.on ? 1 : 0.55,
        background: props.on ? '#f9fafb' : 'transparent',
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: props.color, display: 'inline-block' }} />
      <span style={{ fontWeight: 900, fontSize: 12 }}>{props.label}</span>
    </button>
  )
}

function visitedAtToDatetimeLocalValue(ts: number | null): string {
  if (ts == null) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalValueToVisitedAt(s: string): number | null {
  if (!s.trim()) return null
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? t : null
}

function TrackPointDrawer(props: {
  point: TrackPoint
  stepIndex: number
  onClose: () => void
  onUpdate: (
    patch: Partial<
      Pick< TrackPoint, 'addressText' | 'visitedAt' | 'notes' | 'showOnMap' | 'displayTimeOnMap'>
    >,
  ) => void
  onDelete: () => void
}) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>Step {props.stepIndex}</div>
          <div style={{ marginTop: 4, fontWeight: 900, fontSize: 14 }}>Tracking point</div>
        </div>
        <button type="button" style={btn} onClick={props.onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={label}>Label</div>
        <input
          value={props.point.addressText}
          onChange={(e) => props.onUpdate({ addressText: e.target.value })}
          style={field}
        />
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={label}>Notes</div>
        <textarea
          value={props.point.notes ?? ''}
          onChange={(e) => props.onUpdate({ notes: e.target.value })}
          placeholder="What happened here?"
          style={{ ...field, minHeight: 120, resize: 'vertical' }}
        />
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={label}>Subject time at this point</div>
        <input
          type="datetime-local"
          value={visitedAtToDatetimeLocalValue(props.point.visitedAt)}
          onChange={(e) => {
            const v = datetimeLocalValueToVisitedAt(e.target.value)
            props.onUpdate(v == null ? { visitedAt: null, displayTimeOnMap: false } : { visitedAt: v })
          }}
          style={field}
        />
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
          Optional. When the subject was here per your investigation—not filled in automatically.
        </div>
      </div>

      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, cursor: 'pointer', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={props.point.displayTimeOnMap === true}
          disabled={props.point.visitedAt == null}
          onChange={(e) => props.onUpdate({ displayTimeOnMap: e.target.checked })}
        />
        <span>Show time on map next to pin {props.point.visitedAt == null ? '(set a time first)' : ''}</span>
      </label>

      {props.point.displayTimeOnMap && props.point.visitedAt != null ? (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8, lineHeight: 1.45 }}>
          Drag the time chip on the map the same way you drag steps—click and drag to reposition; it stays linked to this
          step with a dashed line.
        </div>
      ) : null}

      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, cursor: 'pointer', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={props.point.showOnMap !== false}
          onChange={(e) => props.onUpdate({ showOnMap: e.target.checked })}
        />
        <span>Show on map (path and numbered pin)</span>
      </label>

      <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
        {props.point.lat.toFixed(6)}, {props.point.lon.toFixed(6)}
        {props.point.locationId ? ' · linked to canvass address' : ''}
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" style={btnDanger} onClick={props.onDelete}>
          Delete step
        </button>
      </div>
    </div>
  )
}

function LocationDrawer(props: {
  location: Location
  onClose: () => void
  onUpdate: (patch: Partial<Pick<Location, 'status' | 'notes'>>) => void
  onDelete: () => void
}) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
        <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.2, flex: 1 }}>{props.location.addressText}</div>
        <button style={btn} onClick={props.onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StatusPill
          label="No cameras"
          color={statusColor('noCameras')}
          active={props.location.status === 'noCameras'}
          onClick={() => props.onUpdate({ status: 'noCameras' })}
        />
        <StatusPill
          label="No answer"
          color={statusColor('camerasNoAnswer')}
          active={props.location.status === 'camerasNoAnswer'}
          onClick={() => props.onUpdate({ status: 'camerasNoAnswer' })}
        />
        <StatusPill
          label="Not probative"
          color={statusColor('notProbativeFootage')}
          active={props.location.status === 'notProbativeFootage'}
          onClick={() => props.onUpdate({ status: 'notProbativeFootage' })}
        />
        <StatusPill
          label="Probative"
          color={statusColor('probativeFootage')}
          active={props.location.status === 'probativeFootage'}
          onClick={() => props.onUpdate({ status: 'probativeFootage' })}
        />
      </div>

      {(!props.location.footprint || props.location.footprint.length < 3) && (
        <div style={{ marginTop: 10, color: '#374151', fontSize: 12, fontWeight: 800 }}>
          Loading building outline…
        </div>
      )}

      <div style={{ marginTop: 10, color: statusColor(props.location.status), fontWeight: 900, fontSize: 12 }}>
        {statusLabel(props.location.status)}
      </div>

      <div style={{ marginTop: 10, color: '#374151', fontSize: 12, lineHeight: 1.4 }}>
        Subject movement paths are edited under the <strong>Subject tracking</strong> tab.
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={label}>Notes</div>
        <textarea
          value={props.location.notes}
          onChange={(e) => props.onUpdate({ notes: e.target.value })}
          placeholder="What did you observe?"
          style={{ ...field, minHeight: 120, resize: 'vertical' }}
        />
      </div>

      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        <button style={btnDanger} onClick={props.onDelete}>
          Delete address
        </button>
      </div>

      <div style={{ marginTop: 10, color: '#374151', fontSize: 12 }}>
        Updated {new Date(props.location.updatedAt).toLocaleString()}
      </div>
    </div>
  )
}

function StatusPill(props: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        ...pill,
        borderColor: props.active ? props.color : '#e5e7eb',
        background: props.active ? `${props.color}33` : 'white',
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: 999, background: props.color, display: 'inline-block' }} />
      <span style={{ fontWeight: 900, fontSize: 12 }}>{props.label}</span>
    </button>
  )
}

function RowStatusButton(props: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        ...rowStatusBtn,
        borderColor: props.active ? props.color : '#e5e7eb',
        background: props.active ? `${props.color}33` : 'white',
      }}
    >
      {props.label}
    </button>
  )
}

function viewModeBtn(active: boolean): React.CSSProperties {
  return {
    ...btn,
    borderColor: active ? '#111827' : '#e5e7eb',
    background: active ? '#111827' : 'white',
    color: active ? 'white' : '#111827',
  }
}

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 14,
  background: 'white',
}

const mapTopBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: 12,
  borderBottom: '1px solid #e5e7eb',
  background: '#ffffff',
  alignItems: 'center',
  flexWrap: 'wrap',
}

const btn: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '8px 10px',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 800,
}

const btnDanger: React.CSSProperties = {
  ...btn,
  borderColor: '#fecaca',
  background: '#fff1f2',
  color: '#9f1239',
}

const label: React.CSSProperties = {
  fontSize: 12,
  color: '#111827',
  fontWeight: 800,
  marginBottom: 6,
}

const field: React.CSSProperties = {
  width: '100%',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'white',
}

const select: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'white',
  fontWeight: 800,
}

const suggestionBtn: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '10px 12px',
  background: '#f9fafb',
  cursor: 'pointer',
  textAlign: 'left',
  fontWeight: 700,
}

const chip: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 999,
  padding: '6px 10px',
  background: 'white',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const pill: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 999,
  padding: '8px 10px',
  background: 'white',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const listHeaderRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 14px',
}

const listRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 12,
  alignItems: 'center',
  padding: '12px 14px',
  borderBottom: '1px solid #f3f4f6',
}

const listRowMainBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  textAlign: 'left',
  cursor: 'pointer',
}

const rowStatusBtn: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 999,
  padding: '6px 8px',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: 11,
}

const statusBadge: React.CSSProperties = {
  padding: '3px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
}

