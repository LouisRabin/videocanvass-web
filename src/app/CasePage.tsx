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
import { DvrCalculatorStep, ProbativeDvrFlowModals } from './ProbativeDvrFlow'
import { CASE_DESCRIPTION_MAX_CHARS, clampCaseDescription } from '../lib/caseMeta'
import {
  getMobileOS,
  nativeMobileSearchInputProps,
  nativeMobileTextInputProps,
  nativeMobileTextareaProps,
} from '../lib/mobilePlatform'
import { getGeolocationPermissionState, requestCurrentPosition } from '../lib/geolocationRequest'
import { useTargetMode } from '../lib/targetMode'

// See docs/CODEMAP.md; geocode/footprint policy in HANDOFF.md.

import {
  appendToNotes,
  casePhotoCarouselArrowStyle,
  extendBoundsWithLocations,
  extendBoundsWithPathPoints,
  findLocationByAddressText,
  findLocationHitByMapClick,
  formatAddressLineForMapList,
  isProvisionalCanvassLabel,
  LIST_STATUS_SORT_ORDER,
  OUTLINE_CONCURRENCY,
  type PendingAddItem,
  readStoredCaseMapFocus,
  samePendingPin,
  sortTrackPointsStable,
  writeStoredCaseMapFocus,
} from './casePageHelpers'

import { buildVisitDensityHeatmapCollection } from './addressesMapLibreHelpers'

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
  select,
  statusBadge,
  suggestionBtn,
  viewModeBtn,
} from './case/CasePageChrome'
import { useCaseGeocodeSearch } from './case/hooks/useCaseGeocodeSearch'
import { useMapPaneOutsideDismiss } from './case/hooks/useMapPaneOutsideDismiss'
import { WebCaseWorkspace } from './case/web/WebCaseWorkspace'
import { CaseAttachmentImage } from './CaseAttachmentImage'
import { useTour } from './tour/TourContext'
import { TOUR_UI_ENABLED } from './tour/tourFlags'
import { VC_TOUR } from './tour/tourSteps'

/** Longer than AddressesMapLibre SINGLE_TAP_DEFER_MS (270) so open + deferred map tap don't dismiss the dock. */
const MAP_TOOLS_DOCK_OUTSIDE_GRACE_MS = 350
/** Ignore the very next map press after dismissing address search so it does not select/add. */
const ADDR_DISMISS_GRACE_MS = 360
/** After closing floating address search, block map click handling this long (longer than SINGLE_TAP_DEFER_MS). */
const ADDR_MAP_INTERACTION_FREEZE_MS = 450
/** Default inset below map canvas (attribution / breathing room). */
const MAP_CANVAS_BOTTOM_RESERVE = 'clamp(8px, 1.2vw, 14px)'

/** Wide web: notes seam expanded with no map selection — no full white “dead” bar; only this sheet when opened. */
function WideMapNotesPlaceholder(props: { onDismiss: () => void }) {
  return (
    <div
      style={{
        ...card,
        position: 'relative',
        width: 'min(980px, calc(100% - 48px))',
        margin: '0 auto',
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
        width: 'min(980px, calc(100% - 48px))',
        margin: '0 auto',
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
        Select a location on the map to view and edit notes, status, and building outline for that address.
      </div>
    </div>
  )
}

function EyeOpenIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={2} />
    </svg>
  )
}

function EyeClosedIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2 2l20 20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

