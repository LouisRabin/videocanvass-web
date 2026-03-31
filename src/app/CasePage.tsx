import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import { Layout } from './Layout'
import { Modal } from './Modal'
import { AddressesMapLibre, type UnifiedCaseMapHandle } from './AddressesMapLibre'
import { useStore } from '../lib/store'
import {
  canAddCaseContent,
  canDeleteAllTracksForCase,
  canDeleteCaseAttachment,
  canDeleteLocation,
  canDeleteTrack,
  canDeleteTrackPoint,
  canEditCaseAttachment,
  canEditCaseMeta,
  canEditLocation,
  canEditTrack,
  canEditTrackPoint,
} from '../lib/casePermissions'
import { processCaseImageFile } from '../lib/caseImageUpload'
import type { AppUser, CanvassStatus, CaseAttachmentKind, LatLon, Location, Track } from '../lib/types'
import { caseAttachmentKindLabel, statusColor, statusLabel } from '../lib/types'
import { GEOCODE_SCOPE, reverseGeocodeAddressText, type PlaceSuggestion } from '../lib/geocode'
import { fetchBuildingFootprint } from '../lib/building'
import { buildResolvedTrackColorMap, TRACK_DEFAULT_COLORS_FIRST_FOUR } from '../lib/trackColors'
import { formatAppDateTime } from '../lib/timeFormat'
import { ProbativeDvrFlowModals } from './ProbativeDvrFlow'
import { CASE_DESCRIPTION_MAX_CHARS, clampCaseDescription } from '../lib/caseMeta'
import { useTargetMode } from '../lib/targetMode'

// See docs/CODEMAP.md; geocode/footprint policy in HANDOFF.md.

import {
  appendToNotes,
  casePhotoCarouselArrowStyle,
  extendBoundsWithLocations,
  extendBoundsWithPathPoints,
  findLocationByAddressText,
  findLocationHitByMapClick,
  isProvisionalCanvassLabel,
  LIST_STATUS_SORT_ORDER,
  OUTLINE_CONCURRENCY,
  type PendingAddItem,
  readStoredCaseMapFocus,
  samePendingPin,
  sortTrackPointsStable,
  writeStoredCaseMapFocus,
} from './casePageHelpers'

import {
  LegendChip,
  LocationDrawer,
  TrackPointDrawer,
  RowStatusButton,
  btn,
  btnDanger,
  btnPrimary,
  card,
  caseHeaderReadonlyDesc,
  caseHeaderReadonlyTitle,
  caseMetaInlineDescEdit,
  caseMetaInlineNameEdit,
  field,
  label,
  listHeaderRow,
  listRow,
  listRowMainBtn,
  MapPaneEdgeAnchor,
  MapPaneEdgeToggle,
  mapTopBar,
  select,
  statusBadge,
  suggestionBtn,
  viewModeBtn,
} from './case/CasePageChrome'
import { useCaseGeocodeSearch } from './case/hooks/useCaseGeocodeSearch'
import { useMapPaneOutsideDismiss } from './case/hooks/useMapPaneOutsideDismiss'
import { WebCaseWorkspace } from './case/web/WebCaseWorkspace'

/** Longer than AddressesMapLibre SINGLE_TAP_DEFER_MS (270) so open + deferred map tap don't dismiss the dock. */
const MAP_TOOLS_DOCK_OUTSIDE_GRACE_MS = 350
/** Ignore the very next map press after dismissing address search so it does not select/add. */
const ADDR_DISMISS_GRACE_MS = 360
/** Default inset below map canvas (attribution / breathing room). */
const MAP_CANVAS_BOTTOM_RESERVE = 'clamp(8px, 1.2vw, 14px)'

const listNotesPeekRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(249,250,251,0.95)',
  padding: '8px 10px',
  borderRadius: 8,
}

function CaseListSelectedLocationPanel(props: {
  location: Location
  canEdit: boolean
  canDelete: boolean
  footprintLoading: boolean
  footprintFailed: boolean
  onNotesChange: (notes: string) => void
  onRemove: () => void
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const l = props.location
  const removeBtn =
    props.canDelete ? (
      <button
        type="button"
        style={{ ...btnDanger, fontSize: 12, flexShrink: 0 }}
        onClick={() => props.onRemove()}
        aria-label="Remove address from case"
      >
        Remove
      </button>
    ) : null
  if (!notesOpen) {
    return (
      <div style={{ gridColumn: '1 / -1' }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 0',
            background: '#f9fafb',
            borderRadius: 8,
          }}
        >
          <MapPaneEdgeToggle
            expanded={false}
            placement="drawerTopSeam"
            ariaLabel="Expand notes and details"
            onClick={() => setNotesOpen(true)}
          />
        </div>
        {removeBtn ? (
          <div style={{ ...listNotesPeekRow, justifyContent: 'flex-end', marginTop: 6 }}>{removeBtn}</div>
        ) : null}
      </div>
    )
  }
  return (
    <div
      style={{
        gridColumn: '1 / -1',
        paddingTop: 12,
        marginTop: 4,
        borderTop: '1px solid #e5e7eb',
        display: 'grid',
        gap: 10,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 0',
          background: '#f9fafb',
          borderRadius: 8,
        }}
      >
        <MapPaneEdgeToggle
          expanded
          placement="drawerTopSeam"
          ariaLabel="Collapse notes and details"
          onClick={() => setNotesOpen(false)}
        />
      </div>
      {removeBtn ? (
        <div
          style={{
            ...listNotesPeekRow,
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            justifyContent: 'flex-end',
            marginTop: 6,
          }}
        >
          {removeBtn}
        </div>
      ) : null}
      {props.footprintLoading ? (
        <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>
          Loading building outline in background…
        </div>
      ) : null}
      {props.footprintFailed ? (
        <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>
          Building outline unavailable for this point (notes still save normally).
        </div>
      ) : null}
      <div>
        <div style={label}>Notes</div>
        <textarea
          value={l.notes}
          readOnly={!props.canEdit}
          onChange={(e) => props.onNotesChange(e.target.value)}
          placeholder="What did you observe?"
          style={{ ...field, minHeight: 96, resize: 'vertical', maxWidth: '100%', boxSizing: 'border-box' }}
        />
      </div>
    </div>
  )
}