function TrackMapVisibilityButton(props: {
  visible: boolean
  trackLabel: string
  variant: 'mapDockGlass' | 'mapDockLight' | 'modal'
  onToggle: () => void
}) {
  const { visible, trackLabel, variant, onToggle } = props
  const glass = variant === 'mapDockGlass'
  const btn: CSSProperties = {
    flexShrink: 0,
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxSizing: 'border-box',
    ...(glass
      ? {
          border: '1px solid rgba(255,255,255,0.22)',
          background: visible ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
          color: visible ? '#f8fafc' : 'rgba(203,213,225,0.72)',
          opacity: visible ? 1 : 0.78,
        }
      : {
          border: '1px solid #e5e7eb',
          background: visible ? '#ffffff' : '#f3f4f6',
          color: visible ? '#111827' : '#9ca3af',
          opacity: visible ? 1 : 0.9,
        }),
  }
  return (
    <button
      type="button"
      aria-label={visible ? `Hide “${trackLabel}” on map` : `Show “${trackLabel}” on map`}
      aria-pressed={visible}
      title={visible ? 'Hide path on map' : 'Show path on map'}
      onClick={onToggle}
      style={btn}
    >
      {visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
    </button>
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
  const canUseVisitHeatmap = props.currentUser.appRole === 'admin'
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
  const { startTour, tourOpen } = useTour()
  const mobileOS = useMemo(() => (targetMode === 'mobile' ? getMobileOS() : null), [targetMode])
  const [geoBias, setGeoBias] = useState<{ lat: number; lon: number } | null>(null)
  const mapRef = useRef<UnifiedCaseMapHandle | null>(null)
  const mapSearchCenterFallback = useCallback(() => mapRef.current?.getCenter() ?? null, [])
  const [mapLeftToolDockOpen, setMapLeftToolDockOpen] = useState(false)
  type MapToolsDockSection = 'filters' | 'views' | 'photos' | 'tracks' | 'dvr'
  const [mapLeftToolSection, setMapLeftToolSection] = useState<null | MapToolsDockSection>(null)
  /** Wide web: show Locations in sidebar only after List view is chosen; cleared by any other toolbar action. */
  const [wideSidebarListReveal, setWideSidebarListReveal] = useState(false)
  /** Full height of wide map tool pill (px); panel top = below pill with gap. */
  const [webWideMapDockPillFullPx, setWebWideMapDockPillFullPx] = useState(96)
  const { clear: clearQuickMenuSearch } = useCaseGeocodeSearch('', {
    bias: geoBias,
    mapCenterFallback: mapSearchCenterFallback,
  })
  const [dvrLinkLocationSession, setDvrLinkLocationSession] = useState<null | { notesAppend: string }>(null)
  const {
    query: dvrLinkAddr,
    setQuery: setDvrLinkAddr,
    results: dvrLinkSug,
    setResults: setDvrLinkSug,
    loading: dvrLinkLoading,
  } = useCaseGeocodeSearch('', {
    enabled: !!dvrLinkLocationSession,
    bias: geoBias,
    mapCenterFallback: mapSearchCenterFallback,
  })
  const [dvrLinkPicked, setDvrLinkPicked] = useState<null | PlaceSuggestion>(null)
  const [dvrLinkSaving, setDvrLinkSaving] = useState(false)
  const [detailOverlayHeightPx, setDetailOverlayHeightPx] = useState(0)
  useEffect(() => {
    if (isNarrow) {
      setMapLeftToolDockOpen(false)
      setMapLeftToolSection(null)
      setWideSidebarListReveal(false)
    }
  }, [isNarrow])

  const mapToolsDockRef = useRef<HTMLDivElement>(null)
  /** Ignore outside-dismiss until this time (performance.now ms) so open + deferred map tap don't instantly close. */
  const mapToolsDockIgnoreOutsideUntilRef = useRef(0)
  const narrowMapAddressRef = useRef<HTMLDivElement>(null)
  const narrowMapBottomChromeRef = useRef<HTMLDivElement>(null)
  const mapPaneShellRef = useRef<HTMLDivElement>(null)
  const caseMapDetailOverlayRef = useRef<HTMLDivElement>(null)
  const mapDrawerSeamToggleRef = useRef<HTMLDivElement>(null)
  const webWideMapDockPillRef = useRef<HTMLDivElement>(null)
  const addrSearchInputRef = useRef<HTMLInputElement>(null)
  /** After address search dismiss, `performance.now()` deadline for ignoring map taps (see ADDR_MAP_INTERACTION_FREEZE_MS). */
  const addrMapInteractionFreezeUntilRef = useRef(0)
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
  /** Mobile list: notes in a modal instead of expanding the row. */
  const [listAddressNotesForId, setListAddressNotesForId] = useState<string | null>(null)
  /** Map list: one row expanded at a time for actions + status (collapsed shows address + badge + updated only). */
  const [listRowExpandedId, setListRowExpandedId] = useState<string | null>(null)
  const listNotesLocation = useMemo(
    () =>
      listAddressNotesForId
        ? data.locations.find((lo) => lo.id === listAddressNotesForId) ?? null
        : null,
    [data.locations, listAddressNotesForId],
  )
  const selected = useMemo(() => (selectedId ? locations.find((l) => l.id === selectedId) ?? null : null), [locations, selectedId])

  useEffect(() => {
    if (!selectedId) setLocationDetailOpen(false)
  }, [selectedId])

  useEffect(() => {
    setListAddressNotesForId(null)
    setListRowExpandedId(null)
  }, [props.caseId])

  useEffect(() => {
    if (!listAddressNotesForId) return
    if (!data.locations.some((l) => l.id === listAddressNotesForId)) {
      setListAddressNotesForId(null)
    }
  }, [data.locations, listAddressNotesForId])

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
  useEffect(() => {
    if (caseTab !== 'addresses') setWideSidebarListReveal(false)
  }, [caseTab])
  useEffect(() => {
    if (caseTab !== 'addresses' || viewMode !== 'list') {
      setListRowExpandedId(null)
    }
  }, [caseTab, viewMode])

  useEffect(() => {
    setListRowExpandedId((exp) => {
      if (exp == null) return null
      if (selectedId == null) return null
      return exp === selectedId ? exp : null
    })
  }, [selectedId])

  const setWorkspaceViewMode = useCallback(
    (nextViewMode: 'map' | 'list') => {
      const resolvedView = caseTab === 'tracking' ? 'map' : nextViewMode
      setWorkspaceMode((prev) => {
        const next = prev.caseTab === 'tracking' ? { caseTab: prev.caseTab, viewMode: 'map' as const } : { ...prev, viewMode: nextViewMode }
        return prev.caseTab === next.caseTab && prev.viewMode === next.viewMode ? prev : next
      })
      if (!isNarrow && resolvedView === 'map') {
        setWideSidebarListReveal(false)
      }
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
      setMapLeftToolSection(null)
    }
  }, [isNarrow])

  useLayoutEffect(() => {
    if (isNarrow) return
    if (caseTab !== 'tracking' && caseTab !== 'addresses') return
    const el = webWideMapDockPillRef.current
    if (!el) return
    const measure = () => {
      setWebWideMapDockPillFullPx(Math.max(40, el.offsetHeight))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isNarrow, caseTab, mapLeftToolSection])

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

  const [visitHeatmapOn, setVisitHeatmapOn] = useState(false)

  useEffect(() => {
    if (!canUseVisitHeatmap) setVisitHeatmapOn(false)
  }, [canUseVisitHeatmap])
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

  const visitHeatmapGeojson = useMemo(
    () =>
      canUseVisitHeatmap
        ? buildVisitDensityHeatmapCollection(locations, caseTrackPoints, props.caseId)
        : null,
    [canUseVisitHeatmap, locations, caseTrackPoints, props.caseId],
  )
  const [trackLabelDrafts, setTrackLabelDrafts] = useState<Record<string, string>>({})
  const trackLabelFocusRef = useRef<Record<string, boolean>>({})
  const trackLabelDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})

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

  /** Keep wide tracking details expanded while switching between points; collapse only when selection clears. */
  useEffect(() => {
    if (!selectedTrackPointId) setTrackDrawerDetailsOpen(false)
  }, [selectedTrackPointId])

  /** Collapse wide notes sheet when nothing is selected; keep open when switching between pins. */
  useEffect(() => {
    if (!selectedId) setAddressDrawerDetailsOpen(false)
  }, [selectedId])

  useEffect(() => {
    if (caseTab === 'addresses' && viewMode === 'list') setAddressDrawerDetailsOpen(false)
  }, [caseTab, viewMode])

  const onTabLongPressSwitchToTracking = useCallback(() => {
    setWorkspaceCaseTab('tracking')
  }, [setWorkspaceCaseTab])

  const onTabLongPressSwitchToAddresses = useCallback(() => {
    setWorkspaceCaseTab('addresses')
  }, [setWorkspaceCaseTab])

  const onTrackingUnselectedFeatureLongPress = useCallback(
    (payload: { kind: 'track' | 'loc'; id: string }) => {
      if (!window.confirm('Switch to Video canvassing mode?')) return
      setWorkspaceCaseTab('addresses')
      setSelectedTrackPointId(null)
      if (payload.kind === 'loc') {
        setSelectedId(payload.id)
        setLocationDetailOpen(true)
      }
    },
    [setWorkspaceCaseTab],
  )

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
    setTrackLabelDrafts((prev) => {
      const next: Record<string, string> = {}
      for (const t of caseTracks) {
        next[t.id] = trackLabelFocusRef.current[t.id] ? (prev[t.id] ?? t.label) : t.label
      }
      return next
    })
  }, [caseTracks])

  useEffect(() => {
    return () => {
      for (const key of Object.keys(trackLabelDebounceRef.current)) {
        const timer = trackLabelDebounceRef.current[key]
        if (timer) clearTimeout(timer)
      }
    }
  }, [])

  const flushTrackLabelPersist = useCallback(
    (trackId: string, label: string) => {
      const timer = trackLabelDebounceRef.current[trackId]
      if (timer) {
        clearTimeout(timer)
        trackLabelDebounceRef.current[trackId] = null
      }
      void updateTrack(actorId, trackId, { label })
    },
    [actorId, updateTrack],
  )

  const scheduleTrackLabelPersist = useCallback(
    (trackId: string, label: string) => {
      const timer = trackLabelDebounceRef.current[trackId]
      if (timer) clearTimeout(timer)
      trackLabelDebounceRef.current[trackId] = setTimeout(() => {
        trackLabelDebounceRef.current[trackId] = null
        void updateTrack(actorId, trackId, { label })
      }, 400)
    },
    [actorId, updateTrack],
  )

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
  } = useCaseGeocodeSearch('', { bias: geoBias, mapCenterFallback: mapSearchCenterFallback })
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
  const dismissAddressSearch = useCallback(() => {
    addrMapInteractionFreezeUntilRef.current = performance.now() + ADDR_MAP_INTERACTION_FREEZE_MS
    mapRef.current?.clearPendingMapTap()
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

  const addrSearchMapShieldActive =
    addrAutocompleteEngaged && !probativePlacementSession && (caseTab === 'tracking' || caseTab === 'addresses')

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

  const finalizeDvrOnlyCalculatorApply = useCallback((notesAppend: string) => {
    setProbativeFlow(null)
    setDvrLinkPicked(null)
    setDvrLinkAddr('')
    setDvrLinkSug([])
    setDvrLinkSaving(false)
    setDvrLinkLocationSession({ notesAppend })
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
        finalizeDvrOnlyCalculatorApply(notesAppend)
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
    [completePendingLocation, data.locations, finalizeDvrOnlyCalculatorApply, updateLocation],
  )

  useEffect(() => {
    if (probativeFlow != null) {
      setMapLeftToolSection((s) => (s === 'dvr' ? null : s))
    }
  }, [probativeFlow])

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
    let cancelled = false
    void (async () => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return
      const perm = await getGeolocationPermissionState()
      if (cancelled || perm === 'denied') return
      const res = await requestCurrentPosition({
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 5 * 60 * 1000,
      })
      if (cancelled || !res.ok) return
      setGeoBias({ lat: res.position.coords.latitude, lon: res.position.coords.longitude })
    })()
    return () => {
      cancelled = true
    }
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
    narrowMapAddressRef,
    narrowMapBottomChromeRef,
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

  const focusLocationOnMap = useCallback(
    (l: Location) => {
      setWorkspaceCaseTab('addresses')
      setWorkspaceViewMode('map')
      setSelectedId(l.id)
      setLocationDetailOpen(true)
      closeMapToolsDock()
      window.setTimeout(() => {
        const m = mapRef.current
        if (m) m.flyTo(l.lat, l.lon, Math.max(m.getZoom(), 16), { duration: 0.55 })
      }, 50)
    },
    [closeMapToolsDock, setWorkspaceCaseTab, setWorkspaceViewMode],
  )

  const canManipulateTrackPointFn = useCallback(
    (pointId: string) => {
      const p = caseTrackPoints.find((x) => x.id === pointId)
      return !!p && canEditTrackPoint(data, actorId, p)
    },
    [caseTrackPoints, data, actorId],
  )
  const onSelectTrackPointMap = useCallback((id: string) => setSelectedTrackPointId(id), [])
  const onDoubleTapTrackPointFromMap = useCallback(
    (pointId: string) => {
      if (!caseTrackPoints.some((x) => x.id === pointId)) return
      setWorkspaceCaseTab('tracking')
      setSelectedTrackPointId(pointId)
      setTrackDrawerDetailsOpen(true)
      closeMapToolsDock()
    },
    [caseTrackPoints, setWorkspaceCaseTab, closeMapToolsDock],
  )
  const onDoubleTapLocationFromMap = useCallback(
    (locationId: string) => {
      if (!locations.some((l) => l.id === locationId)) return
      setWorkspaceCaseTab('addresses')
      setWorkspaceViewMode('map')
      setSelectedId(locationId)
      setLocationDetailOpen(true)
      setAddressDrawerDetailsOpen(true)
      closeMapToolsDock()
    },
    [locations, setWorkspaceCaseTab, setWorkspaceViewMode, closeMapToolsDock],
  )
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
      addDisabled: !(probativePlacementSession?.trackId ?? trackForMapAdd) || addrSearchMapShieldActive,
    }),
    [
      caseTrackPoints,
      visibleTrackIds,
      trackForMapAdd,
      probativePlacementSession,
      addrSearchMapShieldActive,
      props.caseId,
      createTrackPoint,
      onSelectTrackPointMap,
      canManipulateTrackPointFn,
      actorId,
    ],
  )

  const workspaceGridStyle = useMemo<CSSProperties>(
    () =>
      isNarrow
        ? {
            display: 'grid',
            gridTemplateColumns: '1fr',
            gridTemplateRows: 'minmax(0, 1fr)',
            gridTemplateAreas: '"map"',
            gap: 'clamp(4px, 0.9vw, 10px)',
            alignItems: 'stretch',
            flex: 1,
            minHeight: 0,
            minWidth: 0,
          }
        : {
            display: 'grid',
            gridTemplateColumns: '1fr',
            gridTemplateRows: 'minmax(0, 1fr)',
            gridTemplateAreas: '"map"',
            gap: 0,
            alignItems: 'stretch',
            flex: 1,
            minHeight: 0,
            minWidth: 0,
          },
    [isNarrow],
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
  const showWideMapDrawerSeam = !isNarrow && (caseTab === 'addresses' || caseTab === 'tracking')
  /** Bottom-center tab (compact): hidden while sheet is expanded — handle moves to top of sheet. */
  const wideMapDrawerSeamBottomTab =
    showWideMapDrawerSeam &&
    !(
      (caseTab === 'addresses' && addressDrawerDetailsOpen) ||
      (caseTab === 'tracking' && trackDrawerDetailsOpen)
    )
  /** Wide: white notes/track sheet should paint (collapsed ⇒ display none on overlay). */
  const wideMapDetailPanelOpen =
    !isNarrow &&
    showWideMapDrawerSeam &&
    (caseTab === 'addresses' ? addressDrawerDetailsOpen : trackDrawerDetailsOpen)
  /** Flush map canvas to card bottom on wide map views — removes idle white strip from bottom inset. */
  const wideMapUsesFullBleedMapCanvas = !isNarrow && (caseTab === 'tracking' || caseTab === 'addresses')
  const mapStackBottom: CSSProperties['bottom'] = wideMapUsesFullBleedMapCanvas ? 0 : MAP_CANVAS_BOTTOM_RESERVE
  const showMapDetailOverlayShell =
    (caseTab === 'tracking' && (!isNarrow || !!selectedTrackPoint)) ||
    (caseTab === 'addresses' && (!isNarrow || (!!selected && locationDetailOpen)))
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
    ...(!isNarrow && wideMapDetailPanelOpen
      ? {
          background: 'transparent',
          borderTop: 'none',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }
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

  const renderAddAddressSearch = (floating: boolean, opts?: { glassChrome?: boolean; narrowCondensed?: boolean }) => {
    const glass = opts?.glassChrome === true
    const narrowCondensed = opts?.narrowCondensed === true && isNarrow
    const hintColor = glass ? 'rgba(226, 232, 240, 0.9)' : '#374151'
    const glassInput: CSSProperties = glass
      ? {
          background: 'rgba(255,255,255,0.94)',
          borderColor: 'rgba(255,255,255,0.45)',
          color: '#0f172a',
        }
      : {}
    const glassSug: CSSProperties = glass
      ? {
          ...suggestionBtn,
          border: '1px solid rgba(255,255,255,0.22)',
          background: 'rgba(255,255,255,0.96)',
          color: '#0f172a',
        }
      : suggestionBtn
    return (
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
          {...(isNarrow ? nativeMobileSearchInputProps(mobileOS) : {})}
          style={{
            ...field,
            maxWidth: '100%',
            boxSizing: 'border-box',
            minWidth: 0,
            fontSize: isNarrow ? 16 : undefined,
            ...glassInput,
            ...(narrowCondensed && floating
              ? { padding: '5px 8px', minHeight: 34, lineHeight: 1.25, fontSize: 15 }
              : floating
                ? { padding: '6px 9px', minHeight: 38, lineHeight: 1.25 }
                : isNarrow
                  ? { padding: '8px 10px' }
                  : {}),
          }}
        />
        {(!floating || addrSearchProminent) && GEOCODE_SCOPE === 'ny' ? (
          <div
            style={{
              color: hintColor,
              fontSize: floating ? 11 : 12,
              lineHeight: 1.35,
            }}
          >
            Autocomplete is currently scoped to New York addresses.
          </div>
        ) : null}
        {!floating || addrSearchProminent ? (
          loadingSug ? (
            <div style={{ color: hintColor, fontSize: floating ? 11 : 12 }}>Searching…</div>
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
                style={glassSug}
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
              <div style={{ color: hintColor, fontSize: floating ? 11 : 12, lineHeight: 1.35 }}>
                Add the street name after the house number (e.g., ‘120-37 170 Street’).
              </div>
            ) : (
              <div style={{ color: hintColor, fontSize: floating ? 11 : 12, lineHeight: 1.35 }}>
                No suggestions. Try adding city/state.
              </div>
            )
          ) : null
        ) : null}
      </div>
    )
  }

  const mapLeftDockProminent = mapLeftToolDockOpen || mapLeftToolSection !== null
  const activeTrackQuickPickId = trackForMapAdd
  const selectTrackQuickPick = (trackId: string) => {
    setAutoContinuationTrackId(trackId)
    setVisibleTrackIds((prev) => ({ ...prev, [trackId]: true }))
    setWorkspaceCaseTab('tracking')
  }
  const openTrackManagerInMenu = useCallback(() => {
    if (isNarrow) {
      mapToolsDockIgnoreOutsideUntilRef.current = performance.now() + MAP_TOOLS_DOCK_OUTSIDE_GRACE_MS
      setMapLeftToolDockOpen(true)
    }
    setMapLeftToolSection('tracks')
  }, [isNarrow])
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

  const runLocateMe = useCallback(async () => {
    if (isNarrow) closeMapToolsDock()
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      window.alert('Location is not available in this browser.')
      return
    }
    const perm = await getGeolocationPermissionState()
    if (perm === 'denied') {
      window.alert(
        'Location is turned off for this site. Allow location in your browser or site settings, then tap Locate me again.',
      )
      return
    }
    const res = await requestCurrentPosition()
    if (!res.ok) {
      const msg =
        res.code === 'denied'
          ? 'Location permission was denied.'
          : res.code === 'timeout'
            ? 'Location timed out. Try again with GPS/Wi‑Fi location on.'
            : res.code === 'unavailable'
              ? 'Your device could not determine a position.'
              : 'Could not get your location.'
      window.alert(msg)
      return
    }
    const m = mapRef.current
    if (m) {
      m.flyTo(
        res.position.coords.latitude,
        res.position.coords.longitude,
        Math.max(m.getZoom(), 16),
        { duration: 0.6 },
      )
      if (!isNarrow) {
        setMapLeftToolSection(null)
        setWideSidebarListReveal(false)
      }
    }
  }, [closeMapToolsDock, isNarrow])

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
          if (isNarrow) closeMapToolsDock()
          else setMapLeftToolSection(null)
        }}
      >
        Map view
      </button>
      <button
        type="button"
        data-vc-tour={VC_TOUR.caseListViewBtn}
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
          if (isNarrow) closeMapToolsDock()
          else {
            setMapLeftToolSection(null)
            setWideSidebarListReveal(true)
          }
        }}
      >
        List view
      </button>
      <button
        type="button"
        style={{ ...btn, width: '100%' }}
        onClick={() => {
          fitMapToCanvass()
          if (isNarrow) closeMapToolsDock()
          else {
            setMapLeftToolSection(null)
            setWideSidebarListReveal(false)
          }
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
          if (isNarrow) closeMapToolsDock()
          else {
            setMapLeftToolSection(null)
            setWideSidebarListReveal(false)
          }
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
          if (isNarrow) closeMapToolsDock()
          else {
            setMapLeftToolSection(null)
            setWideSidebarListReveal(false)
          }
        }}
        disabled={!locations.length && !trackingMapPoints.length}
        title="Zoom to show everything"
      >
        Fit all
      </button>
      <button type="button" style={{ ...btn, width: '100%' }} onClick={() => void runLocateMe()}>
        Locate me
      </button>
    </>
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
                <CaseAttachmentImage
                  attachment={caseAttachments[sidebarMediaIndex]!}
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

  /** Shared “liquid glass” slab for wide map tools + top unified bar (cooler blue, blur, specular edge). */
  const liquidGlassToolbarBlue: CSSProperties = {
    background: 'linear-gradient(160deg, rgba(44, 74, 128, 0.5) 0%, rgba(26, 44, 78, 0.48) 45%, rgba(18, 32, 58, 0.52) 100%)',
    backdropFilter: 'blur(22px) saturate(1.45)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.45)',
    border: '1px solid rgba(255,255,255,0.28)',
    boxShadow: '0 10px 36px rgba(6, 16, 42, 0.38), inset 0 1px 0 rgba(255,255,255,0.2)',
  }

  /** Left top slab: Video canvassing | Subject tracking | address search on one row (chips sit in a sibling slab). */
  const mapTopModeAndSearchGlassStyle: CSSProperties = {
    ...liquidGlassToolbarBlue,
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    pointerEvents: 'auto',
    flex: '1 1 0',
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
  }

  /** Wide web: under-map tool panels match the floating pill (blue glass). Narrow keeps white cards. */
  const webWideMapToolPanelGlass: CSSProperties = {
    marginTop: 0,
    maxHeight: 'none',
    overflowY: 'visible',
    overflowX: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
    boxSizing: 'border-box',
    padding: 10,
    ...liquidGlassToolbarBlue,
    borderRadius: 16,
  }
  const mapDockNarrowToolPanelGlass: CSSProperties = {
    ...liquidGlassToolbarBlue,
    borderRadius: 14,
    marginTop: 4,
    padding: 10,
    maxHeight: 'min(48vh, 360px)',
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  }
  const mapDockPanelShellForMapTools: CSSProperties = isNarrow ? mapDockNarrowToolPanelGlass : webWideMapToolPanelGlass
  const mapDockFilterPanelShellForMapTools: CSSProperties = isNarrow
    ? { ...mapDockNarrowToolPanelGlass, maxHeight: 'none', overflowY: 'visible', padding: 8, marginTop: 4 }
    : { ...webWideMapToolPanelGlass, padding: 8 }

  /** Narrow ☰: extra left padding pulls over the flex gap so misses don’t hit the map. */
  const narrowMapMenuSlop = { left: 24, right: 12, top: 10, bottom: 10 } as const
  const narrowMapMenuOuterW = narrowMapMenuSlop.left + 44 + narrowMapMenuSlop.right
  const narrowMapMenuOuterH = narrowMapMenuSlop.top + 44 + narrowMapMenuSlop.bottom
  /** Right-docked track chips: same `top` / edge inset as ☰, padding mirrors ☰ TRBL (10,24,10,12 → 10,12,10,24). */
  const narrowMapTrackChipsDockWrapStyle: CSSProperties = {
    position: 'absolute',
    top: 'max(6px, env(safe-area-inset-top, 0px))',
    right: 'max(6px, env(safe-area-inset-right, 0px))',
    zIndex: 1,
    pointerEvents: 'auto',
    boxSizing: 'border-box',
    padding: `${narrowMapMenuSlop.top}px ${narrowMapMenuSlop.right}px ${narrowMapMenuSlop.bottom}px ${narrowMapMenuSlop.left}px`,
  }
  /** Left-docked ☰: slop extends rightward so misses don’t hit the map. */
  const narrowMapMenuHitSlopBtnStyleLeft: CSSProperties = {
    border: 'none',
    background: 'transparent',
    padding: `${narrowMapMenuSlop.top}px ${narrowMapMenuSlop.left}px ${narrowMapMenuSlop.bottom}px ${narrowMapMenuSlop.right}px`,
    margin: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexShrink: 0,
    width: narrowMapMenuOuterW,
    height: narrowMapMenuOuterH,
    boxSizing: 'border-box',
    WebkitTapHighlightColor: 'transparent',
  }

  /** Left inset for map top chrome (zoom controls removed). */
  const narrowMapTopReserveLeft = 'max(10px, env(safe-area-inset-left, 0px))'

  const narrowMapDockExpandedGlassShell: CSSProperties = {
    ...liquidGlassToolbarBlue,
    borderRadius: 16,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    alignItems: 'stretch',
    minWidth: 0,
    width: 'max-content',
    maxWidth: 'min(280px, calc(100vw - 48px))',
    maxHeight:
      detailOverlayHeightPx > 0
        ? `min(65vh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${detailOverlayHeightPx + 100}px))`
        : 'min(65vh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 120px))',
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    boxSizing: 'border-box',
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
  const mapDockMenuToggleFaceStyle: CSSProperties = {
    ...mapDockMenuToggleBtnStyle,
    pointerEvents: 'none',
  }
  const mapDockMenuToggleFaceNarrowStyle: CSSProperties = {
    width: 44,
    height: 44,
    minWidth: 44,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    lineHeight: 1,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.28)',
    boxShadow: '0 8px 28px rgba(6, 16, 42, 0.35), inset 0 1px 0 rgba(255,255,255,0.18)',
    pointerEvents: 'none',
    color: '#f8fafc',
    background: 'linear-gradient(160deg, rgba(44, 74, 128, 0.55) 0%, rgba(26, 44, 78, 0.5) 45%, rgba(18, 32, 58, 0.55) 100%)',
    backdropFilter: 'blur(18px) saturate(1.35)',
    WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
  }
  const mapDockNavBtnNarrowGlass = (active: boolean): CSSProperties => ({
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    padding: '9px 12px',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    borderRadius: 10,
    border: active ? '1px solid rgba(255,255,255,0.42)' : '1px solid rgba(255,255,255,0.2)',
    background: active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)',
    color: '#f8fafc',
    cursor: 'pointer',
    textAlign: 'left',
    flexShrink: 0,
  })
  const renderDockSectionButton = (section: MapToolsDockSection, label: string) => (
    <button
      type="button"
      onClick={() => {
        if (section === 'dvr' && isNarrow) {
          closeMapToolsDock()
          setProbativeFlow({ step: 'calc', target: { kind: 'dvr_only' } })
          return
        }
        if (section === 'dvr') setProbativeFlow(null)
        setMapLeftToolSection((s) => (s === section ? null : section))
      }}
      style={
        isNarrow
          ? mapDockNavBtnNarrowGlass(mapLeftToolSection === section)
          : {
              ...mapDockNavBtnBase,
              textAlign: 'left',
              background: mapLeftToolSection === section ? '#f3f4f6' : 'white',
            }
      }
    >
      {label}
    </button>
  )

  /** Wide web only: icon dock on translucent glass pill; labels via native `title` (hover). */
  const webWideMapToolsPillWrap: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '8px 5px',
    ...liquidGlassToolbarBlue,
    borderRadius: 22,
    minWidth: 0,
    flexShrink: 0,
  }
  const webDockIconBtn = (active: boolean): CSSProperties => ({
    width: 40,
    height: 40,
    padding: 0,
    borderRadius: 11,
    border: active ? '1px solid rgba(255,255,255,0.35)' : '1px solid transparent',
    background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
    color: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    lineHeight: 0,
    boxSizing: 'border-box',
    flexShrink: 0,
  })
  const webDockToolIconSvg = (section: MapToolsDockSection) => {
    const sw = 1.75
    const p = {
      width: 22,
      height: 22,
      viewBox: '0 0 24 24',
      fill: 'none' as const,
      stroke: 'currentColor',
      strokeWidth: sw,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
    }
    switch (section) {
      case 'views':
        return (
          <svg {...p} aria-hidden>
            <rect x="3" y="3" width="7" height="7" rx="1.25" />
            <rect x="14" y="3" width="7" height="7" rx="1.25" />
            <rect x="3" y="14" width="7" height="7" rx="1.25" />
            <rect x="14" y="14" width="7" height="7" rx="1.25" />
          </svg>
        )
      case 'filters':
        return (
          <svg {...p} aria-hidden>
            <path d="M4 5h16l-5.5 7.2V19l-3 1.5v-8.3L4 5z" />
          </svg>
        )
      case 'tracks':
        return (
          <svg {...p} aria-hidden>
            <path d="M4 18c2.5-6 4-9 8-9s5.5 3 8 9" />
            <circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="12" cy="9" r="1.6" fill="currentColor" stroke="none" />
            <circle cx="18" cy="18" r="1.6" fill="currentColor" stroke="none" />
          </svg>
        )
      case 'photos':
        return (
          <svg {...p} aria-hidden>
            <rect x="4" y="6" width="16" height="13" rx="2" />
            <circle cx="9" cy="10.5" r="1.8" />
            <path d="M4 16l4.5-4.5 3 3L15 11l5 5" />
          </svg>
        )
      case 'dvr':
        return (
          <svg {...p} aria-hidden>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l4 2.5" />
          </svg>
        )
      default:
        return null
    }
  }
  const renderWebDockSectionButton = (section: MapToolsDockSection, label: string) => {
    const active = mapLeftToolSection === section
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        onClick={() => {
          if (section === 'dvr') setProbativeFlow(null)
          if (!isNarrow) setWideSidebarListReveal(false)
          setMapLeftToolSection((s) => (s === section ? null : section))
        }}
        style={webDockIconBtn(active)}
      >
        {webDockToolIconSvg(section)}
      </button>
    )
  }

  const visitHeatmapDockRow = (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
        fontSize: 12,
        fontWeight: 600,
        color: isNarrow ? '#374151' : '#cbd5e1',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={visitHeatmapOn}
        onChange={(e) => setVisitHeatmapOn(e.target.checked)}
        style={{ width: 16, height: 16 }}
      />
      Visit density heatmap
    </label>
  )

  const mapToolsDockViewsPanel =
    mapLeftToolSection === 'views' ? (
      <div style={mapDockPanelShellForMapTools}>
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
        {canUseVisitHeatmap ? visitHeatmapDockRow : null}
      </div>
    ) : null

  const mapToolsDockDvrPanel =
    mapLeftToolSection === 'dvr' ? (
      <div
        style={{
          ...mapDockPanelShellForMapTools,
          ...(isNarrow
            ? {
                minHeight: 0,
                maxHeight: 'min(52vh, 480px)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                padding: 6,
                marginTop: 4,
              }
            : {
                padding: 6,
              }),
        }}
      >
        <div
          style={
            isNarrow
              ? {
                  minHeight: 0,
                  flex: 1,
                  overflowX: 'hidden',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                }
              : {
                  minWidth: 0,
                  width: '100%',
                  overflowX: 'hidden',
                }
          }
        >
          <DvrCalculatorStep
            toolbarEmbed
            hideManualOffset={!isNarrow}
            isNarrowOverride={isNarrow}
            onBack={() => setMapLeftToolSection(null)}
            onCancel={() => setMapLeftToolSection(null)}
            onApply={(notes) => {
              finalizeDvrOnlyCalculatorApply(notes)
              setMapLeftToolSection(null)
            }}
          />
        </div>
      </div>
    ) : null

  const mapToolsDockSubPanels = (
    <>
      {mapLeftToolSection === 'filters' ? (
        <div style={mapDockFilterPanelShellForMapTools}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 10,
              color: isNarrow ? '#6b7280' : '#94a3b8',
              marginBottom: 4,
            }}
          >
            Result ({locations.length} total)
          </div>
          {filterLegendChipsGridDock}
        </div>
      ) : null}
      {mapLeftToolSection === 'tracks' ? (
        <div style={mapDockPanelShellForMapTools}>
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
              <div style={{ fontSize: 12, color: isNarrow ? '#6b7280' : '#cbd5e1', lineHeight: 1.4 }}>
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
                      border: isNarrow ? '1px solid #e5e7eb' : '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 10,
                      background: isNarrow ? '#fafafa' : 'rgba(255,255,255,0.08)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <TrackMapVisibilityButton
                      visible={on}
                      trackLabel={t.label}
                      variant={isNarrow ? 'mapDockLight' : 'mapDockGlass'}
                      onToggle={() =>
                        setVisibleTrackIds((prev) => {
                          const wasVisible = prev[t.id] !== false
                          return { ...prev, [t.id]: !wasVisible }
                        })
                      }
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
                      value={trackLabelDrafts[t.id] ?? t.label}
                      readOnly={!canEditT}
                      placeholder="Track name"
                      title={canEditT ? 'Rename track' : 'No permission to rename'}
                      onFocus={() => {
                        trackLabelFocusRef.current[t.id] = true
                      }}
                      onBlur={(e) => {
                        trackLabelFocusRef.current[t.id] = false
                        const v = e.currentTarget.value
                        setTrackLabelDrafts((prev) => ({ ...prev, [t.id]: v }))
                        flushTrackLabelPersist(t.id, v)
                      }}
                      onChange={(e) => {
                        const v = e.target.value
                        setTrackLabelDrafts((prev) => ({ ...prev, [t.id]: v }))
                        scheduleTrackLabelPersist(t.id, v)
                      }}
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
        <div style={{ ...mapDockPanelShellForMapTools, padding: 8 }}>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            {casePhotosSidebarBlock ?? (
              <div style={{ fontSize: 12, color: isNarrow ? '#6b7280' : '#cbd5e1', lineHeight: 1.4 }}>
                No reference photos yet{canAddCaseContentHere ? '. Use Add photo in this panel.' : '.'}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )

  const mapToolsDockSectionPanels = (
    <>
      {mapToolsDockViewsPanel}
      {mapToolsDockDvrPanel}
      {mapToolsDockSubPanels}
    </>
  )

  /** Bottom sheet on map: narrow when list; wide when list revealed (left column removed on web). */
  const showAddressesListBottomSheet =
    caseTab === 'addresses' &&
    viewMode === 'list' &&
    (isNarrow || (!isNarrow && mapLeftToolSection === null && wideSidebarListReveal))
  /** Map stays in the main pane for both map and list on addresses (list is a panel, not a replacement). */
  const showMapInMapColumn = caseTab === 'tracking' || caseTab === 'addresses'

  const renderAddressesListContent = (placement: 'mapColumn' | 'controlColumn') => {
    const listRowPad = placement === 'controlColumn' ? '6px 8px' : isNarrow ? '8px 10px' : '6px 10px'
    const listBadgeCompact: CSSProperties = {
      ...statusBadge,
      padding: '2px 7px',
      fontSize: 10,
      lineHeight: 1.2,
    }
    const outerStyle: CSSProperties =
      placement === 'controlColumn'
        ? {
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderTop: '1px solid #e5e7eb',
            marginTop: 0,
            paddingTop: 8,
          }
        : {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
            position: 'relative',
          }

    return (
      <div style={outerStyle}>
        <div
          style={{
            ...listHeaderRow,
            flexShrink: 0,
            borderBottom: '1px solid #e5e7eb',
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 8,
            padding: '8px 10px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              justifyContent: placement === 'controlColumn' ? 'flex-start' : 'space-between',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 13 }}>Locations ({filtered.length})</div>
            {placement === 'mapColumn' ? (
              <button type="button" style={{ ...btn, fontSize: 12, padding: '6px 10px' }} onClick={() => setWorkspaceViewMode('map')}>
                Back to map
              </button>
            ) : null}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 6,
              width: '100%',
              minWidth: 0,
            }}
            role="group"
            aria-label="Filter locations by result"
          >
            <LegendChip
              dense
              dockCompact
              allowMultiline
              label={`No cameras (${counts.noCameras})`}
              color={statusColor('noCameras')}
              on={filters.noCameras}
              onToggle={() => setFilters((f) => ({ ...f, noCameras: !f.noCameras }))}
            />
            <LegendChip
              dense
              dockCompact
              allowMultiline
              label={`Needs Follow up (${counts.camerasNoAnswer})`}
              color={statusColor('camerasNoAnswer')}
              on={filters.camerasNoAnswer}
              onToggle={() => setFilters((f) => ({ ...f, camerasNoAnswer: !f.camerasNoAnswer }))}
            />
            <LegendChip
              dense
              dockCompact
              allowMultiline
              label={`Not probative (${counts.notProbativeFootage})`}
              color={statusColor('notProbativeFootage')}
              on={filters.notProbativeFootage}
              onToggle={() => setFilters((f) => ({ ...f, notProbativeFootage: !f.notProbativeFootage }))}
            />
            <LegendChip
              dense
              dockCompact
              allowMultiline
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
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {locationsForListView.map((l) => {
              const isListSelected = selectedId === l.id
              const isListExpanded = listRowExpandedId === l.id
              const dimListRow = selectedId != null && !isListSelected
              const canEditL = canEditLocation(data, actorId, l)
              const canDelL = canDeleteLocation(data, actorId, l)
              const listLineLabel = formatAddressLineForMapList(l.addressText)
              return (
                <div
                  key={l.id}
                  style={{
                    ...listRow,
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                    gap: 6,
                    padding: listRowPad,
                    background: isListSelected ? '#ffffff' : dimListRow ? '#ececef' : 'white',
                    opacity: dimListRow ? 0.72 : 1,
                    boxShadow: isListSelected ? 'inset 3px 0 0 #111827' : undefined,
                    transition: 'background 0.15s ease, opacity 0.15s ease',
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={isListExpanded}
                    style={{
                      ...listRowMainBtn,
                      flex: 1,
                      minWidth: 0,
                      boxSizing: 'border-box',
                    }}
                    onClick={() => {
                      setLocationDetailOpen(false)
                      if (isListExpanded) {
                        setListRowExpandedId(null)
                        setSelectedId(null)
                      } else {
                        setListRowExpandedId(l.id)
                        setSelectedId(l.id)
                      }
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        textAlign: 'left',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        lineHeight: 1.25,
                        fontSize: 13,
                      }}
                    >
                      {listLineLabel}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 6,
                        rowGap: 4,
                      }}
                    >
                      <span
                        style={{
                          ...listBadgeCompact,
                          background: `${statusColor(l.status)}35`,
                          color: statusColor(l.status),
                        }}
                      >
                        {statusLabel(l.status)}
                      </span>
                      <span style={{ color: '#6b7280', fontSize: 10, fontWeight: 600, lineHeight: 1.2 }}>
                        Updated {formatAppDateTime(l.updatedAt)}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${listLineLabel} from case`}
                    title={
                      canDelL ? 'Remove this address from the case' : 'You do not have permission to remove this address'
                    }
                    style={{
                      flexShrink: 0,
                      width: 32,
                      height: 32,
                      marginTop: 0,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 8,
                      border: '1px solid #fca5a5',
                      background: '#fef2f2',
                      color: '#b91c1c',
                      fontSize: 18,
                      fontWeight: 900,
                      lineHeight: 1,
                      cursor: canDelL ? 'pointer' : 'not-allowed',
                      boxSizing: 'border-box',
                      opacity: canDelL ? 1 : 0.35,
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!canDelL) {
                        window.alert('You do not have permission to remove this address.')
                        return
                      }
                      if (!window.confirm('Delete this address from the case? This cannot be undone.')) return
                      void deleteLocation(actorId, l.id)
                      setSelectedId((id) => (id === l.id ? null : id))
                      setListRowExpandedId((exp) => (exp === l.id ? null : exp))
                      setListAddressNotesForId((n) => (n === l.id ? null : n))
                    }}
                  >
                    ✕
                  </button>
                  {isListExpanded ? (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          alignItems: 'center',
                          width: '100%',
                          flexBasis: '100%',
                        }}
                      >
                        <button
                          type="button"
                          style={{ ...btn, fontSize: 11, padding: '5px 8px', flex: '1 1 88px', minWidth: 0 }}
                          onClick={() => focusLocationOnMap(l)}
                        >
                          Show on map
                        </button>
                        <button
                          type="button"
                          style={{ ...btn, fontSize: 11, padding: '5px 8px', flex: '1 1 88px', minWidth: 0 }}
                          onClick={() => setListAddressNotesForId(l.id)}
                        >
                          Notes
                        </button>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          gap: 5,
                          minWidth: 0,
                          justifyItems: 'stretch',
                          width: '100%',
                          flexBasis: '100%',
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
                              setListRowExpandedId(l.id)
                              setProbativeFlow({ step: 'accuracy', target: { kind: 'existing', locationId: l.id } })
                              return
                            }
                            void updateLocation(actorId, l.id, { status: 'probativeFootage' })
                          }}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: 12, color: '#374151', flex: placement === 'mapColumn' ? 1 : undefined }}>
            No locations in the selected filters.
          </div>
        )}
        {placement === 'mapColumn' && mapLeftToolDockOpen ? (
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
    )
  }

  const narrowMapTopShowsFloatingAddress = caseTab === 'tracking' || caseTab === 'addresses'
  const showMapTopTrackSelector = narrowMapTopShowsFloatingAddress && caseTracks.length > 0

  const viewModeBtnGlass = (active: boolean): CSSProperties => ({
    border: `1px solid ${active ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.2)'}`,
    borderRadius: 'var(--vc-radius-sm)',
    padding: 'var(--vc-space-sm) var(--vc-space-md)',
    background: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.12)',
    color: active ? '#0f172a' : 'rgba(248,250,252,0.95)',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 'var(--vc-fs-sm)',
    whiteSpace: 'nowrap',
  })

  const caseModeToggleBarGlass = (
    <div
      data-vc-tour={VC_TOUR.caseWorkspaceTabs}
      style={{
        display: 'grid',
        gridTemplateColumns: 'max-content max-content',
        gap: 6,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        style={viewModeBtnGlass(caseTab === 'addresses')}
        onClick={() => setWorkspaceCaseTab('addresses')}
      >
        Video canvassing
      </button>
      <button
        type="button"
        style={viewModeBtnGlass(caseTab === 'tracking')}
        onClick={() => setWorkspaceCaseTab('tracking')}
      >
        Subject tracking
      </button>
    </div>
  )

  const mapTopTrackSelectorGlassStyle: CSSProperties = {
    ...liquidGlassToolbarBlue,
    borderRadius: 18,
    display: 'inline-flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    flex: '0 0 auto',
    width: 'max-content',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  }

  const mapTopAddressSearchBlock = narrowMapTopShowsFloatingAddress ? (
    <div
      ref={narrowMapAddressRef}
      data-vc-tour={VC_TOUR.caseFloatingSearch}
      style={{
        ...(isNarrow
          ? { width: '100%', flex: 'none', minWidth: 0, alignSelf: 'stretch' }
          : { flex: '1 1 140px', minWidth: 0, maxWidth: '100%', alignSelf: 'center' }),
        opacity: addrSearchProminent ? 1 : 0.52,
        transition: 'opacity 0.2s ease',
        pointerEvents: 'auto',
        position: 'relative',
        zIndex: 8,
      }}
    >
      {renderAddAddressSearch(true, {
        glassChrome: true,
        ...(isNarrow ? { narrowCondensed: true } : {}),
      })}
    </div>
  ) : null

  const renderMapTopTrackSelector = (styleOverride?: CSSProperties) => {
    if (!showMapTopTrackSelector) return null
    return (
      <div style={{ ...mapTopTrackSelectorGlassStyle, ...styleOverride }} aria-label="Track selector">
        {caseTracks.map((t) => {
          const active = activeTrackQuickPickId === t.id
          const color = resolvedTrackColors.get(t.id) ?? TRACK_DEFAULT_COLORS_FIRST_FOUR[0]
          return (
            <button
              key={`map-top-track-quick-${t.id}`}
              type="button"
              onClick={() => selectTrackQuickPick(t.id)}
              onDoubleClick={(e) => {
                e.preventDefault()
                openTrackManagerInMenu()
              }}
              style={{
                border: '1px solid',
                borderColor: active ? color : 'rgba(255,255,255,0.28)',
                borderRadius: 999,
                padding: '5px 9px',
                background: active ? `${color}50` : 'rgba(255,255,255,0.1)',
                color: active ? '#ffffff' : 'rgba(248,250,252,0.92)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: active ? 900 : 800,
                fontSize: 12,
                transition: 'opacity 0.15s ease',
                opacity: active ? 1 : 0.75,
              }}
              aria-pressed={active}
              aria-label={`Use ${t.label || 'Track'} for subject tracking. Double-click to open track manager.`}
              title={`Edit/add points on ${t.label || 'this track'}. Double-click opens Tracks in the menu.`}
            >
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: color, display: 'inline-block' }} />
              <span style={{ whiteSpace: 'nowrap' }}>{t.label || 'Track'}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const mapTopModeAndSearchGlassPanel = (
    <div style={mapTopModeAndSearchGlassStyle}>
      {caseModeToggleBarGlass}
      {mapTopAddressSearchBlock}
    </div>
  )

  const mapTopWideChromeRow = (
    <div
      data-vc-tour={VC_TOUR.caseControlPane}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          gap: 16,
          pointerEvents: 'auto',
          maxWidth: '100%',
          width: 'auto',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        {mapTopModeAndSearchGlassPanel}
        {renderMapTopTrackSelector()}
      </div>
    </div>
  )

  const mapTopNarrowSearchOnlyGlassStyle: CSSProperties = {
    ...liquidGlassToolbarBlue,
    borderRadius: 18,
    padding: '6px 10px',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  }

  /** Narrow: ☰-width spacers | centered search (track chips docked right, same inset/slop as ☰). */
  const mapTopNarrowTopChromeSearchOnly = (
    <div
      data-vc-tour={VC_TOUR.caseControlPane}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 'min(228px, 100%)',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        <div style={mapTopNarrowSearchOnlyGlassStyle}>{mapTopAddressSearchBlock}</div>
      </div>
    </div>
  )

  const mapNarrowBottomModesChrome =
    isNarrow && !probativePlacementSession && showMapInMapColumn ? (
      <div
        ref={narrowMapBottomChromeRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `calc(${MAP_CANVAS_BOTTOM_RESERVE} + env(safe-area-inset-bottom, 0px) + 10px)`,
          zIndex: 45,
          pointerEvents: 'none',
          display: 'flex',
          justifyContent: 'center',
          paddingLeft: 'max(10px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(10px, env(safe-area-inset-right, 0px))',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            maxWidth: '100%',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              ...liquidGlassToolbarBlue,
              borderRadius: 20,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              maxWidth: '100%',
              boxSizing: 'border-box',
            }}
          >
            {caseModeToggleBarGlass}
          </div>
        </div>
      </div>
    ) : null
  /**
   * Wide map tools: inset from map interior (page gutter is outside the map card). Zoom UI hidden.
   * Pill + panel left-aligned: shared left edge, panel grows to the right. Slightly tighter top/bottom gaps for Views panel room.
   */
  const webWideMapToolsRailEdgeGap = 'clamp(6px, 1vw, 12px)'
  const webWideMapToolsZoomMargin = '10px'
  /** No top-left NavigationControl; only top breathing room. */
  const webWideMapToolsZoomStackH = '0px'
  const webWideMapToolsBelowZoomGap = 'clamp(2px, 0.45vw, 5px)'
  const webWideMapToolsPillPanelGapPx = 6
  const webWideMapToolsLeft = `max(${webWideMapToolsZoomMargin}, env(safe-area-inset-left, 0px))`
  const webWideMapToolsMapRightPad = '10px'
  const webWideMapToolsLayerWidth = `min(280px, calc(100% - max(${webWideMapToolsZoomMargin}, env(safe-area-inset-left, 0px)) - ${webWideMapToolsMapRightPad}))`
  const webWideMapToolsPillTop = `calc(${webWideMapToolsZoomMargin} + ${webWideMapToolsZoomStackH} + ${webWideMapToolsBelowZoomGap})`
  const webWideMapToolsPanelTop = `calc(${webWideMapToolsZoomMargin} + ${webWideMapToolsZoomStackH} + ${webWideMapToolsBelowZoomGap} + ${webWideMapDockPillFullPx}px + ${webWideMapToolsPillPanelGapPx}px)`

  const webWideMapToolsLayerShell: CSSProperties = {
    position: 'absolute',
    left: webWideMapToolsLeft,
    top: 0,
    bottom: 0,
    width: webWideMapToolsLayerWidth,
    zIndex: 40,
    pointerEvents: 'none',
    boxSizing: 'border-box',
  }
  const webWideMapToolsPillAnchor: CSSProperties = {
    position: 'absolute',
    top: webWideMapToolsPillTop,
    left: 0,
    right: 0,
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    transform: 'none',
    pointerEvents: 'none',
  }
  const webWideMapToolsPanelShell: CSSProperties = {
    position: 'absolute',
    top: webWideMapToolsPanelTop,
    left: 0,
    right: 0,
    bottom: webWideMapToolsRailEdgeGap,
    overflowX: 'hidden',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    minWidth: 0,
  }

  const webWideMapToolsFloatingPill =
    !isNarrow && showMapInMapColumn ? (
      <>
        {mapLeftToolSection != null ? (
          <div
            role="presentation"
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 38,
              background: 'rgba(17, 24, 39, 0.1)',
              pointerEvents: 'auto',
              touchAction: 'none',
            }}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              mapRef.current?.clearPendingMapTap()
              setMapLeftToolSection(null)
            }}
          />
        ) : null}
        <div style={webWideMapToolsLayerShell} data-vc-tour={VC_TOUR.caseMapToolsWide}>
          <div style={webWideMapToolsPillAnchor}>
            <div ref={webWideMapDockPillRef} style={{ ...webWideMapToolsPillWrap, pointerEvents: 'auto' }}>
              {renderWebDockSectionButton('views', 'Views')}
              {renderWebDockSectionButton('filters', 'Filters')}
              {renderWebDockSectionButton('tracks', 'Tracks')}
              {renderWebDockSectionButton('photos', 'Photos')}
              {renderWebDockSectionButton('dvr', 'DVR calculator')}
            </div>
          </div>
          {mapLeftToolSection != null ? (
            <div
              style={webWideMapToolsPanelShell}
              role="region"
              aria-label="Map tool panel"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>{mapToolsDockSectionPanels}</div>
            </div>
          ) : null}
        </div>
      </>
    ) : null

  const controlPaneBlock = null
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
            data-vc-tour={VC_TOUR.caseHeaderMeta}
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
                {...(isNarrow ? nativeMobileTextInputProps(mobileOS) : {})}
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
                {...(isNarrow ? nativeMobileTextareaProps(mobileOS) : {})}
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
            data-vc-tour={VC_TOUR.caseHeaderMeta}
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
          {TOUR_UI_ENABLED ? (
            <button type="button" onClick={() => startTour('case')} style={btn} disabled={tourOpen}>
              Tour
            </button>
          ) : null}
          <button type="button" data-vc-tour={VC_TOUR.caseBack} onClick={props.onBack} style={btn}>
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
              {!probativePlacementSession ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 'max(6px, env(safe-area-inset-top, 0px))',
                    left: 0,
                    right: 0,
                    zIndex: isNarrow ? 44 : 45,
                    paddingLeft: isNarrow
                      ? 'max(10px, env(safe-area-inset-left, 0px))'
                      : narrowMapTopShowsFloatingAddress
                        ? narrowMapTopReserveLeft
                        : 'max(10px, env(safe-area-inset-left, 0px))',
                    paddingRight: 'max(10px, env(safe-area-inset-right, 0px))',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: isNarrow ? 'center' : 'flex-start',
                    gap: isNarrow ? 8 : 8,
                    pointerEvents: 'none',
                  }}
                >
                  {!isNarrow && narrowMapTopShowsFloatingAddress && mapLeftToolDockOpen ? (
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
                  {isNarrow ? (
                    <>
                      <div
                        aria-hidden
                        style={{ flexShrink: 0, width: narrowMapMenuOuterW, pointerEvents: 'none' }}
                      />
                      {mapTopNarrowTopChromeSearchOnly}
                      <div
                        aria-hidden
                        style={{ flexShrink: 0, width: narrowMapMenuOuterW, pointerEvents: 'none' }}
                      />
                    </>
                  ) : (
                    mapTopWideChromeRow
                  )}
                </div>
              ) : null}
              {isNarrow && showMapInMapColumn && !probativePlacementSession ? (
                <div
                  ref={mapToolsDockRef}
                  data-vc-tour={VC_TOUR.caseMapToolsMobile}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: mapStackBottom,
                    zIndex: 46,
                    pointerEvents: 'none',
                  }}
                >
                  {!mapLeftToolDockOpen ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'max(6px, env(safe-area-inset-top, 0px))',
                        left: 'max(6px, env(safe-area-inset-left, 0px))',
                        pointerEvents: 'auto',
                        opacity: mapLeftDockProminent ? 1 : 0.45,
                        transition: 'opacity 0.2s ease',
                      }}
                    >
                      <button
                        type="button"
                        aria-label="Open map tools: views, filters, tracks, and photos"
                        onClick={() => {
                          mapToolsDockIgnoreOutsideUntilRef.current = performance.now() + MAP_TOOLS_DOCK_OUTSIDE_GRACE_MS
                          if (caseTab === 'addresses' && locationDetailOpen) {
                            setLocationDetailOpen(false)
                          }
                          if (caseTab === 'tracking' && selectedTrackPointId) {
                            setSelectedTrackPointId(null)
                          }
                          setAddressDrawerDetailsOpen(false)
                          setTrackDrawerDetailsOpen(false)
                          setMapLeftToolDockOpen(true)
                        }}
                        style={narrowMapMenuHitSlopBtnStyleLeft}
                      >
                        <span style={mapDockMenuToggleFaceNarrowStyle} aria-hidden>
                          ☰
                        </span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        role="presentation"
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: 0,
                          zIndex: 0,
                          background: 'rgba(17,24,39,0.22)',
                          touchAction: 'none',
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
                      <div
                        style={{
                          position: 'absolute',
                          top: 'max(6px, env(safe-area-inset-top, 0px))',
                          left: 'max(6px, env(safe-area-inset-left, 0px))',
                          zIndex: 1,
                          maxWidth: 'min(280px, calc(100vw - 24px))',
                          pointerEvents: 'auto',
                        }}
                      >
                        <div style={narrowMapDockExpandedGlassShell}>
                          <button
                            type="button"
                            aria-label="Close map tools"
                            onClick={closeMapToolsDock}
                            style={narrowMapMenuHitSlopBtnStyleLeft}
                          >
                            <span style={mapDockMenuToggleFaceNarrowStyle} aria-hidden>
                              ☰
                            </span>
                          </button>
                          {renderDockSectionButton('views', 'Views')}
                          {renderDockSectionButton('filters', 'Filters')}
                          {renderDockSectionButton('tracks', 'Tracks')}
                          {renderDockSectionButton('photos', 'Photos')}
                          {renderDockSectionButton('dvr', 'DVR calculator')}
                          {mapToolsDockSectionPanels}
                        </div>
                      </div>
                    </>
                  )}
                  {showMapTopTrackSelector ? (
                    <div style={narrowMapTrackChipsDockWrapStyle}>
                      {renderMapTopTrackSelector({
                        flexDirection: 'column',
                        flexWrap: 'nowrap',
                        alignItems: 'stretch',
                        justifyContent: 'flex-start',
                        gap: 5,
                        padding: '5px 6px',
                        width: 'max-content',
                        maxWidth: 'min(140px, calc(100vw - 220px))',
                        maxHeight: 'min(240px, 42vh)',
                        overflowX: 'visible',
                        overflowY: 'auto',
                        WebkitOverflowScrolling: 'touch',
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {mapNarrowBottomModesChrome}
              {showMapInMapColumn ? (
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
                  {webWideMapToolsFloatingPill}
                  {mapLeftToolDockOpen && !probativePlacementSession && !isNarrow ? (
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
                  <div data-vc-tour={VC_TOUR.caseMapCanvas} style={{ position: 'absolute', inset: 0, zIndex: 1, minHeight: 0 }}>
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
                    addrSearchBlocksMapClicks={addrSearchMapShieldActive}
                    mapInteractionFreezeUntilRef={addrMapInteractionFreezeUntilRef}
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
                    onTabLongPressSwitchToTracking={onTabLongPressSwitchToTracking}
                    onTabLongPressSwitchToAddresses={onTabLongPressSwitchToAddresses}
                    onTrackingUnselectedFeatureLongPress={onTrackingUnselectedFeatureLongPress}
                    onDoubleTapTrackPoint={onDoubleTapTrackPointFromMap}
                    onDoubleTapLocation={onDoubleTapLocationFromMap}
                    visitHeatmapGeojson={visitHeatmapGeojson}
                    showVisitHeatmap={canUseVisitHeatmap && visitHeatmapOn && caseTab === 'addresses'}
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
              ) : null}

              {showAddressesListBottomSheet ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: mapStackBottom,
                    maxHeight: 'min(48vh, 420px)',
                    minHeight: 140,
                    height: 'min(48vh, 420px)',
                    zIndex: 35,
                    display: 'flex',
                    flexDirection: 'column',
                    pointerEvents: 'auto',
                    background: '#fff',
                    borderTop: '1px solid #e5e7eb',
                    borderTopLeftRadius: 12,
                    borderTopRightRadius: 12,
                    boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
                    overflow: 'hidden',
                    minWidth: 0,
                  }}
                >
                  {renderAddressesListContent('mapColumn')}
                </div>
              ) : null}

              {wideMapDrawerSeamBottomTab ? (
                <div
                  ref={mapDrawerSeamToggleRef}
                  role="presentation"
                  className="case-map-drawer-seam-anchor"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 'min(980px, calc(100% - 48px))',
                    bottom: 0,
                    height: 0,
                    zIndex: 5100,
                    pointerEvents: 'none',
                  }}
                >
                  <MapPaneEdgeAnchor placement="drawerTopSeam">
                    {caseTab === 'addresses' ? (
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
                  {caseTab === 'addresses' && selected && locationDetailOpen ? (
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
                  ) : caseTab === 'addresses' && !isNarrow && addressDrawerDetailsOpen ? (
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
          const trackVisibleOnMap = visibleTrackIds[t.id] !== false
          const toggleTrackMapVisibility = () =>
            setVisibleTrackIds((prev) => {
              const wasVisible = prev[t.id] !== false
              return { ...prev, [t.id]: !wasVisible }
            })
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <TrackMapVisibilityButton
                      visible={trackVisibleOnMap}
                      trackLabel={t.label}
                      variant="modal"
                      onToggle={toggleTrackMapVisibility}
                    />
                    <input
                      value={trackLabelDrafts[t.id] ?? t.label}
                      readOnly={!canEditT}
                      onFocus={() => {
                        trackLabelFocusRef.current[t.id] = true
                      }}
                      onBlur={(e) => {
                        trackLabelFocusRef.current[t.id] = false
                        const v = e.currentTarget.value
                        setTrackLabelDrafts((prev) => ({ ...prev, [t.id]: v }))
                        flushTrackLabelPersist(t.id, v)
                      }}
                      onChange={(e) => {
                        const v = e.target.value
                        setTrackLabelDrafts((prev) => ({ ...prev, [t.id]: v }))
                        scheduleTrackLabelPersist(t.id, v)
                      }}
                      style={{ ...field, flex: 1, minWidth: 0 }}
                    />
                  </div>
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
                    gridTemplateColumns: '40px minmax(0, 1fr) minmax(88px, 120px) 40px auto',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <TrackMapVisibilityButton
                    visible={trackVisibleOnMap}
                    trackLabel={t.label}
                    variant="modal"
                    onToggle={toggleTrackMapVisibility}
                  />
                  <input
                    value={trackLabelDrafts[t.id] ?? t.label}
                    readOnly={!canEditT}
                    onFocus={() => {
                      trackLabelFocusRef.current[t.id] = true
                    }}
                    onBlur={(e) => {
                      trackLabelFocusRef.current[t.id] = false
                      const v = e.currentTarget.value
                      setTrackLabelDrafts((prev) => ({ ...prev, [t.id]: v }))
                      flushTrackLabelPersist(t.id, v)
                    }}
                    onChange={(e) => {
                      const v = e.target.value
                      setTrackLabelDrafts((prev) => ({ ...prev, [t.id]: v }))
                      scheduleTrackLabelPersist(t.id, v)
                    }}
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
      title={
        listNotesLocation ? formatAddressLineForMapList(listNotesLocation.addressText) : 'Address notes'
      }
      open={listNotesLocation != null}
      onClose={() => setListAddressNotesForId(null)}
    >
      {listNotesLocation ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {footprintLoadingIds.has(listNotesLocation.id) ? (
            <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>Loading building outline in background…</div>
          ) : null}
          {footprintFailedIds.has(listNotesLocation.id) ? (
            <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>
              Building outline unavailable for this point (notes still save normally).
            </div>
          ) : null}
          <div>
            <div style={label}>Notes</div>
            <textarea
              value={listNotesLocation.notes}
              readOnly={!canEditLocation(data, actorId, listNotesLocation)}
              onChange={(e) => void updateLocation(actorId, listNotesLocation.id, { notes: e.target.value })}
              placeholder="What did you observe?"
              style={{
                ...field,
                minHeight: 120,
                resize: 'vertical',
                maxWidth: '100%',
                boxSizing: 'border-box',
                ...(isNarrow ? { fontSize: 16 } : {}),
              }}
              {...(isNarrow ? nativeMobileTextareaProps(mobileOS) : { autoCorrect: 'off' as const, spellCheck: true })}
            />
          </div>
          <button type="button" style={btnPrimary} onClick={() => setListAddressNotesForId(null)}>
            Done
          </button>
        </div>
      ) : null}
    </Modal>

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
            {...(isNarrow ? nativeMobileSearchInputProps(mobileOS) : {})}
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
                <CaseAttachmentImage
                  attachment={vAtt}
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
                    {...(isNarrow ? nativeMobileTextareaProps(mobileOS) : { autoCorrect: 'off' as const, spellCheck: true })}
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
                      <CaseAttachmentImage
                        attachment={a}
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