/** Wide web: notes seam expanded with no map selection — no full white “dead” bar; only this sheet when opened. */
function WideMapNotesPlaceholder(props: { onDismiss: () => void }) {
  return (
    <div
      style={{
        ...card,
        position: 'relative',
        width: '100%',
        maxHeight: 'min(220px, 30svh)',
        boxSizing: 'border-box',
        padding: '14px 16px',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', right: 10, top: 10, zIndex: 2 }}>
        <button type="button" onClick={props.onDismiss} style={btn} aria-label="Close notes panel">
          ✕
        </button>
      </div>
      <div style={{ fontWeight: 900, fontSize: 'var(--vc-fs-md)', lineHeight: 1.2, paddingRight: 40 }}>
        Address notes
      </div>
      <div style={{ marginTop: 10, color: '#6b7280', fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
        Select a location on the map to view and edit notes, status, and building outline for that address.
      </div>
    </div>
  )
}

/** Wide web: tracking seam expanded with no step selected — mirrors {@link WideMapNotesPlaceholder}. */
function WideMapTrackStepPlaceholder(props: { onDismiss: () => void }) {
  return (
    <div
      style={{
        ...card,
        position: 'relative',
        width: '100%',
        maxHeight: 'min(220px, 30svh)',
        boxSizing: 'border-box',
        padding: '14px 16px',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', right: 10, top: 10, zIndex: 2 }}>
        <button type="button" onClick={props.onDismiss} style={btn} aria-label="Close step details panel">
          ✕
        </button>
      </div>
      <div style={{ fontWeight: 900, fontSize: 'var(--vc-fs-md)', lineHeight: 1.2, paddingRight: 40 }}>
        Step details
      </div>
      <div style={{ marginTop: 10, color: '#6b7280', fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
        Select a step on the map to view and edit notes, time, and label for that point.
      </div>
    </div>
  )
}

export function CasePage(props: { caseId: string; currentUser: AppUser; onBack: () => void }) {
  const {
    data,
    createLocation,
    updateLocation,
    deleteLocation,
    updateCase,
    addCaseAttachment,
    updateCaseAttachment,
    deleteCaseAttachment,
    createTrack,
    updateTrack,
    deleteTrack,
    deleteAllTracksForCase,
    createTrackPoint,
    deleteTrackPoint,
    updateTrackPoint,
  } =
    useStore()
  const actorId = props.currentUser.id
  const c = data.cases.find((x) => x.id === props.caseId) ?? null
  const canEditCaseMetaHere = useMemo(
    () => (c ? canEditCaseMeta(data, c.id, actorId) : false),
    [c, data, actorId],
  )
  const canAddCaseContentHere = useMemo(
    () => canAddCaseContent(data, props.caseId, actorId),
    [data, props.caseId, actorId],
  )
  const canDeleteAllTracksHere = useMemo(
    () => canDeleteAllTracksForCase(data, props.caseId, actorId),
    [data, props.caseId, actorId],
  )

  const caseAttachments = useMemo(() => {
    return data.caseAttachments
      .filter((a) => a.caseId === props.caseId)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [data.caseAttachments, props.caseId])

  const [addPhotoModalOpen, setAddPhotoModalOpen] = useState(false)
  const [pendingAddKind, setPendingAddKind] = useState<CaseAttachmentKind>('wanted_flyer')
  const [refPhotoBusy, setRefPhotoBusy] = useState(false)
  const [refPhotoErr, setRefPhotoErr] = useState<string | null>(null)
  const refPhotoInputRef = useRef<HTMLInputElement>(null)
  const [sidebarMediaIndex, setSidebarMediaIndex] = useState(0)
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null)
  const targetMode = useTargetMode()
  const isNarrow = targetMode === 'mobile'
  const [geoBias, setGeoBias] = useState<{ lat: number; lon: number } | null>(null)
  const [mapLeftToolDockOpen, setMapLeftToolDockOpen] = useState(false)
  const [mapLeftToolSection, setMapLeftToolSection] = useState<null | 'filters' | 'views' | 'photos' | 'tracks'>(null)
  const { clear: clearQuickMenuSearch } = useCaseGeocodeSearch('', { bias: geoBias })
  const [dvrLinkLocationSession, setDvrLinkLocationSession] = useState<null | { notesAppend: string }>(null)
  const {
    query: dvrLinkAddr,
    setQuery: setDvrLinkAddr,
    results: dvrLinkSug,
    setResults: setDvrLinkSug,
    loading: dvrLinkLoading,
  } = useCaseGeocodeSearch('', { enabled: !!dvrLinkLocationSession, bias: geoBias })
  const [dvrLinkPicked, setDvrLinkPicked] = useState<null | PlaceSuggestion>(null)
  const [dvrLinkSaving, setDvrLinkSaving] = useState(false)
  const [detailOverlayHeightPx, setDetailOverlayHeightPx] = useState(0)
  useEffect(() => {
    if (isNarrow) {
      setMapLeftToolDockOpen(false)
      setMapLeftToolSection(null)
    }
  }, [isNarrow])

  const mapToolsDockRef = useRef<HTMLDivElement>(null)
  /** Ignore outside-dismiss until this time (performance.now ms) so open + deferred map tap don't instantly close. */
  const mapToolsDockIgnoreOutsideUntilRef = useRef(0)
  const narrowMapAddressRef = useRef<HTMLDivElement>(null)
  const wideAddrSearchRef = useRef<HTMLDivElement>(null)
  const mapPaneShellRef = useRef<HTMLDivElement>(null)
  const caseMapDetailOverlayRef = useRef<HTMLDivElement>(null)
  const mapDrawerSeamToggleRef = useRef<HTMLDivElement>(null)
  const mapToolbarExpandToggleRef = useRef<HTMLDivElement>(null)
  const addrSearchInputRef = useRef<HTMLInputElement>(null)
  /** Keep latest UI flags for document/window capture handler (avoids stale `menuOpen` / `addrMapDismiss` closures). */
  const mapLeftToolDockOpenRef = useRef(false)
  const addrFieldFocusedRef = useRef(false)
  const addrAutocompleteEngagedRef = useRef(false)
  const addrDismissIgnoreUntilRef = useRef(0)
  const caseTabRef = useRef<'addresses' | 'tracking'>('addresses')
  const viewModeRef = useRef<'map' | 'list'>('map')
  const probativePlacementSessionRef = useRef<null | { trackId: string }>(null)
  const closeMapToolsDock = useCallback(() => {
    mapToolsDockIgnoreOutsideUntilRef.current = 0
    setMapLeftToolDockOpen(false)
    setMapLeftToolSection(null)
    clearQuickMenuSearch()
  }, [clearQuickMenuSearch])

  const [photoViewerCaptionDraft, setPhotoViewerCaptionDraft] = useState('')
  const [photoViewerCaptionFocused, setPhotoViewerCaptionFocused] = useState(false)
  const photoCaptionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const activePhotoViewerAttachment =
    photoViewerIndex != null ? caseAttachments[photoViewerIndex] ?? null : null

  useEffect(() => {
    if (photoViewerIndex == null) {
      setPhotoViewerCaptionDraft('')
      setPhotoViewerCaptionFocused(false)
      return
    }
    if (activePhotoViewerAttachment) {
      setPhotoViewerCaptionDraft(activePhotoViewerAttachment.caption ?? '')
    }
  }, [photoViewerIndex, activePhotoViewerAttachment?.id, activePhotoViewerAttachment?.updatedAt])

  useLayoutEffect(() => {
    const el = photoCaptionTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const cap = isNarrow ? 200 : 280
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`
  }, [photoViewerCaptionDraft, photoViewerIndex, isNarrow])

  useEffect(() => {
    if (!photoViewerCaptionFocused || !isNarrow) return
    const id = window.setTimeout(() => {
      photoCaptionTextareaRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 280)
    return () => window.clearTimeout(id)
  }, [photoViewerCaptionFocused, isNarrow])

  const onRefPhotoPick = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !c) return
      setRefPhotoErr(null)
      setRefPhotoBusy(true)
      try {
        const imageDataUrl = await processCaseImageFile(file)
        const kind = pendingAddKind
        await addCaseAttachment(actorId, {
          caseId: c.id,
          kind,
          imageDataUrl,
        })
        setAddPhotoModalOpen(false)
        setSidebarMediaIndex(0)
      } catch (err) {
        setRefPhotoErr(err instanceof Error ? err.message : 'Could not add photo')
      } finally {
        setRefPhotoBusy(false)
      }
    },
    [actorId, c, pendingAddKind, addCaseAttachment],
  )

  const attachmentCount = caseAttachments.length
  useEffect(() => {
    if (attachmentCount === 0) {
      setSidebarMediaIndex(0)
      setPhotoViewerIndex(null)
      return
    }
    setSidebarMediaIndex((i) => Math.min(Math.max(0, i), attachmentCount - 1))
    setPhotoViewerIndex((v) => (v == null ? null : Math.min(Math.max(0, v), attachmentCount - 1)))
  }, [attachmentCount])

  useEffect(() => {
    if (photoViewerIndex == null) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('textarea, input, select')) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setPhotoViewerIndex((v) => {
          if (v == null || caseAttachments.length < 2) return v
          return (v - 1 + caseAttachments.length) % caseAttachments.length
        })
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setPhotoViewerIndex((v) => {
          if (v == null || caseAttachments.length < 2) return v
          return (v + 1) % caseAttachments.length
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [photoViewerIndex, caseAttachments.length])

  /** Every canvass location in this case (all statuses). `mapPins` / list UI may be filtered; this is not. */
  const locations = useMemo(() => data.locations.filter((l) => l.caseId === props.caseId), [data.locations, props.caseId])

  const [filters, setFilters] = useState<Record<CanvassStatus, boolean>>({
    noCameras: true,
    camerasNoAnswer: true,
    notProbativeFootage: true,
    probativeFootage: true,
  })

  const filtered = useMemo(() => locations.filter((l) => filters[l.status]), [locations, filters])

  const locationsForListView = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      const ds = LIST_STATUS_SORT_ORDER[a.status] - LIST_STATUS_SORT_ORDER[b.status]
      if (ds !== 0) return ds
      return b.updatedAt - a.updatedAt
    })
  }, [filtered])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [locationDetailOpen, setLocationDetailOpen] = useState(false)
  const selected = useMemo(() => (selectedId ? locations.find((l) => l.id === selectedId) ?? null : null), [locations, selectedId])

  useEffect(() => {
    if (!selectedId) setLocationDetailOpen(false)
  }, [selectedId])

  /** Map tap: always select the location and open the notes/drawer (one click). */
  const onMapLocationPress = useCallback((id: string) => {
    setSelectedId(id)
    setLocationDetailOpen(true)
  }, [])

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

  const [workspaceMode, setWorkspaceMode] = useState<{
    caseTab: 'addresses' | 'tracking'
    viewMode: 'map' | 'list'
  }>({
    caseTab: 'addresses',
    viewMode: 'map',
  })
  const caseTab = workspaceMode.caseTab
  const viewMode = workspaceMode.viewMode
  const [webToolsCollapsed, setWebToolsCollapsed] = useState(true)

  const setWorkspaceViewMode = useCallback(
    (nextViewMode: 'map' | 'list') => {
      const resolvedView = caseTab === 'tracking' ? 'map' : nextViewMode
      setWorkspaceMode((prev) => {
        const next = prev.caseTab === 'tracking' ? { caseTab: prev.caseTab, viewMode: 'map' as const } : { ...prev, viewMode: nextViewMode }
        return prev.caseTab === next.caseTab && prev.viewMode === next.viewMode ? prev : next
      })
      if (resolvedView === 'list') {
        setLocationDetailOpen(false)
      }
      if (isNarrow && resolvedView === 'list') {
        closeMapToolsDock()
      }
    },
    [caseTab, closeMapToolsDock, isNarrow],
  )

  useEffect(() => {
    if (!isNarrow) {
      mapToolsDockIgnoreOutsideUntilRef.current = 0
      setMapLeftToolDockOpen(false)
      setWebToolsCollapsed(true)
      setMapLeftToolSection(null)
    }
  }, [isNarrow])

  const setWorkspaceCaseTab = useCallback((nextCaseTab: 'addresses' | 'tracking') => {
    setWorkspaceMode((prev) => {
      const nextViewMode = nextCaseTab === 'tracking' ? 'map' : prev.viewMode
      return prev.caseTab === nextCaseTab && prev.viewMode === nextViewMode
        ? prev
        : { caseTab: nextCaseTab, viewMode: nextViewMode }
    })
    if (nextCaseTab !== 'addresses') {
      setLocationDetailOpen(false)
    }
    if (nextCaseTab !== 'tracking') {
      setSelectedTrackPointId(null)
    }
  }, [])

  const webToolsCanCollapse = !isNarrow
  useEffect(() => {
    if (!webToolsCanCollapse && webToolsCollapsed) {
      setWebToolsCollapsed(false)
    }
  }, [webToolsCanCollapse, webToolsCollapsed])

  const [filterLegendOpen, setFilterLegendOpen] = useState(false)
  const [caseMetaEditing, setCaseMetaEditing] = useState(false)
  const [caseNameDraft, setCaseNameDraft] = useState('')
  const [caseDescDraft, setCaseDescDraft] = useState('')
  const [caseNameBaseline, setCaseNameBaseline] = useState('')
  const [caseDescBaseline, setCaseDescBaseline] = useState('')

  const beginCaseMetaEdit = useCallback(() => {
    if (!c || !canEditCaseMeta(data, c.id, actorId)) return
    const desc = clampCaseDescription(c.description ?? '')
    setCaseNameBaseline(c.caseNumber)
    setCaseDescBaseline(desc)
    setCaseNameDraft(c.caseNumber)
    setCaseDescDraft(desc)
    setCaseMetaEditing(true)
  }, [actorId, c, data])

  const discardCaseMetaEdit = useCallback(() => {
    setCaseNameDraft(caseNameBaseline)
    setCaseDescDraft(caseDescBaseline)
    setCaseMetaEditing(false)
  }, [caseNameBaseline, caseDescBaseline])

  const saveCaseMetaEdit = useCallback(() => {
    if (!c) return
    const name = caseNameDraft.trim() || caseNameBaseline
    void updateCase(actorId, c.id, {
      caseNumber: name,
      title: name,
      description: clampCaseDescription(caseDescDraft.trim()),
    })
    setCaseMetaEditing(false)
  }, [c, actorId, caseNameDraft, caseDescDraft, caseNameBaseline, updateCase])

  useEffect(() => {
    setCaseMetaEditing(false)
  }, [props.caseId])

  useEffect(() => {
    if (!canEditCaseMetaHere) setCaseMetaEditing(false)
  }, [canEditCaseMetaHere])

  const caseTracks = useMemo(() => data.tracks.filter((t) => t.caseId === props.caseId), [data.tracks, props.caseId])
  const resolvedTrackColors = useMemo(() => buildResolvedTrackColorMap(caseTracks), [caseTracks])
  const [autoContinuationTrackId, setAutoContinuationTrackId] = useState<string | null>(null)
  const [visibleTrackIds, setVisibleTrackIds] = useState<Record<string, boolean>>({})
  const caseTrackPoints = useMemo(() => data.trackPoints.filter((p) => p.caseId === props.caseId), [data.trackPoints, props.caseId])

  const trackForMapAdd = useMemo(() => {
    if (autoContinuationTrackId && caseTracks.some((t) => t.id === autoContinuationTrackId)) return autoContinuationTrackId
    return caseTracks[0]?.id ?? null
  }, [autoContinuationTrackId, caseTracks])
  const [showManageTracks, setShowManageTracks] = useState(false)
  const [showAddTrack, setShowAddTrack] = useState(false)
  const [addTrackKind, setAddTrackKind] = useState<Track['kind']>('person')
  const [addTrackLabel, setAddTrackLabel] = useState('')
  const [selectedTrackPointId, setSelectedTrackPointId] = useState<string | null>(null)
  const [trackDrawerDetailsOpen, setTrackDrawerDetailsOpen] = useState(false)
  const [addressDrawerDetailsOpen, setAddressDrawerDetailsOpen] = useState(false)
  /** While this equals the open step id, collapsed drawer shows Undo (delete) for the step just placed. */
  const [trackStepUndoTargetId, setTrackStepUndoTargetId] = useState<string | null>(null)

  useEffect(() => {
    setTrackStepUndoTargetId(null)
  }, [caseTab])

  useEffect(() => {
    if (trackStepUndoTargetId != null && selectedTrackPointId !== trackStepUndoTargetId) {
      setTrackStepUndoTargetId(null)
    }
  }, [selectedTrackPointId, trackStepUndoTargetId])

  useEffect(() => {
    setTrackDrawerDetailsOpen(false)
  }, [selectedTrackPointId])

  /** Collapse wide notes sheet when nothing is selected; keep open when switching between pins. */
  useEffect(() => {
    if (!selectedId) setAddressDrawerDetailsOpen(false)
  }, [selectedId])

  useEffect(() => {
    if (caseTab === 'addresses' && viewMode === 'list') setAddressDrawerDetailsOpen(false)
  }, [caseTab, viewMode])

  const onTrackStepLongPress = useCallback((pointId: string) => {
    if (!window.confirm('Open Subject tracking for this step?')) return
    setWorkspaceCaseTab('tracking')
    setSelectedTrackPointId(pointId)
  }, [setWorkspaceCaseTab])

  const onCanvassLocationLongPress = useCallback((locationId: string) => {
    if (!window.confirm('Open Video canvassing for this address?')) return
    setWorkspaceCaseTab('addresses')
    setSelectedId(locationId)
    setLocationDetailOpen(true)
    setSelectedTrackPointId(null)
  }, [setWorkspaceCaseTab])

  useEffect(() => {
    if (!autoContinuationTrackId) return
    if (caseTracks.some((t) => t.id === autoContinuationTrackId)) return
    setAutoContinuationTrackId(caseTracks[0]?.id ?? null)
  }, [caseTracks, autoContinuationTrackId])

  useEffect(() => {
    if (!selectedTrackPointId) return
    const p = caseTrackPoints.find((x) => x.id === selectedTrackPointId)
    if (p) setAutoContinuationTrackId(p.trackId)
  }, [selectedTrackPointId, caseTrackPoints])

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

  const resumeMapFocus = useMemo(() => {
    const s = readStoredCaseMapFocus(props.caseId)
    if (!s) return null
    if (s.kind === 'location') {
      const loc = locations.find((l) => l.id === s.id)
      return loc ? { lat: loc.lat, lon: loc.lon } : null
    }
    const pt = caseTrackPoints.find((p) => p.id === s.id)
    return pt ? { lat: pt.lat, lon: pt.lon } : null
  }, [props.caseId, locations, caseTrackPoints])

  useEffect(() => {
    if (selectedTrackPointId) {
      writeStoredCaseMapFocus(props.caseId, 'trackPoint', selectedTrackPointId)
      return
    }
    if (selectedId) {
      writeStoredCaseMapFocus(props.caseId, 'location', selectedId)
    }
  }, [props.caseId, selectedId, selectedTrackPointId])

  // Address add UI (autocomplete)
  const {
    query: addr,
    setQuery: setAddr,
    results: suggestions,
    setResults: setSuggestions,
    loading: loadingSug,
    setLoading: setLoadingSug,
  } = useCaseGeocodeSearch('', { bias: geoBias })
  const [addrFieldFocused, setAddrFieldFocused] = useState(false)
  const addrBlurClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearAddrFieldFocusSoon = useCallback(() => {
    if (addrBlurClearRef.current) clearTimeout(addrBlurClearRef.current)
    addrBlurClearRef.current = window.setTimeout(() => {
      addrBlurClearRef.current = null
      setAddrFieldFocused(false)
    }, 180)
  }, [])
  const addrAutocompleteEngaged = addrFieldFocused || loadingSug || suggestions.length > 0
  const suppressCanvassMapAdd = caseTab === 'addresses' && addrAutocompleteEngaged
  const dismissAddressSearch = useCallback(() => {
    setAddrFieldFocused(false)
    setSuggestions([])
    setLoadingSug(false)
    addrSearchInputRef.current?.blur()
  }, [setSuggestions, setLoadingSug])

  useEffect(() => {
    return () => {
      if (addrBlurClearRef.current) clearTimeout(addrBlurClearRef.current)
    }
  }, [])

  // Map-click create flow: user must choose a status before we create a saved location.
  const [pendingAddQueue, setPendingAddQueue] = useState<PendingAddItem[]>([])
  const pendingAdd: PendingAddItem | null = pendingAddQueue[0] ?? null
  const [addLocationSaving, setAddLocationSaving] = useState(false)
  const addCategoryInFlightRef = useRef(false)

  type ProbativeFlowTarget =
    | { kind: 'existing'; locationId: string }
    | { kind: 'new'; pending: PendingAddItem }
    | { kind: 'dvr_only' }
  const [probativeFlow, setProbativeFlow] = useState<null | { step: 'accuracy' | 'calc'; target: ProbativeFlowTarget }>(null)
  const probativeFlowRef = useRef(probativeFlow)
  probativeFlowRef.current = probativeFlow

  type PostProbativeMarkerPhase = null | 'ask'
  const [postProbativeMarkerPhase, setPostProbativeMarkerPhase] = useState<PostProbativeMarkerPhase>(null)
  const [postProbativePickTrackId, setPostProbativePickTrackId] = useState('')
  const [probativePlacementSession, setProbativePlacementSession] = useState<null | { trackId: string }>(null)
  /** Blocks duplicate map taps before React re-renders after probative single-shot placement. */
  const probativePlacementLockRef = useRef(false)

  const postProbativeEffectiveTrackId = useMemo(() => {
    if (postProbativeMarkerPhase !== 'ask' || !caseTracks.length) return ''
    if (postProbativePickTrackId && caseTracks.some((t) => t.id === postProbativePickTrackId)) {
      return postProbativePickTrackId
    }
    return (
      autoContinuationTrackId && caseTracks.some((t) => t.id === autoContinuationTrackId)
        ? autoContinuationTrackId
        : caseTracks[0]!.id
    )
  }, [postProbativeMarkerPhase, caseTracks, postProbativePickTrackId, autoContinuationTrackId])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && probativePlacementSession) {
        e.preventDefault()
        probativePlacementLockRef.current = false
        setProbativePlacementSession(null)
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return
      }
      if (caseMetaEditing) return
      if (pendingAddQueue.length > 0 || showAddTrack || showManageTracks) return
      if (probativeFlow != null) return
      if (postProbativeMarkerPhase != null) return

      if (caseTab === 'tracking' && selectedTrackPointId) {
        const pt = caseTrackPoints.find((p) => p.id === selectedTrackPointId)
        if (!pt || !canDeleteTrackPoint(data, actorId, pt)) return
        e.preventDefault()
        void deleteTrackPoint(actorId, selectedTrackPointId)
        setSelectedTrackPointId(null)
        return
      }

      if (caseTab === 'addresses' && selectedId) {
        const loc = locations.find((l) => l.id === selectedId)
        if (!loc || !canDeleteLocation(data, actorId, loc)) return
        e.preventDefault()
        if (!window.confirm('Delete this address from the case? This cannot be undone.')) return
        setProbativeFlow(null)
        void deleteLocation(actorId, selectedId)
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    actorId,
    caseMetaEditing,
    caseTab,
    caseTrackPoints,
    data,
    deleteLocation,
    deleteTrackPoint,
    locations,
    pendingAddQueue.length,
    probativeFlow,
    selectedId,
    selectedTrackPointId,
    showAddTrack,
    showManageTracks,
    postProbativeMarkerPhase,
    probativePlacementSession,
  ])

  const openAddLocationModal = useCallback(
    (payload: {
      lat: number
      lon: number
      addressText: string
      bounds?: Location['bounds'] | null
      vectorTileBuildingRing?: LatLon[] | null
    }) => {
      addCategoryInFlightRef.current = false
      setAddLocationSaving(false)
      setPendingAddQueue((q) => {
        if (q.some((x) => samePendingPin(x, payload))) return q
        const item: PendingAddItem = {
          lat: payload.lat,
          lon: payload.lon,
          addressText: payload.addressText,
          bounds: payload.bounds ?? undefined,
          vectorTileBuildingRing: payload.vectorTileBuildingRing,
        }
        return [...q, item]
      })
    },
    [],
  )
  const closeAddLocationModal = useCallback(() => {
    addCategoryInFlightRef.current = false
    setAddLocationSaving(false)
    setPendingAddQueue((q) => q.slice(1))
  }, [])
  const [footprintLoadingIds, setFootprintLoadingIds] = useState<Set<string>>(new Set())
  const [footprintFailedIds, setFootprintFailedIds] = useState<Set<string>>(new Set())
  const [outlineQueue, setOutlineQueue] = useState<
    Array<{ id: string; lat: number; lon: number; addressText?: string; vectorTileBuildingRing?: LatLon[] }>
  >([])
  const outlineQueuedRef = useRef<Set<string>>(new Set())
  const outlineDoneRef = useRef<Set<string>>(new Set())
  const outlineInFlightRef = useRef<Set<string>>(new Set())
  const locationsRef = useRef(locations)
  locationsRef.current = locations

  /** One in-flight reverse lookup per map coordinate so the add modal can fill in street text while you keep working. */
  const pendingQueueGeoKeysRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const item of pendingAddQueue) {
      if (!isProvisionalCanvassLabel(item.addressText)) continue
      const key = `${item.lat.toFixed(6)},${item.lon.toFixed(6)}`
      if (pendingQueueGeoKeysRef.current.has(key)) continue
      pendingQueueGeoKeysRef.current.add(key)
      const lat = item.lat
      const lon = item.lon
      void (async () => {
        try {
          const resolved = await reverseGeocodeAddressText(lat, lon).catch(() => null)
          if (!resolved?.trim() || isProvisionalCanvassLabel(resolved)) return
          setPendingAddQueue((q) => {
            const i = q.findIndex((x) => samePendingPin(x, { lat, lon }))
            if (i < 0) return q
            if (!isProvisionalCanvassLabel(q[i]!.addressText)) return q
            const next = q.slice()
            next[i] = { ...next[i]!, addressText: resolved.trim() }
            return next
          })
        } finally {
          pendingQueueGeoKeysRef.current.delete(key)
        }
      })()
    }
  }, [pendingAddQueue])

  /** Saved pins that still have a coordinate-only label get a street line without blocking the outline pipeline. */
  const savedProvisionalGeoIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const loc of locations) {
      if (loc.caseId !== props.caseId) continue
      if (!isProvisionalCanvassLabel(loc.addressText)) continue
      if (savedProvisionalGeoIdsRef.current.has(loc.id)) continue
      savedProvisionalGeoIdsRef.current.add(loc.id)
      const id = loc.id
      const lat = loc.lat
      const lon = loc.lon
      void (async () => {
        try {
          const resolved = await reverseGeocodeAddressText(lat, lon).catch(() => null)
          if (!resolved?.trim() || isProvisionalCanvassLabel(resolved)) return
          const still = locationsRef.current.find((l) => l.id === id)
          if (!still || !isProvisionalCanvassLabel(still.addressText)) return
          void updateLocation(actorId, id, { addressText: resolved.trim() })
        } finally {
          savedProvisionalGeoIdsRef.current.delete(id)
        }
      })()
    }
  }, [locations, props.caseId, updateLocation])

  const enqueueOutlineForLocation = useCallback(
    (locationId: string, lat: number, lon: number, addressText?: string | null, vectorTileBuildingRing?: LatLon[] | null) => {
      if (outlineDoneRef.current.has(locationId)) {
        return
      }
      if (outlineInFlightRef.current.has(locationId)) {
        return
      }
      if (outlineQueuedRef.current.has(locationId)) {
        return
      }
      outlineQueuedRef.current.add(locationId)
      const hint = addressText?.trim() || undefined
      const vr =
        vectorTileBuildingRing && vectorTileBuildingRing.length >= 3 ? vectorTileBuildingRing : undefined
      setOutlineQueue((prev) => [...prev, { id: locationId, lat, lon, addressText: hint, vectorTileBuildingRing: vr }])
      setFootprintLoadingIds((prev) => {
        const next = new Set(prev)
        next.add(locationId)
        return next
      })
      // A new attempt should clear a previous failed flag.
      setFootprintFailedIds((prev) => {
        const next = new Set(prev)
        next.delete(locationId)
        return next
      })
    },
    [],
  )

  const completePendingLocation = useCallback(
    async (snapshot: PendingAddItem, status: CanvassStatus, notes?: string) => {
      if (addCategoryInFlightRef.current) return
      addCategoryInFlightRef.current = true
      const { lat, lon, bounds, vectorTileBuildingRing } = snapshot
      const { addressText } = snapshot
      setAddLocationSaving(true)
      try {
        const id = await createLocation({
          caseId: props.caseId,
          createdByUserId: actorId,
          addressText,
          lat,
          lon,
          bounds: bounds ?? null,
          status,
          notes: (notes ?? '').trim(),
        })
        closeAddLocationModal()
        setLocationDetailOpen(false)
        setSelectedId(id)
        enqueueOutlineForLocation(id, lat, lon, addressText, vectorTileBuildingRing ?? null)

        if (isProvisionalCanvassLabel(addressText)) {
          const lat0 = lat
          const lon0 = lon
          void (async () => {
            const signal =
              typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
                ? AbortSignal.timeout(12_000)
                : undefined
            const resolved = await reverseGeocodeAddressText(lat0, lon0, signal).catch(() => null)
            if (resolved?.trim() && !isProvisionalCanvassLabel(resolved)) {
              void updateLocation(actorId, id, { addressText: resolved.trim() })
            }
          })()
        }
      } finally {
        setAddLocationSaving(false)
        addCategoryInFlightRef.current = false
      }
    },
    [actorId, closeAddLocationModal, createLocation, enqueueOutlineForLocation, props.caseId, updateLocation],
  )

  const handleProbativeAccurate = useCallback(() => {
    const f = probativeFlowRef.current
    if (!f || f.target.kind === 'dvr_only') return
    const t = f.target
    setProbativeFlow(null)
    setPostProbativeMarkerPhase('ask')
    if (t.kind === 'existing') {
      void updateLocation(actorId, t.locationId, { status: 'probativeFootage' })
    } else {
      void completePendingLocation(t.pending, 'probativeFootage')
    }
  }, [completePendingLocation, updateLocation])

  const handleProbativeNotAccurate = useCallback(() => {
    setProbativeFlow((pf) => (pf && pf.step === 'accuracy' ? { ...pf, step: 'calc' } : pf))
  }, [])

  const handleProbativeCalcBack = useCallback(() => {
    setProbativeFlow((pf) => {
      if (!pf) return pf
      if (pf.target.kind === 'dvr_only') return null
      return pf.step === 'calc' ? { ...pf, step: 'accuracy' } : pf
    })
  }, [])

  const handleProbativeFlowDismiss = useCallback(() => setProbativeFlow(null), [])

  useEffect(() => {
    setProbativeFlow((pf) => {
      if (!pf) return pf
      if (pf.target.kind === 'new' || pf.target.kind === 'dvr_only') return pf
      // Clear when the user selects a different location; keep when selection is cleared (list / after drawer close).
      if (selectedId != null && selectedId !== pf.target.locationId) return null
      return pf
    })
  }, [selectedId])

  const handleProbativeCalcApply = useCallback(
    (notesAppend: string) => {
      const f = probativeFlowRef.current
      if (!f) return
      if (f.target.kind === 'dvr_only') {
        setProbativeFlow(null)
        setDvrLinkPicked(null)
        setDvrLinkAddr('')
        setDvrLinkSug([])
        setDvrLinkSaving(false)
        setDvrLinkLocationSession({ notesAppend })
        return
      }
      const t = f.target
      setProbativeFlow(null)
      setPostProbativeMarkerPhase('ask')
      if (t.kind === 'existing') {
        const loc = data.locations.find((l) => l.id === t.locationId)
        void updateLocation(actorId, t.locationId, {
          status: 'probativeFootage',
          notes: appendToNotes(loc?.notes ?? '', notesAppend),
        })
      } else {
        void completePendingLocation(t.pending, 'probativeFootage', notesAppend)
      }
    },
    [completePendingLocation, data.locations, updateLocation],
  )

  useEffect(() => {
    const available = OUTLINE_CONCURRENCY - outlineInFlightRef.current.size
    if (available <= 0) return
    if (!outlineQueue.length) return
    const toStart = outlineQueue.slice(0, available)
    if (!toStart.length) return
    setOutlineQueue((prev) => prev.slice(toStart.length))

    for (const nextItem of toStart) {
      outlineInFlightRef.current.add(nextItem.id)

      let vectorRing = nextItem.vectorTileBuildingRing
      if ((!vectorRing || vectorRing.length < 3) && vectorRingLookupRef.current) {
        const fromMap = vectorRingLookupRef.current(nextItem.lat, nextItem.lon)
        if (fromMap && fromMap.length >= 3) vectorRing = fromMap
      }

      void fetchBuildingFootprint(nextItem.lat, nextItem.lon, undefined, {
        addressText: nextItem.addressText,
        vectorTileBuildingRing: vectorRing,
      })
        .then(async (footprint) => {
          if (!footprint || footprint.length < 3) {
            setFootprintFailedIds((prev) => {
              const next = new Set(prev)
              next.add(nextItem.id)
              return next
            })
            return
          }
          if (!outlineDoneRef.current.has(nextItem.id)) {
            outlineDoneRef.current.add(nextItem.id)
          }
          setFootprintFailedIds((prev) => {
            const next = new Set(prev)
            next.delete(nextItem.id)
            return next
          })
          try {
            await updateLocation(actorId, nextItem.id, { footprint })
          } catch {
            setFootprintFailedIds((prev) => {
              const next = new Set(prev)
              next.add(nextItem.id)
              return next
            })
            outlineDoneRef.current.delete(nextItem.id)
          }
        })
        .catch(() => {
          setFootprintFailedIds((prev) => {
            const next = new Set(prev)
            next.add(nextItem.id)
            return next
          })
        })
        .finally(() => {
          outlineInFlightRef.current.delete(nextItem.id)
          outlineQueuedRef.current.delete(nextItem.id)
          setFootprintLoadingIds((prev) => {
            const next = new Set(prev)
            next.delete(nextItem.id)
            return next
          })
        })
    }
  }, [outlineQueue, footprintLoadingIds, updateLocation])

  useEffect(() => {
    if (!selectedId) return
    const loc = locationsRef.current.find((l) => l.id === selectedId)
    if (!loc) return
    if (outlineDoneRef.current.has(loc.id)) return
    if (loc.footprint && loc.footprint.length >= 3) return
    enqueueOutlineForLocation(loc.id, loc.lat, loc.lon, loc.addressText)
  }, [selectedId, enqueueOutlineForLocation])

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

  const selectedTrackLabel = useMemo(() => {
    if (!selectedTrackPoint) return ''
    return caseTracks.find((t) => t.id === selectedTrackPoint.trackId)?.label ?? 'Track'
  }, [selectedTrackPoint, caseTracks])

  useLayoutEffect(() => {
    const el = caseMapDetailOverlayRef.current
    if (!el) {
      setDetailOverlayHeightPx(0)
      return
    }
    const measure = () => setDetailOverlayHeightPx(el.offsetHeight || 0)
    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [
    caseTab,
    selectedId,
    selectedTrackPointId,
    locationDetailOpen,
    viewMode,
    isNarrow,
    addressDrawerDetailsOpen,
    trackDrawerDetailsOpen,
  ])

  const mapRef = useRef<UnifiedCaseMapHandle | null>(null)

  const clearDvrLinkLocationUi = useCallback(() => {
    setDvrLinkLocationSession(null)
    setDvrLinkAddr('')
    setDvrLinkSug([])
    setDvrLinkPicked(null)
    setDvrLinkSaving(false)
  }, [])

  const submitDvrLinkLocation = useCallback(
    async (probativePick: boolean) => {
      if (!dvrLinkLocationSession || !dvrLinkPicked) return
      const s = dvrLinkPicked
      const status: CanvassStatus = probativePick ? 'probativeFootage' : 'notProbativeFootage'
      const canvassLine = probativePick
        ? `[Canvass — DVR link] Probative. ${s.label}`
        : `[Canvass — DVR link] Not probative. ${s.label}`
      const mergedNotes = appendToNotes(dvrLinkLocationSession.notesAppend, canvassLine)
      const existing = findLocationByAddressText(locations, s.label)

      setDvrLinkSaving(true)
      try {
        if (existing) {
          if (!canEditLocation(data, actorId, existing)) return
          await updateLocation(actorId, existing.id, {
            status,
            notes: appendToNotes(existing.notes ?? '', mergedNotes),
          })
          clearDvrLinkLocationUi()
          setSelectedId(existing.id)
          setWorkspaceCaseTab('addresses')
          setWorkspaceViewMode('map')
          setLocationDetailOpen(true)
          enqueueOutlineForLocation(existing.id, s.lat, s.lon, s.label, null)
          closeMapToolsDock()
          window.setTimeout(() => {
            const m = mapRef.current
            if (m) m.flyTo(s.lat, s.lon, Math.max(m.getZoom(), 16), { duration: 0.6 })
          }, 0)
          return
        }
        if (!canAddCaseContentHere) return
        const id = await createLocation({
          caseId: props.caseId,
          createdByUserId: actorId,
          addressText: s.label,
          lat: s.lat,
          lon: s.lon,
          bounds: s.bounds ?? null,
          status,
          notes: mergedNotes,
        })
        clearDvrLinkLocationUi()
        setSelectedId(id)
        setWorkspaceCaseTab('addresses')
        setWorkspaceViewMode('map')
        setLocationDetailOpen(true)
        enqueueOutlineForLocation(id, s.lat, s.lon, s.label, null)
        closeMapToolsDock()
        window.setTimeout(() => {
          const m = mapRef.current
          if (m) m.flyTo(s.lat, s.lon, Math.max(m.getZoom(), 16), { duration: 0.6 })
        }, 0)
      } catch {
        /* Store reports failures elsewhere */
      } finally {
        setDvrLinkSaving(false)
      }
    },
    [
      actorId,
      canAddCaseContentHere,
      clearDvrLinkLocationUi,
      closeMapToolsDock,
      createLocation,
      data,
      dvrLinkLocationSession,
      dvrLinkPicked,
      enqueueOutlineForLocation,
      locations,
      props.caseId,
      updateLocation,
    ],
  )

  mapLeftToolDockOpenRef.current = mapLeftToolDockOpen
  addrFieldFocusedRef.current = addrFieldFocused
  addrAutocompleteEngagedRef.current = addrAutocompleteEngaged
  caseTabRef.current = caseTab
  viewModeRef.current = viewMode
  probativePlacementSessionRef.current = probativePlacementSession

  const mapPaneShowsNow = useCallback(() => {
    const c = caseTabRef.current
    const v = viewModeRef.current
    const p = probativePlacementSessionRef.current
    return (c === 'tracking' || v === 'map') && !p
  }, [])

  useMapPaneOutsideDismiss({
    mapPaneShowsNow,
    mapToolsDockRef,
    caseMapDetailOverlayRef,
    mapDrawerSeamToggleRef,
    mapToolbarExpandToggleRef,
    wideAddrSearchRef,
    narrowMapAddressRef,
    mapPaneShellRef,
    addrSearchInputRef,
    mapLeftToolDockOpenRef,
    probativePlacementSessionRef,
    addrAutocompleteEngagedRef,
    mapToolsDockIgnoreOutsideUntilRef,
    addrDismissIgnoreUntilRef,
    addrBlurClearRef,
    mapClearPendingTap: () => mapRef.current?.clearPendingMapTap(),
    closeMapToolsDock,
    onDismissAddress: dismissAddressSearch,
    addrDismissGraceMs: ADDR_DISMISS_GRACE_MS,
  })

  /** MapLibre only: query Carto vector `building` layers at a pin (speeds queued fetches). */
  const vectorRingLookupRef = useRef<((lat: number, lon: number) => LatLon[] | null) | null>(null)

  const findLocationHit = useCallback(
    (lat: number, lon: number) => findLocationHitByMapClick(locations, lat, lon, footprintLoadingIds),
    [locations, footprintLoadingIds],
  )

  const findLocationByAddrMemo = useCallback(
    (text: string) => findLocationByAddressText(locations, text),
    [locations],
  )

  const getRouteColorMemo = useCallback(
    (trackId: string) => resolvedTrackColors.get(trackId) ?? TRACK_DEFAULT_COLORS_FIRST_FOUR[0],
    [resolvedTrackColors],
  )

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

  const canManipulateTrackPointFn = useCallback(
    (pointId: string) => {
      const p = caseTrackPoints.find((x) => x.id === pointId)
      return !!p && canEditTrackPoint(data, actorId, p)
    },
    [caseTrackPoints, data, actorId],
  )
  const onSelectTrackPointMap = useCallback((id: string) => setSelectedTrackPointId(id), [])
  const onTrackPointDragEnd = useCallback(
    (pointId: string, lat: number, lon: number) => {
      const p = caseTrackPoints.find((x) => x.id === pointId)
      if (!p || !canEditTrackPoint(data, actorId, p)) return
      void updateTrackPoint(actorId, pointId, { lat, lon })
    },
    [actorId, caseTrackPoints, data, updateTrackPoint],
  )
  const onTrackTimeLabelDragEnd = useCallback(
    (pointId: string, offsetX: number, offsetY: number) => {
      const p = caseTrackPoints.find((x) => x.id === pointId)
      if (!p || !canEditTrackPoint(data, actorId, p)) return
      void updateTrackPoint(actorId, pointId, { mapTimeLabelOffsetX: offsetX, mapTimeLabelOffsetY: offsetY })
    },
    [actorId, caseTrackPoints, data, updateTrackPoint],
  )

  const trackingMapInteraction = useMemo(
    () => ({
      trackPoints: caseTrackPoints,
      visibleTrackIds,
      canManipulateTrackPoint: canManipulateTrackPointFn,
      onPickPoint: onSelectTrackPointMap,
      onAddPoint: (lat: number, lon: number) => {
        const placeTid = probativePlacementSession?.trackId
        const tid = placeTid ?? trackForMapAdd
        if (!tid) return
        if (placeTid) {
          if (probativePlacementLockRef.current) return
          probativePlacementLockRef.current = true
          setProbativePlacementSession(null)
        }
        void createTrackPoint({ caseId: props.caseId, createdByUserId: actorId, trackId: tid, lat, lon })
          .then((id) => {
            setSelectedTrackPointId(id)
            setTrackStepUndoTargetId(id)
            if (placeTid) {
              setAutoContinuationTrackId(placeTid)
            }
          })
          .catch(() => {
            if (placeTid) {
              setProbativePlacementSession({ trackId: placeTid })
            }
          })
          .finally(() => {
            if (placeTid) probativePlacementLockRef.current = false
          })
      },
      addDisabled: !(probativePlacementSession?.trackId ?? trackForMapAdd),
    }),
    [
      caseTrackPoints,
      visibleTrackIds,
      trackForMapAdd,
      probativePlacementSession,
      props.caseId,
      createTrackPoint,
      onSelectTrackPointMap,
      canManipulateTrackPointFn,
      actorId,
    ],
  )

  const controlPaneWidth = 'clamp(300px, 28vw, 380px)'
  const workspaceGridStyle = useMemo<CSSProperties>(
    () =>
      isNarrow
        ? {
            display: 'grid',
            gridTemplateColumns: '1fr',
            // Map (or list) uses all flexible height; tabs strip is only as tall as its content — no empty gap below.
            gridTemplateRows: 'minmax(0, 1fr) auto',
            gridTemplateAreas: '"map" "controls"',
            gap: 'clamp(4px, 0.9vw, 10px)',
            alignItems: 'stretch',
            flex: 1,
            minHeight: 0,
            minWidth: 0,
          }
        : {
            display: 'grid',
            gridTemplateColumns: `${webToolsCanCollapse && webToolsCollapsed ? '0px' : controlPaneWidth} minmax(0, 1fr)`,
            gridTemplateRows: 'minmax(0, 1fr)',
            gridTemplateAreas: '"controls map"',
            gap: webToolsCanCollapse && webToolsCollapsed ? 0 : 'clamp(4px, 0.9vw, 10px)',
            alignItems: 'stretch',
            flex: 1,
            minHeight: 0,
            minWidth: 0,
          },
    [isNarrow, webToolsCanCollapse, webToolsCollapsed, controlPaneWidth],
  )
  const mapPaneDetailOverlay: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: isNarrow
      ? 'min(220px, 42svh)'
      : 'min(280px, 34svh, calc(100% - clamp(120px, 22vh, 220px)))',
    // Wide: seam tab sits above drawer top (`translateY(-100%)`); keep overflow visible for anchor. Narrow: scroll.
    ...(isNarrow ? { overflowY: 'auto', overflowX: 'hidden' } : { overflow: 'visible' }),
    padding: isNarrow
      ? 'var(--vc-space-xs) var(--vc-space-sm) var(--vc-space-md)'
      : 'clamp(10px, 1.6vw, 18px) var(--vc-space-sm) var(--vc-space-md)',
    boxSizing: 'border-box',
    // Above MapLibre markers/track pins (~40) so status pills receive clicks; modals stay higher (~60000).
    zIndex: 5000,
    pointerEvents: 'auto',
    isolation: 'isolate',
    background: 'rgba(255,255,255,0.96)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderTop: '1px solid #d1d5db',
    borderBottomLeftRadius: 'var(--vc-radius-lg)',
    borderBottomRightRadius: 'var(--vc-radius-lg)',
  }
  /**
   * Map/dock interaction invariants:
   * - detail overlay z-index must stay above map content (markers/paths) but below modal dialogs.
   * - outside-dismiss only runs when taps are outside interactive zones (dock, search, detail drawer).
   * - wide seam tab is pinned to the bottom inside edge of the map card (MapPaneEdgeAnchor), above the notes sheet.
   */
  const wideMapDetailCollapsed =
    !isNarrow && caseTab === 'tracking' && !trackDrawerDetailsOpen
  /** Wide web: seam on addresses map; on tracking whenever the tab is active (same flush expand control as canvassing). */
  const showWideMapDrawerSeam =
    !isNarrow &&
    ((caseTab === 'addresses' && viewMode !== 'list') || caseTab === 'tracking')
  /** Bottom-center tab (compact): hidden while sheet is expanded — handle moves to top of sheet. */
  const wideMapDrawerSeamBottomTab =
    showWideMapDrawerSeam &&
    !(
      (caseTab === 'addresses' && viewMode !== 'list' && addressDrawerDetailsOpen) ||
      (caseTab === 'tracking' && trackDrawerDetailsOpen)
    )
  /** Top of expanded sheet: flat edge toward map. */
  const wideMapDrawerSeamSheetTopTab =
    !isNarrow &&
    showWideMapDrawerSeam &&
    ((caseTab === 'addresses' && viewMode !== 'list' && addressDrawerDetailsOpen) ||
      (caseTab === 'tracking' && trackDrawerDetailsOpen))
  /** Wide: white notes/track sheet should paint (collapsed ⇒ display none on overlay). */
  const wideMapDetailPanelOpen =
    !isNarrow &&
    showWideMapDrawerSeam &&
    (caseTab === 'addresses'
      ? viewMode !== 'list' && addressDrawerDetailsOpen
      : trackDrawerDetailsOpen)
  /** Flush map canvas to card bottom on wide map views — removes idle white strip from bottom inset. */
  const wideMapUsesFullBleedMapCanvas =
    !isNarrow && (caseTab === 'tracking' || (caseTab === 'addresses' && viewMode !== 'list'))
  const mapStackBottom: CSSProperties['bottom'] = wideMapUsesFullBleedMapCanvas ? 0 : MAP_CANVAS_BOTTOM_RESERVE
  const showMapDetailOverlayShell =
    (caseTab === 'tracking' && !!selectedTrackPoint) ||
    (caseTab === 'addresses' && viewMode !== 'list' && (!isNarrow || (!!selected && locationDetailOpen)))
  const mapPaneDetailOverlayStyle: CSSProperties = {
    ...(wideMapDetailCollapsed
      ? {
          ...mapPaneDetailOverlay,
          maxHeight: 0,
          padding: 0,
          background: 'transparent',
          borderTop: 'none',
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          overflow: 'visible',
        }
      : mapPaneDetailOverlay),
    ...(!wideMapDetailPanelOpen && showWideMapDrawerSeam ? { display: 'none' } : {}),
    ...(wideMapDrawerSeamSheetTopTab && !wideMapDetailCollapsed
      ? { paddingTop: 'calc(18px + clamp(8px, 1.2vw, 14px))' }
      : {}),
  }
  const mapColumnWrapperStyle: CSSProperties = {
    gridArea: 'map',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    height: '100%',
  }
  const mapPaneInnerShellStyle: CSSProperties = {
    ...card,
    position: 'relative',
    padding: 0,
    overflow: 'hidden',
    minWidth: 0,
    minHeight: 0,
    flex: 1,
    borderRadius: 12,
    borderBottom: card.border,
  }

  if (!c) {
    return (
      <Layout title="Case not found" right={<button onClick={props.onBack} style={btn}>Case List</button>}>
        <div style={{ color: '#374151' }}>This case may have been deleted.</div>
      </Layout>
    )
  }

  const addrSearchProminent =
    addrFieldFocused || loadingSug || suggestions.length > 0 || addr.trim().length > 0

  const renderAddAddressSearch = (floating: boolean) => (
    <div style={{ display: 'grid', gap: floating ? 3 : 6 }}>
      {!floating && !isNarrow ? (
        <div style={{ fontWeight: 900, fontSize: 13 }}>Add address</div>
      ) : null}
      <input
        ref={addrSearchInputRef}
        value={addr}
        onChange={(e) => setAddr(e.target.value)}
        onFocus={() => {
          if (addrBlurClearRef.current) {
            clearTimeout(addrBlurClearRef.current)
            addrBlurClearRef.current = null
          }
          setAddrFieldFocused(true)
        }}
        onBlur={() => clearAddrFieldFocusSoon()}
        placeholder={GEOCODE_SCOPE === 'ny' ? 'Search NY address…' : 'Search address…'}
        style={{
          ...field,
          maxWidth: '100%',
          boxSizing: 'border-box',
          minWidth: 0,
          fontSize: isNarrow ? 16 : undefined,
          ...(floating
            ? { padding: '6px 9px', minHeight: 38, lineHeight: 1.25 }
            : isNarrow
              ? { padding: '8px 10px' }
              : {}),
        }}
      />
      {(!floating || addrSearchProminent) && GEOCODE_SCOPE === 'ny' ? (
        <div
          style={{
            color: '#374151',
            fontSize: floating ? 11 : 12,
            lineHeight: 1.35,
          }}
        >
          Autocomplete is currently scoped to New York addresses.
        </div>
      ) : null}
      {!floating || addrSearchProminent ? (
        loadingSug ? (
          <div style={{ color: '#374151', fontSize: floating ? 11 : 12 }}>Searching…</div>
        ) : null
      ) : null}
      {suggestions.length ? (
        <div
          style={{
            display: 'grid',
            gap: floating ? 3 : 6,
            maxHeight: isNarrow ? `min(${floating ? 150 : 220}px, ${floating ? 28 : 36}vh)` : undefined,
            overflowY: isNarrow ? 'auto' : undefined,
            WebkitOverflowScrolling: isNarrow ? 'touch' : undefined,
          }}
        >
          {suggestions.map((s) => (
            <button
              type="button"
              key={`${s.lat},${s.lon},${s.label}`}
              style={suggestionBtn}
              onClick={() => {
                if (addrBlurClearRef.current) {
                  clearTimeout(addrBlurClearRef.current)
                  addrBlurClearRef.current = null
                }
                dismissAddressSearch()
                setAddr('')
                openAddLocationModal({ lat: s.lat, lon: s.lon, addressText: s.label, bounds: s.bounds ?? null })
                const m = mapRef.current
                if (m) m.flyTo(s.lat, s.lon, Math.max(m.getZoom(), 16), { duration: 0.6 })
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : !floating || addrSearchProminent ? (
        addr.trim().length >= 3 ? (
          /^\d{1,4}-\d{1,4}$/.test(addr.trim()) ? (
            <div style={{ color: '#374151', fontSize: floating ? 11 : 12, lineHeight: 1.35 }}>
              Add the street name after the house number (e.g., ‘120-37 170 Street’).
            </div>
          ) : (
            <div style={{ color: '#374151', fontSize: floating ? 11 : 12, lineHeight: 1.35 }}>
              No suggestions. Try adding city/state.
            </div>
          )
        ) : null
      ) : null}
    </div>
  )

  const mapLeftDockProminent = mapLeftToolDockOpen || mapLeftToolSection !== null

  const filterLegendChipsGridDock = (
    <div
      style={{
        display: 'grid',
        gap: 4,
        gridTemplateColumns: '1fr 1fr',
        alignItems: 'stretch',
        minWidth: 0,
      }}
    >
      <LegendChip
        dockCompact
        label={`No cameras (${counts.noCameras})`}
        color={statusColor('noCameras')}
        on={filters.noCameras}
        onToggle={() => setFilters((f) => ({ ...f, noCameras: !f.noCameras }))}
      />
      <LegendChip
        dockCompact
        label={`Needs Follow up (${counts.camerasNoAnswer})`}
        color={statusColor('camerasNoAnswer')}
        on={filters.camerasNoAnswer}
        onToggle={() => setFilters((f) => ({ ...f, camerasNoAnswer: !f.camerasNoAnswer }))}
      />
      <LegendChip
        dockCompact
        label={`Not probative (${counts.notProbativeFootage})`}
        color={statusColor('notProbativeFootage')}
        on={filters.notProbativeFootage}
        onToggle={() => setFilters((f) => ({ ...f, notProbativeFootage: !f.notProbativeFootage }))}
      />
      <LegendChip
        dockCompact
        label={`Probative (${counts.probativeFootage})`}
        color={statusColor('probativeFootage')}
        on={filters.probativeFootage}
        onToggle={() => setFilters((f) => ({ ...f, probativeFootage: !f.probativeFootage }))}
      />
    </div>
  )

  const mapViewFitLocateButtons = (
    <>
      <button
        type="button"
        style={{
          ...viewModeBtn(viewMode === 'map'),
          width: '100%',
          opacity: caseTab === 'tracking' ? 0.55 : 1,
        }}
        disabled={caseTab === 'tracking'}
        title={
          caseTab === 'tracking'
            ? 'Subject tracking mode keeps the map open for route steps. Switch to Video canvassing for list-only layout.'
            : undefined
        }
        onClick={() => {
          setWorkspaceViewMode('map')
          closeMapToolsDock()
        }}
      >
        Map view
      </button>
      <button
        type="button"
        style={{
          ...viewModeBtn(viewMode === 'list'),
          width: '100%',
          opacity: caseTab === 'tracking' ? 0.55 : 1,
        }}
        disabled={caseTab === 'tracking'}
        title={
          caseTab === 'tracking'
            ? 'Subject tracking mode keeps the map open for route steps. Switch to Video canvassing for list-only layout.'
            : undefined
        }
        onClick={() => {
          setWorkspaceViewMode('list')
          closeMapToolsDock()
        }}
      >
        List view
      </button>
      <button
        type="button"
        style={{ ...btn, width: '100%' }}
        onClick={() => {
          fitMapToCanvass()
          closeMapToolsDock()
        }}
        disabled={!locations.length}
        title="Zoom to canvass pins"
      >
        Fit canvass
      </button>
      <button
        type="button"
        style={{ ...btn, width: '100%' }}
        onClick={() => {
          fitMapToPaths()
          closeMapToolsDock()
        }}
        disabled={!trackingMapPoints.length}
        title="Zoom to visible tracks"
      >
        Fit paths
      </button>
      <button
        type="button"
        style={{ ...btn, width: '100%' }}
        onClick={() => {
          fitMapToAll()
          closeMapToolsDock()
        }}
        disabled={!locations.length && !trackingMapPoints.length}
        title="Zoom to show everything"
      >
        Fit all
      </button>
      <button
        type="button"
        style={{ ...btn, width: '100%' }}
        onClick={() => {
          closeMapToolsDock()
          if (!navigator.geolocation) return
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const m = mapRef.current
              if (!m) return
              m.flyTo(pos.coords.latitude, pos.coords.longitude, Math.max(m.getZoom(), 16), { duration: 0.6 })
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000 },
          )
        }}
      >
        Locate me
      </button>
    </>
  )
  const caseModeToggleBar = (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 6,
        width: 'min(360px, calc(100% - 56px))',
        minWidth: 0,
      }}
    >
      <button type="button" style={{ ...viewModeBtn(caseTab === 'addresses'), width: '100%' }} onClick={() => setWorkspaceCaseTab('addresses')}>
        Video canvassing
      </button>
      <button type="button" style={{ ...viewModeBtn(caseTab === 'tracking'), width: '100%' }} onClick={() => setWorkspaceCaseTab('tracking')}>
        Subject tracking
      </button>
    </div>
  )

  const casePhotosSidebarBlock =
    caseAttachments.length > 0 || canAddCaseContentHere ? (
      <div
        style={{
          borderTop: '1px solid #e5e7eb',
          marginTop: 8,
          paddingTop: 10,
          paddingLeft: 8,
          paddingRight: 8,
          paddingBottom: 8,
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        <input ref={refPhotoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onRefPhotoPick} />
        {canAddCaseContentHere ? (
          <button
            type="button"
            style={{
              ...btnPrimary,
              fontSize: 'clamp(10px, 0.98vw, 12px)',
              padding: 'clamp(5px, 0.9vw, 9px) clamp(8px, 1.2vw, 12px)',
              width: '100%',
              boxSizing: 'border-box',
            }}
            onClick={() => {
              setRefPhotoErr(null)
              setPendingAddKind('wanted_flyer')
              setAddPhotoModalOpen(true)
            }}
          >
            Add photo
          </button>
        ) : null}
        {caseAttachments.length > 0 ? (
          <div style={{ marginTop: 10, display: 'grid', gap: 8, minWidth: 0 }}>
            <div
              style={{
                position: 'relative',
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
                background: '#0f172a',
              }}
            >
              {caseAttachments.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSidebarMediaIndex((i) => (i - 1 + caseAttachments.length) % caseAttachments.length)
                    }}
                    style={casePhotoCarouselArrowStyle('left')}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSidebarMediaIndex((i) => (i + 1) % caseAttachments.length)
                    }}
                    style={casePhotoCarouselArrowStyle('right')}
                  >
                    ›
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setPhotoViewerIndex(sidebarMediaIndex)}
                style={{ padding: 0, border: 'none', cursor: 'pointer', display: 'block', width: '100%' }}
              >
                <img
                  src={caseAttachments[sidebarMediaIndex]!.imageDataUrl}
                  alt=""
                  style={{
                    width: '100%',
                    height: 'clamp(72px, 14vh, 120px)',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </button>
            </div>
            {(() => {
              const att = caseAttachments[sidebarMediaIndex]!
              const canEdit = canEditCaseAttachment(data, actorId, att)
              return canEdit ? (
                <textarea
                  placeholder="Description (optional)"
                  defaultValue={att.caption}
                  key={`${att.id}:${att.updatedAt}:sidebar`}
                  rows={2}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v !== (att.caption ?? '').trim()) {
                      void updateCaseAttachment(actorId, att.id, { caption: v })
                    }
                  }}
                  style={{
                    ...field,
                    fontSize: 11,
                    padding: 6,
                    resize: 'vertical',
                    minHeight: 44,
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              ) : (
                <div
                  style={{
                    fontSize: 11,
                    color: '#374151',
                    lineHeight: 1.35,
                    wordBreak: 'break-word',
                  }}
                >
                  {(att.caption ?? '').trim() ? att.caption : '—'}
                </div>
              )
            })()}
          </div>
        ) : null}
      </div>
    ) : null

  const mapDockPanelStyle: CSSProperties = {
    alignSelf: 'stretch',
    marginTop: 6,
    padding: 10,
    background: 'rgba(255,255,255,0.98)',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    maxHeight: 'min(48vh, 360px)',
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  }

  /** Filter chips are compact 2×2 — no inner scroll; outer tool menu scrolls if needed. */
  const mapDockFilterPanelStyle: CSSProperties = {
    ...mapDockPanelStyle,
    maxHeight: 'none',
    overflowY: 'visible',
    padding: 8,
  }

  const mapDockColumnStyle: CSSProperties = {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 44,
    width: 'auto',
    maxWidth: 'min(calc(100vw - 32px), 300px)',
    maxHeight:
      detailOverlayHeightPx > 0
        ? `calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${detailOverlayHeightPx}px - clamp(8px, 1.2vw, 14px))`
        : undefined,
    position: 'relative',
    pointerEvents: 'auto',
    boxSizing: 'border-box',
  }

  /** Same chrome for map overlay + list header on narrow — matches Video canvassing / Subject tracking map. */
  const narrowFloatingAddressCardStyle: CSSProperties = {
    padding: 5,
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.96)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    borderRadius: 9,
    border: '1px solid #e5e7eb',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    minWidth: 0,
    maxWidth: '100%',
  }

  /** Skip MapLibre top-left zoom stack (~30px + control margins) so the search card does not cover +/- . */
  const narrowMapTopReserveLeft = 'calc(max(10px, env(safe-area-inset-left, 0px)) + 58px)'

  const narrowMapToolsScrollStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 0,
    maxHeight:
      detailOverlayHeightPx > 0
        ? `min(70vh, 540px, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${detailOverlayHeightPx + 14}px))`
        : 'min(70vh, 540px, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 72px))',
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    paddingBottom: 2,
    boxSizing: 'border-box',
  }

  /**
   * Outer shell: pointer-events none so taps on the map “under” empty overlay space still hit the map/backdrop
   * (closes menu). Inner column below keeps pointer-events auto for real controls only.
   */
  const narrowMapToolsOverlayPassThroughStyle: CSSProperties = {
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
    width: 'min(280px, calc(100vw - 48px))',
    minWidth: 0,
    boxSizing: 'border-box',
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  }

  const narrowMapToolsOverlayInteractiveStyle: CSSProperties = {
    ...narrowMapToolsScrollStyle,
    pointerEvents: 'auto',
    width: 'max-content',
    maxWidth: 'min(280px, calc(100vw - 48px))',
    alignSelf: 'flex-end',
  }

  const mapDockNavBtnBase: CSSProperties = {
    ...btn,
    alignSelf: 'flex-end',
    width: 'auto',
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
    flexShrink: 0,
  }
  const mapDockMenuToggleBtnStyle: CSSProperties = {
    ...btn,
    width: 44,
    height: 44,
    minWidth: 44,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    lineHeight: 1,
    borderRadius: 10,
    boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
    flexShrink: 0,
  }
  const renderDockSectionButton = (section: 'views' | 'filters' | 'tracks' | 'photos', label: string) => (
    <button
      type="button"
      onClick={() =>
        setMapLeftToolSection((s) => {
          const next = s === section ? null : section
          return next
        })
      }
      style={{
        ...mapDockNavBtnBase,
        textAlign: 'left',
        background: mapLeftToolSection === section ? '#f3f4f6' : 'white',
      }}
    >
      {label}
    </button>
  )

  const webDockNavBtnBase: CSSProperties = {
    ...btn,
    width: '100%',
    fontWeight: 700,
    fontSize: 12,
    textAlign: 'left',
  }
  const renderWebDockSectionButton = (section: 'views' | 'filters' | 'tracks' | 'photos', label: string) => (
    <button
      type="button"
      onClick={() =>
        setMapLeftToolSection((s) => {
          const next = s === section ? null : section
          return next
        })
      }
      style={{
        ...webDockNavBtnBase,
        background: mapLeftToolSection === section ? '#f3f4f6' : 'white',
      }}
    >
      {label}
    </button>
  )

  const mapToolsDockSectionPanels = (
    <>
      {mapLeftToolSection === 'filters' ? (
        <div style={mapDockFilterPanelStyle}>
          <div style={{ fontWeight: 800, fontSize: 10, color: '#6b7280', marginBottom: 4 }}>
            Result ({locations.length} total)
          </div>
          {filterLegendChipsGridDock}
        </div>
      ) : null}
      {mapLeftToolSection === 'views' ? (
        <div style={mapDockPanelStyle}>
          <div
            className="case-pane-actions-row"
            style={{
              display: 'grid',
              gap: 6,
              gridTemplateColumns: '1fr',
              alignItems: 'stretch',
              minWidth: 0,
              width: '100%',
            }}
          >
            {mapViewFitLocateButtons}
          </div>
        </div>
      ) : null}
      {mapLeftToolSection === 'tracks' ? (
        <div style={mapDockPanelStyle}>
          <div style={{ display: 'grid', gap: 8, width: '100%', minWidth: 0 }}>
            <button
              type="button"
              style={{ ...btnPrimary, width: '100%', boxSizing: 'border-box', fontSize: 12 }}
              disabled={!canAddCaseContentHere}
              title={!canAddCaseContentHere ? 'No access to add tracks' : undefined}
              onClick={() => {
                setWorkspaceCaseTab('tracking')
                setAddTrackKind('person')
                setAddTrackLabel(`Track ${caseTracks.length + 1}`)
                setShowAddTrack(true)
              }}
            >
              New Track
            </button>
            {caseTracks.length === 0 ? (
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
                No tracks yet — add one to plot steps on the map.
              </div>
            ) : (
              caseTracks.map((t) => {
                const on = visibleTrackIds[t.id] !== false
                const canEditT = canEditTrack(data, actorId, t)
                const canDelT = canDeleteTrack(data, actorId, t)
                const lineColor = resolvedTrackColors.get(t.id) ?? TRACK_DEFAULT_COLORS_FIRST_FOUR[0]
                const colorPickerId = `map-dock-track-color-${t.id}`
                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minWidth: 0,
                      padding: '6px 8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      background: '#fafafa',
                      boxSizing: 'border-box',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      title={on ? 'Hide path on map' : 'Show path on map'}
                      onChange={(e) => setVisibleTrackIds((prev) => ({ ...prev, [t.id]: e.target.checked }))}
                      style={{ flexShrink: 0, width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <label
                      htmlFor={colorPickerId}
                      title={canEditT ? 'Change path color' : 'No permission to change color'}
                      style={{
                        flexShrink: 0,
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: `2px solid ${lineColor}`,
                        background: lineColor,
                        cursor: canEditT ? 'pointer' : 'default',
                        position: 'relative',
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                      }}
                    >
                      <input
                        id={colorPickerId}
                        type="color"
                        value={lineColor}
                        disabled={!canEditT}
                        onChange={(e) => void updateTrack(actorId, t.id, { routeColor: e.target.value })}
                        style={{
                          opacity: 0,
                          position: 'absolute',
                          width: '180%',
                          height: '180%',
                          left: '-40%',
                          top: '-40%',
                          cursor: canEditT ? 'pointer' : 'default',
                          border: 'none',
                          padding: 0,
                        }}
                      />
                    </label>
                    <input
                      value={t.label}
                      readOnly={!canEditT}
                      placeholder="Track name"
                      title={canEditT ? 'Rename track' : 'No permission to rename'}
                      onChange={(e) => void updateTrack(actorId, t.id, { label: e.target.value })}
                      style={{
                        ...field,
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 10px',
                      }}
                    />
                    {canDelT ? (
                      <button
                        type="button"
                        aria-label={`Delete ${t.label}`}
                        title="Delete track"
                        style={{
                          flexShrink: 0,
                          width: 32,
                          height: 32,
                          padding: 0,
                          border: '1px solid #fecaca',
                          borderRadius: 8,
                          background: '#fff1f2',
                          color: '#9f1239',
                          cursor: 'pointer',
                          fontSize: 'clamp(14px, 1.4vw, 18px)',
                          fontWeight: 900,
                          lineHeight: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Delete "${t.label}" and every step on it? This cannot be undone.`,
                            )
                          )
                            return
                          const remaining = caseTracks.filter((x) => x.id !== t.id)
                          const nextTrackId = remaining[0]?.id ?? null
                          const clearStep =
                            !!selectedTrackPointId &&
                            caseTrackPoints.some((p) => p.id === selectedTrackPointId && p.trackId === t.id)
                          void deleteTrack(actorId, t.id).then(() => {
                            setVisibleTrackIds((prev) => {
                              const next = { ...prev }
                              delete next[t.id]
                              return next
                            })
                            if (autoContinuationTrackId === t.id) setAutoContinuationTrackId(nextTrackId)
                            if (clearStep) setSelectedTrackPointId(null)
                          })
                        }}
                      >
                        ✕
                      </button>
                    ) : (
                      <span style={{ width: 32, flexShrink: 0 }} aria-hidden />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : null}
      {mapLeftToolSection === 'photos' ? (
        <div style={{ ...mapDockPanelStyle, padding: 8 }}>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            {casePhotosSidebarBlock ?? (
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>
                No reference photos yet{canAddCaseContentHere ? '. Use Add photo in this panel.' : '.'}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )

  const narrowMapTopShowsFloatingAddress =
    caseTab === 'tracking' || (caseTab === 'addresses' && viewMode === 'map')
  const mapPaneShowsInteractive = caseTab === 'tracking' || viewMode === 'map'
  const addrSearchMapShieldActive =
    addrAutocompleteEngaged && !probativePlacementSession && mapPaneShowsInteractive
  const webToolsArrowOnly = !isNarrow && webToolsCanCollapse && webToolsCollapsed
  /** Outer pane stays overflow-visible so the collapse tab can extend into the grid gap; scroll lives in an inner div. */
  const wideToolsExpandedScrollFix = !isNarrow && webToolsCanCollapse && !webToolsCollapsed

  const controlPaneDockInner = !webToolsCollapsed || isNarrow ? (
    <>
      {isNarrow ? (
        <div style={{ padding: 8, display: 'grid', gap: 6, borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              style={{ ...viewModeBtn(caseTab === 'addresses'), width: '100%' }}
              onClick={() => setWorkspaceCaseTab('addresses')}
            >
              Video canvassing
            </button>
            <button
              type="button"
              style={{ ...viewModeBtn(caseTab === 'tracking'), width: '100%' }}
              onClick={() => setWorkspaceCaseTab('tracking')}
            >
              Subject tracking
            </button>
          </div>
        </div>
      ) : (
        <div ref={wideAddrSearchRef} />
      )}
      {!isNarrow && webToolsCanCollapse ? (
        <div style={{ padding: 8, display: 'grid', gap: 6 }}>
          {renderWebDockSectionButton('views', 'Views')}
          {renderWebDockSectionButton('filters', 'Filters')}
          {renderWebDockSectionButton('tracks', 'Tracks')}
          {renderWebDockSectionButton('photos', 'Photos')}
          <button
            type="button"
            onClick={() => setProbativeFlow({ step: 'calc', target: { kind: 'dvr_only' } })}
            style={{ ...webDockNavBtnBase, background: 'white' }}
          >
            DVR calculator
          </button>
          {mapToolsDockSectionPanels}
        </div>
      ) : !isNarrow ? (
        <div style={{ ...mapTopBar, flexDirection: 'column', alignItems: 'stretch' }}>
          <button
            type="button"
            onClick={() => setFilterLegendOpen((v) => !v)}
            aria-expanded={filterLegendOpen}
            style={{
              ...btn,
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              fontWeight: 800,
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            <span>Total locations selected ({locations.length})</span>
            <span style={{ flexShrink: 0, opacity: 0.65, fontSize: 10 }} aria-hidden>
              {filterLegendOpen ? '▼' : '▶'}
            </span>
          </button>
          {filterLegendOpen ? filterLegendChipsGridDock : null}
          <div
            className="case-pane-actions-row"
            style={{
              display: 'grid',
              gap: 6,
              gridTemplateColumns: '1fr',
              alignItems: 'stretch',
            }}
          >
            {mapViewFitLocateButtons}
          </div>
          <button
            type="button"
            style={{ ...btn, width: '100%', fontWeight: 800, fontSize: 12 }}
            onClick={() => setShowManageTracks(true)}
          >
            Manage tracks
          </button>
          <button
            type="button"
            style={{ ...btn, width: '100%', fontWeight: 800, fontSize: 12 }}
            onClick={() => setProbativeFlow({ step: 'calc', target: { kind: 'dvr_only' } })}
          >
            DVR calculator
          </button>
          {casePhotosSidebarBlock}
        </div>
      ) : (
        <div style={{ ...mapTopBar, flexDirection: 'column', alignItems: 'stretch' }} />
      )}
    </>
  ) : null

  const controlPaneBlock = (
    <div
      className="case-control-pane"
      style={{
        gridArea: 'controls',
        ...card,
        padding: 0,
        minHeight: 0,
        minWidth: 0,
        height: isNarrow ? 'auto' : '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        borderRadius: webToolsArrowOnly ? 0 : 12,
        position: 'relative',
        zIndex: webToolsArrowOnly ? 30 : undefined,
        background: webToolsArrowOnly ? 'transparent' : undefined,
        border: webToolsArrowOnly ? 'none' : undefined,
        boxShadow: webToolsArrowOnly ? 'none' : undefined,
        display: wideToolsExpandedScrollFix ? 'flex' : undefined,
        flexDirection: wideToolsExpandedScrollFix ? 'column' : undefined,
        overflowY: wideToolsExpandedScrollFix ? 'visible' : webToolsArrowOnly ? 'visible' : 'auto',
        overflowX:
          webToolsArrowOnly || wideToolsExpandedScrollFix ? 'visible' : 'hidden',
      }}
    >
      {!isNarrow && webToolsCanCollapse && !webToolsCollapsed ? (
        <MapPaneEdgeAnchor placement="verticalRail">
          <MapPaneEdgeToggle
            placement="verticalRail"
            expanded
            ariaLabel="Collapse map tools"
            onClick={() => {
              setMapLeftToolSection(null)
              setWebToolsCollapsed(true)
            }}
          />
        </MapPaneEdgeAnchor>
      ) : null}
      {wideToolsExpandedScrollFix ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {controlPaneDockInner}
        </div>
      ) : (
        controlPaneDockInner
      )}
    </div>
  )
  const WorkspaceShell = WebCaseWorkspace
  const mapDetailLayout = isNarrow ? 'stack' : 'wide'
  const workspaceShellProps = { workspaceGridStyle } as const

  return (
    <>
      <Layout
      dense
      title={
        caseMetaEditing ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignItems: 'stretch',
              minWidth: 0,
              width: '100%',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                minWidth: 0,
                width: '100%',
              }}
            >
              <input
                autoFocus
                value={caseNameDraft}
                onChange={(e) => setCaseNameDraft(e.target.value)}
                aria-label="Case name"
                autoComplete="off"
                name="vc-case-number-edit"
                inputMode="text"
                style={caseMetaInlineNameEdit}
              />
              <textarea
                value={caseDescDraft}
                maxLength={CASE_DESCRIPTION_MAX_CHARS}
                onChange={(e) => setCaseDescDraft(e.target.value)}
                placeholder="Add description"
                aria-label="Description"
                rows={2}
                autoComplete="off"
                name="vc-case-desc-edit"
                inputMode="text"
                style={{
                  ...caseMetaInlineDescEdit,
                  width: '100%',
                  flex: 'none',
                  minWidth: 0,
                  minHeight: 72,
                  maxHeight: 200,
                  fontWeight: 500,
                  color: '#4b5563',
                }}
              />
            </div>
            {isNarrow ? (
              <div style={{ display: 'flex', gap: 8, width: '100%', boxSizing: 'border-box' }}>
                <button type="button" onClick={saveCaseMetaEdit} style={{ ...btnPrimary, flex: 1, minWidth: 0 }}>
                  Save
                </button>
                <button type="button" onClick={discardCaseMetaEdit} style={{ ...btn, flex: 1, minWidth: 0 }}>
                  Discard
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 2,
              minWidth: 0,
              width: '100%',
            }}
          >
            {canEditCaseMetaHere ? (
              <>
                <button
                  type="button"
                  onClick={beginCaseMetaEdit}
                  title="Edit case name and description"
                  style={caseHeaderReadonlyTitle}
                >
                  {c.caseNumber}
                </button>
                <button
                  type="button"
                  onClick={beginCaseMetaEdit}
                  title="Edit case name and description"
                  style={caseHeaderReadonlyDesc}
                >
                  {(c.description ?? '').trim() ? c.description : 'Add description'}
                </button>
              </>
            ) : (
              <>
                <div style={{ ...caseHeaderReadonlyTitle, cursor: 'default' }}>{c.caseNumber}</div>
                <div style={{ ...caseHeaderReadonlyDesc, cursor: 'default' }}>
                  {(c.description ?? '').trim() ? c.description : '—'}
                </div>
              </>
            )}
          </div>
        )
      }
      subtitle={null}
      right={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {caseMetaEditing && !isNarrow ? (
            <>
              <button type="button" onClick={saveCaseMetaEdit} style={btnPrimary}>
                Save
              </button>
              <button type="button" onClick={discardCaseMetaEdit} style={btn}>
                Discard
              </button>
            </>
          ) : null}
          <button type="button" onClick={props.onBack} style={btn}>
            Case List
          </button>
        </div>
      }
    >
      <WorkspaceShell {...workspaceShellProps} isNarrow={isNarrow}>
        {controlPaneBlock}
        <div ref={mapPaneShellRef} style={mapColumnWrapperStyle}>
          <div style={mapPaneInnerShellStyle}>
              {probativePlacementSession ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 25,
                    maxWidth: 'min(520px, calc(100% - 24px))',
                    padding: '10px 14px',
                    background: 'rgba(17,24,39,0.92)',
                    color: 'white',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: 1.4,
                    textAlign: 'center',
                    pointerEvents: 'none',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                  }}
                >
                  Click the map to place a marker on “
                  {caseTracks.find((t) => t.id === probativePlacementSession.trackId)?.label ?? 'track'}” (where the subject was
                  last seen). Press Esc to cancel.
                </div>
              ) : null}
              {!probativePlacementSession && viewMode !== 'list' ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 'max(6px, env(safe-area-inset-top, 0px))',
                    left: 0,
                    right: 0,
                    zIndex: 45,
                    paddingLeft: narrowMapTopShowsFloatingAddress ? narrowMapTopReserveLeft : 'max(10px, env(safe-area-inset-left, 0px))',
                    paddingRight: 'max(10px, env(safe-area-inset-right, 0px))',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 8,
                    pointerEvents: 'none',
                  }}
                >
                  {!isNarrow ? caseModeToggleBar : null}
                  {narrowMapTopShowsFloatingAddress && mapLeftToolDockOpen ? (
                    <div
                      role="presentation"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: narrowMapTopReserveLeft,
                        minWidth: 72,
                        height: 'clamp(86px, 17vw, 124px)',
                        pointerEvents: 'auto',
                      }}
                      onPointerDown={(e) => {
                        if (performance.now() < mapToolsDockIgnoreOutsideUntilRef.current) {
                          e.preventDefault()
                          e.stopPropagation()
                          return
                        }
                        e.preventDefault()
                        e.stopPropagation()
                        mapRef.current?.clearPendingMapTap()
                        closeMapToolsDock()
                      }}
                    />
                  ) : null}
                  {narrowMapTopShowsFloatingAddress ? (
                    <div
                      ref={narrowMapAddressRef}
                      style={{
                        ...(isNarrow
                          ? { flex: 1, minWidth: 0 }
                          : {
                              flex: '0 1 auto',
                              width: 'min(400px, 100%)',
                              minWidth: 0,
                              maxWidth: '100%',
                            }),
                        pointerEvents: 'auto',
                        position: 'relative',
                        zIndex: 8,
                      }}
                    >
                      <div
                        style={{
                          ...narrowFloatingAddressCardStyle,
                          opacity: addrSearchProminent ? 1 : 0.52,
                          transition: 'opacity 0.2s ease',
                        }}
                      >
                        {renderAddAddressSearch(true)}
                      </div>
                    </div>
                  ) : null}
                  {isNarrow ? (
                    <div
                      ref={mapToolsDockRef}
                      style={{
                        ...mapDockColumnStyle,
                        marginLeft: narrowMapTopShowsFloatingAddress ? undefined : 'auto',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          gap: 6,
                          opacity: mapLeftDockProminent ? 1 : 0.45,
                          transition: 'opacity 0.2s ease',
                          minWidth: 0,
                        }}
                      >
                        {!mapLeftToolDockOpen ? (
                          <button
                            type="button"
                            aria-label="Open map tools: views, filters, tracks, and photos"
                            onClick={() => {
                              mapToolsDockIgnoreOutsideUntilRef.current = performance.now() + MAP_TOOLS_DOCK_OUTSIDE_GRACE_MS
                              setMapLeftToolDockOpen(true)
                            }}
                            style={mapDockMenuToggleBtnStyle}
                          >
                            ☰
                          </button>
                        ) : (
                          <>
                            {/** Keeps the top bar’s right edge aligned with the collapsed ☰ while the menu overlays leftward. */}
                            <div style={{ width: 44, height: 44, flexShrink: 0, pointerEvents: 'none' }} aria-hidden />
                            <div style={narrowMapToolsOverlayPassThroughStyle}>
                              <div style={narrowMapToolsOverlayInteractiveStyle}>
                                <button type="button" aria-label="Close map tools" onClick={closeMapToolsDock} style={mapDockMenuToggleBtnStyle}>
                                  ☰
                                </button>
                                {renderDockSectionButton('views', 'Views')}
                                {renderDockSectionButton('filters', 'Filters')}
                                {renderDockSectionButton('tracks', 'Tracks')}
                                {renderDockSectionButton('photos', 'Photos')}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setProbativeFlow({ step: 'calc', target: { kind: 'dvr_only' } })
                                    closeMapToolsDock()
                                  }}
                                  style={{
                                    ...mapDockNavBtnBase,
                                    textAlign: 'left',
                                    background: 'white',
                                  }}
                                >
                                  DVR calculator
                                </button>
                                {mapToolsDockSectionPanels}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {caseTab === 'tracking' || viewMode === 'map' ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: mapStackBottom,
                    minHeight: 0,
                    zIndex: 1,
                  }}
                >
                  {mapLeftToolDockOpen && !probativePlacementSession ? (
                    <div
                      role="presentation"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 22,
                        background: 'rgba(17,24,39,0.16)',
                        touchAction: 'none',
                      }}
                      onPointerDown={(e) => {
                        if (performance.now() < mapToolsDockIgnoreOutsideUntilRef.current) {
                          e.preventDefault()
                          e.stopPropagation()
                          return
                        }
                        e.preventDefault()
                        e.stopPropagation()
                        mapRef.current?.clearPendingMapTap()
                        closeMapToolsDock()
                      }}
                    />
                  ) : null}
                  <div style={{ position: 'absolute', inset: 0, zIndex: 1, minHeight: 0 }}>
                  <AddressesMapLibre
                    key={props.caseId}
                    ref={mapRef}
                    caseTab={caseTab}
                    defaultCenter={defaultCenter}
                    resumeMapFocus={resumeMapFocus}
                    mapPins={mapPins}
                    locations={locations}
                    selectedId={selectedId}
                    footprintLoadingIds={footprintLoadingIds}
                    vectorRingLookupRef={vectorRingLookupRef}
                    caseTracks={caseTracks}
                    caseTrackPoints={caseTrackPoints}
                    visibleTrackIds={visibleTrackIds}
                    trackingMapPoints={trackingMapPoints}
                    getRouteColor={getRouteColorMemo}
                    findHit={findLocationHit}
                    findByAddressText={findLocationByAddrMemo}
                    onSelectLocation={(id) => {
                      if (addrAutocompleteEngaged || mapLeftToolDockOpen) return
                      onMapLocationPress(id)
                    }}
                    onEnsureFootprint={enqueueOutlineForLocation}
                    suppressCanvassMapAdd={suppressCanvassMapAdd}
                    onRequestCanvassAdd={(input) => {
                      openAddLocationModal({
                        lat: input.lat,
                        lon: input.lon,
                        addressText: input.addressText,
                        vectorTileBuildingRing: input.vectorTileBuildingRing,
                      })
                    }}
                    onCanvassAddAddressResolved={(result) => {
                      if (result.existingLocationId) {
                        setPendingAddQueue((q) => q.filter((x) => !samePendingPin(x, result)))
                        setLocationDetailOpen(false)
                        setSelectedId(result.existingLocationId)
                        const match = locationsRef.current.find((l) => l.id === result.existingLocationId)
                        if (match && (!match.footprint || match.footprint.length < 3)) {
                          enqueueOutlineForLocation(match.id, match.lat, match.lon, match.addressText)
                        }
                        return
                      }
                      setPendingAddQueue((q) => {
                        const i = q.findIndex((x) => samePendingPin(x, result))
                        if (i < 0) return q
                        const next = q.slice()
                        next[i] = { ...next[i]!, addressText: result.addressText }
                        return next
                      })
                    }}
                    outlineDoneRef={outlineDoneRef}
                    outlineInFlightRef={outlineInFlightRef}
                    outlineQueuedRef={outlineQueuedRef}
                    footprintFailedIds={footprintFailedIds}
                    onEnqueueViewport={enqueueOutlineForLocation}
                    trackingInteraction={trackingMapInteraction}
                    selectedTrackPointId={selectedTrackPointId}
                    canManipulateTrackPoint={canManipulateTrackPointFn}
                    onSelectTrackPoint={onSelectTrackPointMap}
                    onTrackPointDragEnd={onTrackPointDragEnd}
                    onTrackTimeLabelDragEnd={onTrackTimeLabelDragEnd}
                    placementClickAddsTrackPoint={probativePlacementSession != null}
                    onTrackStepLongPress={onTrackStepLongPress}
                    onCanvassLocationLongPress={onCanvassLocationLongPress}
                  />
                  </div>
                  {addrSearchMapShieldActive ? (
                    <div
                      role="presentation"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 18,
                        background: 'rgba(17, 24, 39, 0.26)',
                        touchAction: 'none',
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        mapRef.current?.clearPendingMapTap()
                        addrDismissIgnoreUntilRef.current = performance.now() + ADDR_DISMISS_GRACE_MS
                        if (addrBlurClearRef.current) {
                          clearTimeout(addrBlurClearRef.current)
                          addrBlurClearRef.current = null
                        }
                        dismissAddressSearch()
                      }}
                    />
                  ) : null}
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    minHeight: 0,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      ...listHeaderRow,
                      flexShrink: 0,
                      borderBottom: '1px solid #e5e7eb',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 10,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>Locations ({filtered.length})</div>
                      <button type="button" style={btn} onClick={() => setWorkspaceViewMode('map')}>
                        Back to map
                      </button>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'nowrap',
                        gap: 6,
                        alignItems: 'center',
                        overflowX: 'auto',
                        WebkitOverflowScrolling: 'touch',
                        paddingBottom: 2,
                        marginLeft: -2,
                        marginRight: -2,
                        maxWidth: '100%',
                      }}
                      role="group"
                      aria-label="Filter locations by result"
                    >
                      <LegendChip
                        dense
                        label={`No cameras (${counts.noCameras})`}
                        color={statusColor('noCameras')}
                        on={filters.noCameras}
                        onToggle={() => setFilters((f) => ({ ...f, noCameras: !f.noCameras }))}
                      />
                      <LegendChip
                        dense
                        label={`Needs Follow up (${counts.camerasNoAnswer})`}
                        color={statusColor('camerasNoAnswer')}
                        on={filters.camerasNoAnswer}
                        onToggle={() => setFilters((f) => ({ ...f, camerasNoAnswer: !f.camerasNoAnswer }))}
                      />
                      <LegendChip
                        dense
                        label={`Not probative (${counts.notProbativeFootage})`}
                        color={statusColor('notProbativeFootage')}
                        on={filters.notProbativeFootage}
                        onToggle={() => setFilters((f) => ({ ...f, notProbativeFootage: !f.notProbativeFootage }))}
                      />
                      <LegendChip
                        dense
                        label={`Probative (${counts.probativeFootage})`}
                        color={statusColor('probativeFootage')}
                        on={filters.probativeFootage}
                        onToggle={() => setFilters((f) => ({ ...f, probativeFootage: !f.probativeFootage }))}
                      />
                    </div>
                  </div>
                  {filtered.length ? (
                    <div
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflow: 'auto',
                        display: 'grid',
                        alignContent: 'start',
                      }}
                    >
                      {locationsForListView.map((l) => {
                        const isListSelected = selectedId === l.id
                        const dimListRow = selectedId != null && !isListSelected
                        const canEditL = canEditLocation(data, actorId, l)
                        const canDelL = canDeleteLocation(data, actorId, l)
                        return (
                        <div
                          key={l.id}
                          style={{
                            ...listRow,
                            alignItems: 'start',
                            ...(isNarrow
                              ? {
                                  gridTemplateColumns: '1fr',
                                  gap: 10,
                                  padding: '10px 12px',
                                }
                              : {}),
                            background: isListSelected ? '#ffffff' : dimListRow ? '#ececef' : 'white',
                            opacity: dimListRow ? 0.72 : 1,
                            boxShadow: isListSelected ? 'inset 3px 0 0 #111827' : undefined,
                            transition: 'background 0.15s ease, opacity 0.15s ease',
                          }}
                        >
                          <button
                            type="button"
                            style={{
                              ...listRowMainBtn,
                              ...(isNarrow ? { width: '100%', minWidth: 0, boxSizing: 'border-box' } : {}),
                            }}
                            onClick={() => {
                              setLocationDetailOpen(false)
                              setSelectedId((id) => (id === l.id ? null : l.id))
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 800,
                                textAlign: 'left',
                                wordBreak: 'break-word',
                                overflowWrap: 'anywhere',
                                lineHeight: 1.35,
                              }}
                            >
                              {l.addressText}
                            </div>
                            <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ ...statusBadge, background: `${statusColor(l.status)}35`, color: statusColor(l.status) }}>
                                {statusLabel(l.status)}
                              </span>
                              <span style={{ color: '#374151', fontSize: 12 }}>
                                Updated {formatAppDateTime(l.updatedAt)}
                              </span>
                            </div>
                          </button>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                              gap: 6,
                              minWidth: 0,
                              justifyItems: 'stretch',
                              ...(isNarrow
                                ? {
                                    gridColumn: '1 / -1',
                                    width: '100%',
                                  }
                                : {}),
                            }}
                          >
                            <RowStatusButton
                              label="No cameras"
                              color={statusColor('noCameras')}
                              active={l.status === 'noCameras'}
                              disabled={!canEditL}
                              stretch
                              onClick={() => {
                                setProbativeFlow(null)
                                void updateLocation(actorId, l.id, { status: 'noCameras' })
                              }}
                            />
                            <RowStatusButton
                              label="Needs Follow up"
                              color={statusColor('camerasNoAnswer')}
                              active={l.status === 'camerasNoAnswer'}
                              disabled={!canEditL}
                              stretch
                              onClick={() => {
                                setProbativeFlow(null)
                                void updateLocation(actorId, l.id, { status: 'camerasNoAnswer' })
                              }}
                            />
                            <RowStatusButton
                              label="Not probative"
                              color={statusColor('notProbativeFootage')}
                              active={l.status === 'notProbativeFootage'}
                              disabled={!canEditL}
                              stretch
                              onClick={() => {
                                setProbativeFlow(null)
                                void updateLocation(actorId, l.id, { status: 'notProbativeFootage' })
                              }}
                            />
                            <RowStatusButton
                              label="Probative"
                              color={statusColor('probativeFootage')}
                              active={l.status === 'probativeFootage'}
                              disabled={!canEditL}
                              stretch
                              onClick={() => {
                                if (l.status !== 'probativeFootage') {
                                  setLocationDetailOpen(false)
                                  setSelectedId(l.id)
                                  setProbativeFlow({ step: 'accuracy', target: { kind: 'existing', locationId: l.id } })
                                  return
                                }
                                void updateLocation(actorId, l.id, { status: 'probativeFootage' })
                              }}
                            />
                          </div>
                          {selectedId === l.id ? (
                            <CaseListSelectedLocationPanel
                              key={l.id}
                              location={l}
                              canEdit={canEditL}
                              canDelete={canDelL}
                              footprintLoading={footprintLoadingIds.has(l.id)}
                              footprintFailed={footprintFailedIds.has(l.id)}
                              onNotesChange={(notes) => void updateLocation(actorId, l.id, { notes })}
                              onRemove={() => {
                                if (!window.confirm('Delete this address from the case? This cannot be undone.')) return
                                void deleteLocation(actorId, l.id)
                                setSelectedId(null)
                              }}
                            />
                          ) : null}
                        </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: 12, color: '#374151', flex: 1 }}>No locations in the selected filters.</div>
                  )}
                  {mapLeftToolDockOpen ? (
                    <div
                      role="presentation"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 24,
                        background: 'rgba(17,24,39,0.14)',
                        touchAction: 'none',
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        closeMapToolsDock()
                      }}
                    />
                  ) : null}
                </div>
              )}

              {webToolsArrowOnly ? (
                <div
                  ref={mapToolbarExpandToggleRef}
                  role="presentation"
                  className="case-map-toolbar-expand-anchor"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 0,
                    zIndex: 5110,
                    pointerEvents: 'none',
                  }}
                >
                  <MapPaneEdgeAnchor placement="toolbarOverMap">
                    <MapPaneEdgeToggle
                      placement="toolbarOverMap"
                      expanded={false}
                      ariaLabel="Expand map tools"
                      onClick={() => setWebToolsCollapsed(false)}
                    />
                  </MapPaneEdgeAnchor>
                </div>
              ) : null}

              {wideMapDrawerSeamBottomTab ? (
                <div
                  ref={mapDrawerSeamToggleRef}
                  role="presentation"
                  className="case-map-drawer-seam-anchor"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 0,
                    zIndex: 5100,
                    pointerEvents: 'none',
                  }}
                >
                  <MapPaneEdgeAnchor placement="drawerTopSeam">
                    {caseTab === 'addresses' && viewMode !== 'list' ? (
                      <MapPaneEdgeToggle
                        placement="drawerTopSeam"
                        expanded={false}
                        ariaLabel="Expand address details"
                        onClick={() => setAddressDrawerDetailsOpen(true)}
                      />
                    ) : caseTab === 'tracking' ? (
                      <MapPaneEdgeToggle
                        placement="drawerTopSeam"
                        expanded={false}
                        ariaLabel="Expand step details"
                        onClick={() => setTrackDrawerDetailsOpen(true)}
                      />
                    ) : null}
                  </MapPaneEdgeAnchor>
                </div>
              ) : null}

              {showMapDetailOverlayShell ? (
                <div ref={caseMapDetailOverlayRef} style={mapPaneDetailOverlayStyle}>
                  {wideMapDrawerSeamSheetTopTab ? (
                    <div
                      ref={mapDrawerSeamToggleRef}
                      role="presentation"
                      className="case-map-drawer-seam-sheet-top"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 0,
                        height: 0,
                        zIndex: 5101,
                        pointerEvents: 'none',
                      }}
                    >
                      <MapPaneEdgeAnchor placement="drawerSheetTopSeam">
                        {caseTab === 'addresses' && viewMode !== 'list' ? (
                          <MapPaneEdgeToggle
                            placement="drawerSheetTopSeam"
                            expanded={addressDrawerDetailsOpen}
                            ariaLabel={
                              addressDrawerDetailsOpen ? 'Collapse address details' : 'Expand address details'
                            }
                            onClick={() => setAddressDrawerDetailsOpen((v) => !v)}
                          />
                        ) : caseTab === 'tracking' && selectedTrackPoint ? (
                          <MapPaneEdgeToggle
                            placement="drawerSheetTopSeam"
                            expanded={trackDrawerDetailsOpen}
                            ariaLabel={
                              trackDrawerDetailsOpen ? 'Collapse step details' : 'Expand step details'
                            }
                            onClick={() => setTrackDrawerDetailsOpen((v) => !v)}
                          />
                        ) : null}
                      </MapPaneEdgeAnchor>
                    </div>
                  ) : null}
                  {caseTab === 'addresses' && selected && viewMode !== 'list' && locationDetailOpen ? (
                    <LocationDrawer
                      key={selected.id}
                      layout={mapDetailLayout}
                      detailsOpen={addressDrawerDetailsOpen}
                      onDetailsOpenChange={setAddressDrawerDetailsOpen}
                      location={selected}
                      buildingOutlineLoading={footprintLoadingIds.has(selected.id)}
                      buildingOutlineFailed={footprintFailedIds.has(selected.id)}
                      canEdit={canEditLocation(data, actorId, selected)}
                      canDelete={canDeleteLocation(data, actorId, selected)}
                      onClose={() => {
                        setLocationDetailOpen(false)
                        setProbativeFlow(null)
                      }}
                      onUpdate={(patch) => {
                        if (patch.status != null && patch.status !== 'probativeFootage') {
                          setProbativeFlow(null)
                        }
                        void updateLocation(actorId, selected.id, patch)
                      }}
                      onProbativeRequest={() =>
                        setProbativeFlow({ step: 'accuracy', target: { kind: 'existing', locationId: selected.id } })
                      }
                      onDelete={() => {
                        void deleteLocation(actorId, selected.id)
                        setSelectedId(null)
                      }}
                    />
                  ) : caseTab === 'addresses' && viewMode !== 'list' && !isNarrow && addressDrawerDetailsOpen ? (
                    <WideMapNotesPlaceholder onDismiss={() => setAddressDrawerDetailsOpen(false)} />
                  ) : caseTab === 'tracking' && selectedTrackPoint ? (
                    <TrackPointDrawer
                      key={selectedTrackPoint.id}
                      layout={mapDetailLayout}
                      detailsOpen={trackDrawerDetailsOpen}
                      onDetailsOpenChange={setTrackDrawerDetailsOpen}
                      point={selectedTrackPoint}
                      trackLabel={selectedTrackLabel}
                      stepIndex={selectedTrackPointStepIndex}
                      canEdit={canEditTrackPoint(data, actorId, selectedTrackPoint)}
                      canDelete={canDeleteTrackPoint(data, actorId, selectedTrackPoint)}
                      onClose={() => setSelectedTrackPointId(null)}
                      onUpdate={(patch) => void updateTrackPoint(actorId, selectedTrackPoint.id, patch)}
                      onDelete={() => {
                        void deleteTrackPoint(actorId, selectedTrackPoint.id)
                        setSelectedTrackPointId(null)
                        setTrackStepUndoTargetId(null)
                      }}
                    />
                  ) : caseTab === 'tracking' && !isNarrow && trackDrawerDetailsOpen ? (
                    <WideMapTrackStepPlaceholder onDismiss={() => setTrackDrawerDetailsOpen(false)} />
                  ) : null}
                </div>
              ) : null}
          </div>
        </div>
      </WorkspaceShell>
      </Layout>

    <Modal
      title="Add location"
      open={pendingAddQueue.length > 0}
      onClose={() => {
        closeAddLocationModal()
      }}
    >
      {pendingAdd ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>
            Selected point
            {pendingAddQueue.length > 1 ? (
              <span style={{ fontWeight: 600, color: '#6b7280' }}> · {pendingAddQueue.length - 1} more queued</span>
            ) : null}
          </div>
          <div style={{ fontWeight: 900, lineHeight: 1.2 }}>{pendingAdd.addressText}</div>
          {isProvisionalCanvassLabel(pendingAdd.addressText) ? (
            <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600 }}>Looking up street address…</div>
          ) : null}
          <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>Select a category to add to the list.</div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['noCameras', 'camerasNoAnswer', 'notProbativeFootage', 'probativeFootage'] as const).map((s) => (
              <button
                key={s}
                onClick={async () => {
                  if (addLocationSaving || addCategoryInFlightRef.current) return
                  const snapshot = pendingAdd
                  if (s === 'probativeFootage') {
                    setProbativeFlow({ step: 'accuracy', target: { kind: 'new', pending: snapshot } })
                    return
                  }
                  addCategoryInFlightRef.current = true
                  const { lat, lon, bounds, vectorTileBuildingRing } = snapshot
                  const { addressText } = snapshot
                  setAddLocationSaving(true)
                  try {
                    const id = await createLocation({
                      caseId: props.caseId,
                      createdByUserId: actorId,
                      addressText,
                      lat,
                      lon,
                      bounds: bounds ?? null,
                      status: s,
                    })
                    closeAddLocationModal()
                    setLocationDetailOpen(false)
                    setSelectedId(id)
                    enqueueOutlineForLocation(id, lat, lon, addressText, vectorTileBuildingRing ?? null)

                    if (isProvisionalCanvassLabel(addressText)) {
                      const lat0 = lat
                      const lon0 = lon
                      void (async () => {
                        const signal =
                          typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
                            ? AbortSignal.timeout(12_000)
                            : undefined
                        const resolved = await reverseGeocodeAddressText(lat0, lon0, signal).catch(() => null)
                        if (resolved?.trim() && !isProvisionalCanvassLabel(resolved)) {
                          void updateLocation(actorId, id, { addressText: resolved.trim() })
                        }
                      })()
                    }
                  } finally {
                    setAddLocationSaving(false)
                    addCategoryInFlightRef.current = false
                  }
                }}
                disabled={addLocationSaving}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 999,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 12,
                  borderColor: statusColor(s),
                  background: addLocationSaving ? 'white' : `${statusColor(s)}22`,
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
            <button
              type="button"
              style={btn}
              onClick={() => closeAddLocationModal()}
              disabled={addLocationSaving}
              title={addLocationSaving ? 'Saving…' : 'Close'}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      </Modal>

    <Modal
      title="Add track"
      open={showAddTrack}
      onClose={() => setShowAddTrack(false)}
    >
      <div style={{ display: 'grid', gap: 12, minWidth: 0, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Track type</span>
          <select
            value={addTrackKind}
            onChange={(e) => setAddTrackKind(e.target.value as Track['kind'])}
            style={{ ...select, width: '100%' }}
          >
            <option value="person">Person</option>
            <option value="vehicle">Vehicle</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Name</span>
          <input
            value={addTrackLabel}
            onChange={(e) => setAddTrackLabel(e.target.value)}
            style={field}
            placeholder="e.g. Subject A"
            autoFocus={!isNarrow}
            onFocus={(e) => {
              if (!isNarrow) return
              const el = e.currentTarget
              window.setTimeout(() => {
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
              }, 280)
            }}
          />
        </label>
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            minWidth: 0,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <button type="button" style={btn} onClick={() => setShowAddTrack(false)}>
            Cancel
          </button>
          <button
            type="button"
            style={{ ...btn, fontWeight: 900 }}
            disabled={!canAddCaseContentHere}
            onClick={() => {
              const label = addTrackLabel.trim() || `Track ${caseTracks.length + 1}`
              void createTrack({ caseId: props.caseId, createdByUserId: actorId, label, kind: addTrackKind }).then((id) => {
                setShowAddTrack(false)
                setSelectedTrackPointId(null)
                setAutoContinuationTrackId(id)
                setVisibleTrackIds((prev) => ({ ...prev, [id]: true }))
              })
            }}
          >
            Add track
          </button>
        </div>
      </div>
    </Modal>

    <Modal
      title="Manage tracks"
      open={showManageTracks}
      onClose={() => setShowManageTracks(false)}
    >
      <div style={{ display: 'grid', gap: 10, minWidth: 0, width: '100%', maxWidth: '100%' }}>
        {caseTracks.map((t) => {
          const canEditT = canEditTrack(data, actorId, t)
          const canDelT = canDeleteTrack(data, actorId, t)
          const colorInput = (
            <input
              type="color"
              value={resolvedTrackColors.get(t.id) ?? TRACK_DEFAULT_COLORS_FIRST_FOUR[0]}
              disabled={!canEditT}
              onChange={(e) => void updateTrack(actorId, t.id, { routeColor: e.target.value })}
              title="First four tracks default to blue, red, green, purple by creation order; later tracks get a unique auto color. You can pick any color, including one already in use."
              style={{
                width: 40,
                height: 34,
                padding: 0,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />
          )
          const kindSelect = (
            <select
              value={t.kind}
              disabled={!canEditT}
              onChange={(e) => void updateTrack(actorId, t.id, { kind: e.target.value as Track['kind'] })}
              style={{
                ...select,
                width: isNarrow ? 'min(160px, 100%)' : undefined,
                flex: isNarrow ? '1 1 140px' : undefined,
                minWidth: 0,
              }}
            >
              <option value="person">Person</option>
              <option value="vehicle">Vehicle</option>
              <option value="other">Other</option>
            </select>
          )
          const deleteCell = canDelT ? (
            <button
              type="button"
              style={{ ...btnDanger, flex: isNarrow ? '1 1 120px' : undefined, minWidth: 0, boxSizing: 'border-box' }}
              onClick={() => {
                void deleteTrack(actorId, t.id).then(() => {
                  setVisibleTrackIds((prev) => {
                    const next = { ...prev }
                    delete next[t.id]
                    return next
                  })
                })
              }}
              title="Delete track and its steps"
            >
              Delete
            </button>
          ) : (
            <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
          )
          return (
            <div key={t.id} style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
              {isNarrow ? (
                <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                  <input
                    value={t.label}
                    readOnly={!canEditT}
                    onChange={(e) => void updateTrack(actorId, t.id, { label: e.target.value })}
                    style={field}
                  />
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      minWidth: 0,
                      width: '100%',
                    }}
                  >
                    {kindSelect}
                    {colorInput}
                    {deleteCell}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(88px, 120px) 40px auto',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <input
                    value={t.label}
                    readOnly={!canEditT}
                    onChange={(e) => void updateTrack(actorId, t.id, { label: e.target.value })}
                    style={field}
                  />
                  {kindSelect}
                  {colorInput}
                  {deleteCell}
                </div>
              )}
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            style={btnDanger}
            disabled={!caseTracks.length || !canDeleteAllTracksHere}
            title={
              !canDeleteAllTracksHere
                ? 'Only the case owner can delete all tracks'
                : caseTracks.length
                  ? 'Remove every track and all steps for this case'
                  : 'No tracks to remove'
            }
            onClick={() => {
              if (!caseTracks.length) return
              if (
                !window.confirm('Delete all tracks and every step on them for this case? This cannot be undone.')
              )
                return
              void deleteAllTracksForCase(actorId, props.caseId).then(() => {
                setAutoContinuationTrackId(null)
                setVisibleTrackIds({})
                setSelectedTrackPointId(null)
              })
            }}
          >
            Delete all tracks
          </button>
        </div>
      </div>
    </Modal>

    <Modal
      title="Add route marker?"
      open={postProbativeMarkerPhase != null}
      onClose={() => setPostProbativeMarkerPhase(null)}
      zBase={63000}
    >
      {postProbativeMarkerPhase === 'ask' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
            Add a step on a subject track for where the subject was last seen on this probative footage?
          </p>
          {caseTracks.length > 0 ? (
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Track</span>
              <select
                value={postProbativeEffectiveTrackId}
                onChange={(e) => setPostProbativePickTrackId(e.target.value)}
                style={select}
              >
                {caseTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {caseTracks.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: '#4b5563', lineHeight: 1.45 }}>
              With no subject track yet, Yes creates one named “Track {caseTracks.length + 1}” first.
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" style={btn} onClick={() => setPostProbativeMarkerPhase(null)}>
              No
            </button>
            <button
              type="button"
              style={{ ...btn, fontWeight: 900 }}
              onClick={() => {
                if (caseTracks.length === 0) {
                  const label = `Track ${caseTracks.length + 1}`
                  void createTrack({ caseId: props.caseId, createdByUserId: actorId, label, kind: 'person' }).then((id) => {
                    probativePlacementLockRef.current = false
                    setVisibleTrackIds((prev) => ({ ...prev, [id]: true }))
                    setProbativePlacementSession({ trackId: id })
                    setAutoContinuationTrackId(id)
                    setWorkspaceViewMode('map')
                    setPostProbativeMarkerPhase(null)
                  })
                  return
                }
                const tid = postProbativeEffectiveTrackId
                if (!tid) return
                probativePlacementLockRef.current = false
                setProbativePlacementSession({ trackId: tid })
                setAutoContinuationTrackId(tid)
                setWorkspaceViewMode('map')
                setPostProbativeMarkerPhase(null)
              }}
            >
              Yes
            </button>
          </div>
        </div>
      ) : null}
    </Modal>

    <ProbativeDvrFlowModals
      step={probativeFlow?.step ?? null}
      onAccuracyAccurate={handleProbativeAccurate}
      onAccuracyNotAccurate={handleProbativeNotAccurate}
      onDismiss={handleProbativeFlowDismiss}
      onCalcBack={handleProbativeCalcBack}
      onCalcApply={handleProbativeCalcApply}
    />

    <Modal
      title="Link DVR result to address"
      open={dvrLinkLocationSession != null}
      zBase={62500}
      onClose={() => {
        if (dvrLinkSaving) return
        clearDvrLinkLocationUi()
      }}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0, color: '#374151', fontSize: 14, lineHeight: 1.5 }}>
          Search for the canvass location that matches this DVR note. Then choose whether the footage there was probative or
          not.
        </p>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 12, color: '#6b7280' }}>Address</div>
          <input
            value={dvrLinkAddr}
            onChange={(e) => {
              setDvrLinkAddr(e.target.value)
              setDvrLinkPicked(null)
            }}
            placeholder={GEOCODE_SCOPE === 'ny' ? 'Search NY address…' : 'Search address…'}
            disabled={dvrLinkSaving}
            style={{
              ...field,
              maxWidth: '100%',
              boxSizing: 'border-box',
              fontSize: isNarrow ? 16 : 13,
            }}
          />
          {GEOCODE_SCOPE === 'ny' ? (
            <div style={{ color: '#374151', fontSize: 12, lineHeight: 1.35 }}>Autocomplete is scoped to New York.</div>
          ) : null}
          {dvrLinkLoading ? <div style={{ color: '#374151', fontSize: 12 }}>Searching…</div> : null}
          {dvrLinkSug.length ? (
            <div
              style={{
                display: 'grid',
                gap: 4,
                maxHeight: 'min(200px, 32vh)',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {dvrLinkSug.map((s) => (
                <button
                  key={`dvr-link-${s.lat},${s.lon},${s.label}`}
                  type="button"
                  style={suggestionBtn}
                  disabled={dvrLinkSaving}
                  onClick={() => setDvrLinkPicked(s)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : dvrLinkAddr.trim().length >= 3 && !dvrLinkLoading ? (
            /^\d{1,4}-\d{1,4}$/.test(dvrLinkAddr.trim()) ? (
              <div style={{ color: '#374151', fontSize: 12, lineHeight: 1.35 }}>
                Add the street name after the house number (e.g., ‘120-37 170 Street’).
              </div>
            ) : (
              <div style={{ color: '#374151', fontSize: 12 }}>No suggestions. Try adding city/state.</div>
            )
          ) : null}
        </div>
        {dvrLinkPicked ? (
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 12,
              background: '#f9fafb',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>{dvrLinkPicked.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btn} disabled={dvrLinkSaving} onClick={() => setDvrLinkPicked(null)}>
                Choose different address
              </button>
              <button
                type="button"
                style={{ ...btn, borderColor: '#7c2d12', color: '#7c2d12' }}
                disabled={dvrLinkSaving}
                onClick={() => void submitDvrLinkLocation(false)}
              >
                Not probative
              </button>
              <button
                type="button"
                style={btnPrimary}
                disabled={dvrLinkSaving}
                onClick={() => void submitDvrLinkLocation(true)}
              >
                {dvrLinkSaving ? 'Saving…' : 'Probative'}
              </button>
            </div>
          </div>
        ) : null}
        {!canAddCaseContentHere ? (
          <div style={{ color: '#b45309', fontSize: 13, fontWeight: 700 }}>You don&apos;t have access to add locations here.</div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" style={btn} disabled={dvrLinkSaving} onClick={() => clearDvrLinkLocationUi()}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>

    <Modal
      title="Add photo"
      open={addPhotoModalOpen}
      onClose={() => {
        if (!refPhotoBusy) setAddPhotoModalOpen(false)
      }}
      zBase={photoViewerIndex != null ? 62500 : 61500}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Image type</div>
        <select
          value={pendingAddKind}
          onChange={(e) => setPendingAddKind(e.target.value as CaseAttachmentKind)}
          style={{ ...select, width: '100%', boxSizing: 'border-box' }}
          disabled={refPhotoBusy}
          aria-label="Image type"
        >
          <option value="suspect_description">{caseAttachmentKindLabel('suspect_description')}</option>
          <option value="wanted_flyer">{caseAttachmentKindLabel('wanted_flyer')}</option>
          <option value="other">{caseAttachmentKindLabel('other')}</option>
        </select>
        {refPhotoErr ? (
          <div style={{ color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>{refPhotoErr}</div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" style={btn} disabled={refPhotoBusy} onClick={() => setAddPhotoModalOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            style={btnPrimary}
            disabled={refPhotoBusy}
            onClick={() => {
              setRefPhotoErr(null)
              refPhotoInputRef.current?.click()
            }}
          >
            {refPhotoBusy ? 'Processing…' : 'Choose image…'}
          </button>
        </div>
      </div>
    </Modal>

    <Modal
      wide
      title={
        photoViewerIndex != null && caseAttachments.length
          ? `Photo ${photoViewerIndex + 1} of ${caseAttachments.length}`
          : 'Photo'
      }
      open={photoViewerIndex != null && caseAttachments.length > 0}
      onClose={() => setPhotoViewerIndex(null)}
      zBase={62000}
    >
      {photoViewerIndex != null && caseAttachments[photoViewerIndex] ? (
        (() => {
          const vAtt = caseAttachments[photoViewerIndex]!
          const canEditV = canEditCaseAttachment(data, actorId, vAtt)
          const canDelV = canDeleteCaseAttachment(data, actorId, vAtt)
          const n = caseAttachments.length
          const go = (d: number) =>
            setPhotoViewerIndex((idx) => {
              if (idx == null || n < 2) return idx
              return (idx + d + n) % n
            })
          const narrowPhotoImgMax =
            isNarrow && photoViewerCaptionFocused
              ? 'min(22dvh, 130px)'
              : isNarrow
                ? 'min(38dvh, 280px)'
                : 'min(52vh, 520px)'
          return (
            <div style={{ display: 'grid', gap: isNarrow ? 10 : 14 }}>
              <div
                style={{
                  position: 'relative',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#0f172a',
                  flexShrink: isNarrow ? 1 : undefined,
                  minHeight: isNarrow && photoViewerCaptionFocused ? 80 : isNarrow ? 120 : 200,
                  maxHeight: isNarrow && photoViewerCaptionFocused ? 150 : undefined,
                }}
              >
                {n > 1 ? (
                  <>
                    <button
                      type="button"
                      aria-label="Previous photo"
                      onClick={() => go(-1)}
                      style={casePhotoCarouselArrowStyle('left')}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      aria-label="Next photo"
                      onClick={() => go(1)}
                      style={casePhotoCarouselArrowStyle('right')}
                    >
                      ›
                    </button>
                  </>
                ) : null}
                <img
                  src={vAtt.imageDataUrl}
                  alt=""
                  style={{
                    width: '100%',
                    maxHeight: narrowPhotoImgMax,
                    objectFit: 'contain',
                    display: 'block',
                    margin: '0 auto',
                  }}
                />
              </div>
              {canEditV ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>Description</div>
                  <textarea
                    ref={photoCaptionTextareaRef}
                    placeholder="Description (optional)"
                    value={photoViewerCaptionDraft}
                    onChange={(e) => setPhotoViewerCaptionDraft(e.target.value)}
                    rows={1}
                    enterKeyHint="done"
                    name="vc-case-photo-note"
                    id="vc-case-photo-note"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck
                    inputMode="text"
                    onFocus={(e) => {
                      setPhotoViewerCaptionFocused(true)
                      window.requestAnimationFrame(() => {
                        const el = e.currentTarget
                        el.style.height = 'auto'
                        const cap = isNarrow ? 200 : 280
                        el.style.height = `${Math.min(el.scrollHeight, cap)}px`
                      })
                    }}
                    onBlur={(e) => {
                      setPhotoViewerCaptionFocused(false)
                      const v = e.target.value.trim()
                      if (v !== (vAtt.caption ?? '').trim()) {
                        void updateCaseAttachment(actorId, vAtt.id, { caption: v })
                      }
                    }}
                    style={{
                      ...field,
                      width: '100%',
                      boxSizing: 'border-box',
                      resize: 'none',
                      overflowY: 'auto',
                      minHeight: 44,
                      lineHeight: 1.35,
                    }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.4 }}>
                  {(vAtt.caption ?? '').trim() ? vAtt.caption : '—'}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#6b7280' }}>{caseAttachmentKindLabel(vAtt.kind)}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>All photos</div>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    overflowX: 'auto',
                    paddingBottom: 6,
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {caseAttachments.map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setPhotoViewerIndex(i)
                        setSidebarMediaIndex(i)
                      }}
                      style={{
                        flexShrink: 0,
                        width: 64,
                        height: 64,
                        padding: 0,
                        border:
                          i === photoViewerIndex ? '3px solid #111827' : '1px solid #e5e7eb',
                        borderRadius: 8,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        background: '#f9fafb',
                        boxSizing: 'border-box',
                      }}
                      aria-label={`Photo ${i + 1}`}
                      aria-current={i === photoViewerIndex ? 'true' : undefined}
                    >
                      <img
                        src={a.imageDataUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </button>
                  ))}
                </div>
              </div>
              {canDelV || canAddCaseContentHere ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {canDelV ? (
                    <button
                      type="button"
                      style={{
                        ...btnDanger,
                        flex: 1,
                        minWidth: 0,
                        boxSizing: 'border-box',
                      }}
                      onClick={() => {
                        const len = caseAttachments.length
                        const idx = photoViewerIndex
                        void deleteCaseAttachment(actorId, vAtt.id).then(() => {
                          if (len <= 1) setPhotoViewerIndex(null)
                          else setPhotoViewerIndex(Math.min(idx ?? 0, len - 2))
                          setSidebarMediaIndex((s) => Math.min(s, Math.max(0, len - 2)))
                        })
                      }}
                    >
                      Remove photo
                    </button>
                  ) : null}
                  {canAddCaseContentHere ? (
                    <button
                      type="button"
                      style={{
                        ...btnPrimary,
                        flex: 1,
                        minWidth: 0,
                        boxSizing: 'border-box',
                      }}
                      onClick={() => setAddPhotoModalOpen(true)}
                    >
                      Add photo
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })()
      ) : null}
    </Modal>
    </>
  )
}
