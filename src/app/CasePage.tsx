import {
  memo,
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
import { CaseExportModal } from './case/CaseExportModal'
import { downloadCaseAddressesTracksWorkbook } from '../lib/caseExportWorkbook'
import { downloadCaseLocationsCsv } from '../lib/caseLocationsCsv'
import { downloadCaseTracksCsv } from '../lib/caseTracksCsv'
import { EXPORT_ADDRESS_STATUS_ORDER, type CaseExportSelections } from '../lib/caseExportOptions'
import { buildCaseExportPdf, downloadCaseExportPdf, type CaseExportPdfMapImages } from '../lib/caseExportPdf'
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
  hasCaseAccess,
} from '../lib/casePermissions'
import { processCaseImageFile } from '../lib/caseImageUpload'
import type { AppUser, CanvassStatus, CaseAttachmentKind, LatLon, Location, Track, TrackPoint } from '../lib/types'
import { caseAttachmentKindLabel, statusColor, statusLabel } from '../lib/types'
import { localCaseAddressSuggestions } from '../lib/caseAddressSearchLocal'
import { GEOCODE_SCOPE, reverseGeocodeAddressText, type PlaceSuggestion } from '../lib/geocode'
import { fetchBuildingFootprint } from '../lib/building'
import { buildResolvedTrackColorMap, TRACK_DEFAULT_COLORS_FIRST_FOUR } from '../lib/trackColors'
import { parseDatetimeLocalToTimestamp, timestampToDatetimeLocalValue } from '../lib/timeFormat'
import { DvrCalculatorStep, DvrSingleDateTimePicker, ProbativeDvrFlowModals } from './ProbativeDvrFlow'
import { CASE_DESCRIPTION_MAX_CHARS, clampCaseDescription } from '../lib/caseMeta'
import {
  getMobileOS,
  nativeMobileSearchInputProps,
  nativeMobileTextInputProps,
  nativeMobileTextareaProps,
} from '../lib/mobilePlatform'
import { getGeolocationPermissionState, requestCurrentPosition } from '../lib/geolocationRequest'
import { useTargetMode } from '../lib/targetMode'
import { COMPACT_WEB_MAP_TOP_BREAKPOINT_QUERY, useMediaQuery } from '../lib/useMediaQuery'

/**
 * Case workspace (single case): high-level map of this file for maintainers.
 *
 * 1. **Props / store** — `useStore` CRUD, permission memos (`canAddCaseContentHere`, …).
 * 2. **Workspace mode** — `caseTab` (addresses vs tracking), `viewMode` (map vs list); see `CaseWorkspaceModeTabs`.
 * 3. **Map + geocode** — `AddressesMapLibre`, address search, footprint queue, `mapRef` interactions.
 * 4. **Locations** — list filters, selection, canvass result queue, DVR / probative flows.
 * 5. **Tracks** — visibility, import (`useCaseTrackImport`), playback, dock panels (`mapToolsDock*`).
 * 6. **Chrome / layout** — wide vs narrow shells, `WebCaseWorkspace`, glass toolbars, basemap cycle.
 * 7. **Modals & sync** — attachments, notes, import wizard, undo snackbar (header sync dot for cloud status).
 *
 * Geocode / footprint policy: docs/HANDOFF.md. Module index: docs/CODEMAP.md.
 */

import {
  appendToNotes,
  boundsForPdfExportFitAll,
  boundsForPdfExportFitCanvass,
  boundsForPdfExportFitPaths,
  casePhotoCarouselArrowStyle,
  extendBoundsWithLocations,
  extendBoundsWithPathPoints,
  findLocationByAddressText,
  formatAddressLineForMapList,
  isProvisionalCanvassLabel,
  LIST_STATUS_SORT_ORDER,
  OUTLINE_CONCURRENCY,
  type CanvassMapResultSession,
  type PendingAddItem,
  newCanvassMapResultSessionKey,
  readStoredCaseMapFocus,
  samePendingPin,
  sortTrackPointsStable,
  writeStoredCaseMapFocus,
} from './casePageHelpers'

import {
  buildVisitDensityHeatmapCollection,
  type VcCaseMapBasemapId,
} from './addressesMapLibreHelpers'

import { CanvassMapResultModal } from './case/CanvassMapResultModal'
import { UndoSnackbar } from './case/UndoSnackbar'
import {
  LegendChip,
  UniformFilterChipGrid,
  LocationDrawer,
  TrackPointDrawer,
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
  select,
  suggestionBtn,
} from './case/CasePageChrome'
import {
  MAP_LAYERS_GLYPH_PX,
  TrackMapVisibilityButton,
  VcCaseMapBasemapSatelliteGlyph,
  VcCaseMapLayersGlyph,
} from './case/casePageMapUi'
import { MapAddressSelectionPill, MapTrackQuickPickChip } from './case/MapSelectionGlassPills'
import { MapDockTrackRows } from './case/MapDockTrackRows'
import { TrackImportPanel } from './case/TrackImportPanel'
import {
  computeContiguousDwellSegments,
  dwellEpsilonMeters,
  filterTrackPointsForMapDisplay,
  type TrackSimplifyPreset,
} from '../lib/trackPathSimplify'
import {
  formatDwellSegmentLabel,
  getBrowserIanaTimeZone,
  isValidIanaTimeZone,
  listIanaTimeZones,
  loadStoredTrackDisplayTimeZone,
  saveTrackDisplayTimeZone,
} from '../lib/trackTimeDisplay'
import {
  isImportedCoordinatePoint,
  isMapPlacedTrackPoint,
  trackBelongsInTracksMapTab,
} from '../lib/trackPointPlacement'
import { useCaseGeocodeSearch } from './case/hooks/useCaseGeocodeSearch'
import { useCaseTrackImport } from './case/hooks/useCaseTrackImport'
import { useMapPaneOutsideDismiss } from './case/hooks/useMapPaneOutsideDismiss'
import { CaseAddressesListPanel } from './case/CaseListTab'
import { CaseWorkspaceModeTabs } from './case/CaseMapTab'
import { CaseMapTrackFloatingOverlays } from './case/CaseTrackingTab'
import { WebCaseWorkspace } from './case/web/WebCaseWorkspace'
import { CaseAttachmentImage } from './CaseAttachmentImage'
import { useTour } from './tour/TourContext'
import { TOUR_UI_ENABLED } from './tour/tourFlags'
import { VC_TOUR } from './tour/tourSteps'
import {
  vcGlassFieldFloatingMapSearch,
  vcGlassFieldOnPanel,
  vcGlassFgMutedOnPanel,
  vcGlassHeaderBtn,
  vcGlassHeaderBtnPrimary,
  vcGlassSuggestionRow,
  vcLiquidGlassPanel,
  vcLiquidGlassPanelDense,
} from '../lib/vcLiquidGlass'

const CaseBackToListButton = memo(function CaseBackToListButton(props: { onBack: () => void }) {
  return (
    <button
      type="button"
      data-vc-tour={VC_TOUR.caseBack}
      onClick={props.onBack}
      aria-label="Back to Cases"
      title="Back to Cases"
      style={{
        ...vcGlassHeaderBtn,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>
        ←
      </span>
      Cases
    </button>
  )
})

/** Longer than AddressesMapLibre SINGLE_TAP_DEFER_MS (270) so open + deferred map tap don't dismiss the dock. */
const MAP_TOOLS_DOCK_OUTSIDE_GRACE_MS = 350
/** Longer than AddressesMapLibre `SINGLE_TAP_DEFER_MS` (270) so a dock outside-dismiss cannot release a deferred map click. */
const MAP_DOCK_OUTSIDE_DISMISS_CLICK_SUPPRESS_MS = 400
/** Ignore the very next map press after dismissing address search so it does not select/add. */
const ADDR_DISMISS_GRACE_MS = 360
/** After closing floating address search, block map click handling this long (longer than SINGLE_TAP_DEFER_MS). */
const ADDR_MAP_INTERACTION_FREEZE_MS = 450
/** Default inset below map canvas (attribution / breathing room). */
const MAP_CANVAS_BOTTOM_RESERVE = 'clamp(8px, 1.2vw, 14px)'
/**
 * Narrow map top (hamburger + address pill). `body` already has `env(safe-area-inset-*)` padding (`index.css`),
 * so overlays use a fixed inset from the map card — doubling safe-area here pushed iOS chrome too far down.
 */
const NARROW_MAP_TOP_CHROME_INSET = '10px'
/** Wide map top slab: same rule as narrow (no second safe-area pass). */
const WIDE_MAP_TOP_CHROME_INSET = '10px'
/**
 * Bottom edge for narrow-map floats (Video/Subject bar): parent is the full map card, so include attribution reserve.
 * Safe-area is on `body` already; only reserve map attribution + a small margin above it.
 */
const MAP_FLOAT_BOTTOM_INSET = `calc(${MAP_CANVAS_BOTTOM_RESERVE} + 10px)`
/**
 * Floats anchored inside the map stack layer whose parent already sets `bottom: MAP_CANVAS_BOTTOM_RESERVE`.
 * Using {@link MAP_FLOAT_BOTTOM_INSET} there double-counts the reserve and pushes UI toward the map center.
 */
const MAP_FLOAT_BOTTOM_INSET_IN_STACK = '10px'
const MAP_BASEMAP_STORAGE_KEY = 'vc-case-map-basemap'

function readStoredCaseMapBasemap(): VcCaseMapBasemapId {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(MAP_BASEMAP_STORAGE_KEY) : null
    if (v === 'dark' || v === 'satellite' || v === 'streets') return v
  } catch {
    /* ignore */
  }
  return 'streets'
}

/** Cycle order: default (streets) → satellite → dark → … */
const CASE_BASEMAP_CYCLE: VcCaseMapBasemapId[] = ['streets', 'satellite', 'dark']

function nextCaseBasemap(current: VcCaseMapBasemapId): VcCaseMapBasemapId {
  const i = CASE_BASEMAP_CYCLE.indexOf(current)
  const idx = i < 0 ? 0 : (i + 1) % CASE_BASEMAP_CYCLE.length
  return CASE_BASEMAP_CYCLE[idx]
}

const TRACK_SIMPLIFY_STORAGE_KEY = 'vc.trackSimplifyPreset'

function readStoredTrackSimplifyPreset(): TrackSimplifyPreset {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(TRACK_SIMPLIFY_STORAGE_KEY) : null
    if (v === 'moderate' || v === 'aggressive' || v === 'off') return v
  } catch {
    /* ignore */
  }
  return 'moderate'
}

const PLAYBACK_SPEED_STEPS = [0.25, 0.5, 1, 2, 4] as const

function playbackDelayBetweenSteps(a: TrackPoint, b: TrackPoint, speedMult: number): number {
  const MIN = 450
  const MAX = 120_000
  const ta = a.visitedAt ?? a.createdAt
  const tb = b.visitedAt ?? b.createdAt
  let d = tb - ta
  if (!Number.isFinite(d) || d <= 0) d = MIN
  d = d / speedMult
  return Math.min(MAX, Math.max(MIN, d))
}

function caseBasemapAriaLabel(id: VcCaseMapBasemapId): string {
  switch (id) {
    case 'satellite':
      return 'Satellite'
    case 'dark':
      return 'Dark map'
    default:
      return 'Streets'
  }
}

export function CasePage(props: { caseId: string; currentUser: AppUser; onBack: () => void }) {
  const {
    data,
    createLocation,
    updateLocation,
    deleteLocation,
    restoreDeletedLocation,
    restoreDeletedTrackPoint,
    updateCase,
    addCaseAttachment,
    updateCaseAttachment,
    deleteCaseAttachment,
    createTrack,
    updateTrack,
    deleteTrack,
    deleteAllTracksForCase,
    createTrackPoint,
    createTrackPointsBulk,
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
  /** Tooltips when add/import is disabled: distinguish view-only collaborator from no access. */
  const contentMutateBlockedTitle = useMemo(() => {
    if (canAddCaseContentHere) return undefined
    return hasCaseAccess(data, props.caseId, actorId)
      ? 'View-only access — editor role required to add or change canvass data'
      : 'No access to change this case'
  }, [canAddCaseContentHere, data, props.caseId, actorId])
  const canDeleteAllTracksHere = useMemo(
    () => canDeleteAllTracksForCase(data, props.caseId, actorId),
    [data, props.caseId, actorId],
  )

  /** When false, map dock “Import coordinates” entry and panel are hidden (feature not ready). */
  const MAP_TOOLS_IMPORT_COORDINATES_ENABLED = false

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
  const isCompactWebMapTop = useMediaQuery(COMPACT_WEB_MAP_TOP_BREAKPOINT_QUERY) && !isNarrow
  const { startTour, tourOpen } = useTour()
  const mobileOS = useMemo(() => (targetMode === 'mobile' ? getMobileOS() : null), [targetMode])
  const [geoBias, setGeoBias] = useState<{ lat: number; lon: number } | null>(null)
  const mapRef = useRef<UnifiedCaseMapHandle | null>(null)
  const [caseExportOpen, setCaseExportOpen] = useState(false)
  const [caseExportBusy, setCaseExportBusy] = useState(false)
  const mapSearchCenterFallback = useCallback(() => mapRef.current?.getCenter() ?? null, [])
  const [mapBasemap, setMapBasemap] = useState<VcCaseMapBasemapId>(() => readStoredCaseMapBasemap())
  useEffect(() => {
    try {
      localStorage.setItem(MAP_BASEMAP_STORAGE_KEY, mapBasemap)
    } catch {
      /* ignore */
    }
  }, [mapBasemap])
  const cycleCaseBasemap = useCallback(() => {
    setMapBasemap((b) => nextCaseBasemap(b))
  }, [])
  const [mapLeftToolDockOpen, setMapLeftToolDockOpen] = useState(false)
  type MapToolsDockSection = 'filters' | 'views' | 'photos' | 'tracks' | 'importCoords' | 'dvr'
  type MapToolsDockRailSection = MapToolsDockSection
  const [mapLeftToolSection, setMapLeftToolSection] = useState<null | MapToolsDockSection>(null)
  useEffect(() => {
    if (!MAP_TOOLS_IMPORT_COORDINATES_ENABLED && mapLeftToolSection === 'importCoords') {
      setMapLeftToolSection(null)
    }
  }, [MAP_TOOLS_IMPORT_COORDINATES_ENABLED, mapLeftToolSection])
  /** Wide web: show Locations in sidebar only after List view is chosen; cleared by any other toolbar action. */
  const [wideSidebarListReveal, setWideSidebarListReveal] = useState(false)
  /** Addresses list panel: status filter chips collapsed until user taps Filters. */
  const [addressesListFiltersOpen, setAddressesListFiltersOpen] = useState(false)
  /** Full height of wide map tool pill (px); panel top = below pill with gap. */
  const [webWideMapDockPillFullPx, setWebWideMapDockPillFullPx] = useState(96)
  /** Wide web: vertical tools pill width so top map chrome can pad left and avoid overlapping it. */
  const [webWideMapDockPillWidthPx, setWebWideMapDockPillWidthPx] = useState(54)
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
  /** Map column dismiss scrims: native non-passive touch listeners (Safari) — see map dock touch effect. */
  const mapDockDismissScrimColumnRef = useRef<HTMLDivElement>(null)
  const mapDockDismissScrimInnerRef = useRef<HTMLDivElement>(null)
  /** Dimmed overlay behind addresses list sheet; tap closes list and suppresses map click. */
  const addressesListDismissScrimRef = useRef<HTMLDivElement>(null)
  /** Ignore outside-dismiss until this time (performance.now ms) so open + deferred map tap don't instantly close. */
  const mapToolsDockIgnoreOutsideUntilRef = useRef(0)
  const narrowMapAddressRef = useRef<HTMLDivElement>(null)
  /** Wide map: row (glass + track) and search column — dropdown top = below search, z-index over tracks. */
  const wideMapTopChromeRowRef = useRef<HTMLDivElement>(null)
  const wideMapSearchFieldRef = useRef<HTMLDivElement>(null)
  const [wideMapAddrSuggestTopPx, setWideMapAddrSuggestTopPx] = useState<number | null>(null)
  const narrowMobileMapTopChromeRowRef = useRef<HTMLDivElement>(null)
  const [narrowMapTopRowHeightPx, setNarrowMapTopRowHeightPx] = useState(56)
  const [narrowMapBottomChromeHeightPx, setNarrowMapBottomChromeHeightPx] = useState(0)
  const narrowMapBottomChromeRef = useRef<HTMLDivElement>(null)
  const mapPaneShellRef = useRef<HTMLDivElement>(null)
  const caseMapDetailOverlayRef = useRef<HTMLDivElement>(null)
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
  /** Drop duplicate map `click` bursts at the same lat/lon (e.g. touch + synthetic click). */
  const trackMapAddDedupeRef = useRef<{ t: number; lat: number; lon: number } | null>(null)
  const closeMapToolsDock = useCallback((opts?: { suppressMapFollowupMs?: number }) => {
    mapToolsDockIgnoreOutsideUntilRef.current = 0
    const ms = opts?.suppressMapFollowupMs
    if (ms != null && ms > 0) {
      mapRef.current?.suppressMapClicksFor(ms)
    }
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
  /** Map tap / add-from-search queue: record-result modal for each pending canvass pin. */
  const [canvassMapResultQueue, setCanvassMapResultQueue] = useState<CanvassMapResultSession[]>([])
  const listNotesLocation = useMemo(
    () =>
      listAddressNotesForId
        ? data.locations.find((lo) => lo.id === listAddressNotesForId) ?? null
        : null,
    [data.locations, listAddressNotesForId],
  )

  const mapChromeLocation = useMemo(() => {
    if (!selectedId) return null
    return locations.find((l) => l.id === selectedId) ?? null
  }, [selectedId, locations])

  const addressModalLocation = useMemo(() => {
    if (!selectedId) return null
    return locations.find((l) => l.id === selectedId) ?? null
  }, [selectedId, locations])

  useEffect(() => {
    if (!selectedId) setLocationDetailOpen(false)
  }, [selectedId])

  useEffect(() => {
    setListAddressNotesForId(null)
    setListRowExpandedId(null)
    setCanvassMapResultQueue([])
  }, [props.caseId])

  useEffect(() => {
    if (!listAddressNotesForId) return
    if (!data.locations.some((l) => l.id === listAddressNotesForId)) {
      setListAddressNotesForId(null)
    }
  }, [data.locations, listAddressNotesForId])

  /** Map tap on a saved pin: show the address pill; open notes via double-click on the pill (or Enter). */
  const onMapLocationPress = useCallback((id: string) => {
    setSelectedId(id)
    setLocationDetailOpen(true)
    setAddressMapModalOpen(false)
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
    if (caseTab !== 'addresses') setCanvassMapResultQueue([])
  }, [caseTab])

  /** Locations list over map (narrow always; wide when list chosen and tools panel closed). Shown in Video canvassing or Subject tracking. */
  const showAddressesListBottomSheet =
    (caseTab === 'addresses' || caseTab === 'tracking') &&
    viewMode === 'list' &&
    (isNarrow || (!isNarrow && mapLeftToolSection === null && wideSidebarListReveal))
  useEffect(() => {
    if (!showAddressesListBottomSheet) setAddressesListFiltersOpen(false)
  }, [showAddressesListBottomSheet])
  useEffect(() => {
    if (viewMode !== 'list') {
      setListRowExpandedId(null)
    }
  }, [viewMode])

  useEffect(() => {
    setListRowExpandedId((exp) => {
      if (exp == null) return null
      if (selectedId == null) return null
      return exp === selectedId ? exp : null
    })
  }, [selectedId])

  const setWorkspaceViewMode = useCallback(
    (nextViewMode: 'map' | 'list') => {
      setWorkspaceMode((prev) => {
        const next = { ...prev, viewMode: nextViewMode }
        return prev.caseTab === next.caseTab && prev.viewMode === next.viewMode ? prev : next
      })
      if (!isNarrow && nextViewMode === 'map') {
        setWideSidebarListReveal(false)
      }
      if (nextViewMode === 'list') {
        setLocationDetailOpen(false)
      }
      if (isNarrow && nextViewMode === 'list') {
        closeMapToolsDock()
      }
    },
    [closeMapToolsDock, isNarrow],
  )

  const closeAddressesListViewFromOverlay = useCallback(() => {
    mapRef.current?.clearPendingMapTap()
    mapRef.current?.suppressMapClicksFor(MAP_DOCK_OUTSIDE_DISMISS_CLICK_SUPPRESS_MS)
    setWorkspaceViewMode('map')
  }, [setWorkspaceViewMode])

  useEffect(() => {
    if (!isNarrow) {
      mapToolsDockIgnoreOutsideUntilRef.current = 0
      setMapLeftToolDockOpen(false)
      setMapLeftToolSection(null)
    }
  }, [isNarrow])

  useLayoutEffect(() => {
    if (isNarrow) {
      setWebWideMapDockPillWidthPx(0)
      return
    }
    if (caseTab !== 'tracking' && caseTab !== 'addresses') {
      setWebWideMapDockPillWidthPx(0)
      return
    }
    const el = webWideMapDockPillRef.current
    if (!el) return
    const measure = () => {
      setWebWideMapDockPillFullPx(Math.max(40, el.offsetHeight))
      setWebWideMapDockPillWidthPx(Math.max(48, Math.round(el.offsetWidth)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isNarrow, caseTab, mapLeftToolSection])

  const setWorkspaceCaseTab = useCallback((nextCaseTab: 'addresses' | 'tracking') => {
    setWorkspaceMode((prev) => {
      return prev.caseTab === nextCaseTab ? prev : { caseTab: nextCaseTab, viewMode: prev.viewMode }
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

  type UndoSnackState =
    | null
    | { kind: 'location'; snapshot: { location: Location; trackPoints: TrackPoint[] } }
    | { kind: 'trackPoint'; point: TrackPoint }
  const [undoSnack, setUndoSnack] = useState<UndoSnackState>(null)
  const undoSnackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearUndoSnackTimer = useCallback(() => {
    if (undoSnackTimerRef.current) {
      clearTimeout(undoSnackTimerRef.current)
      undoSnackTimerRef.current = null
    }
  }, [])
  const showUndoSnack = useCallback(
    (payload: Exclude<UndoSnackState, null>) => {
      clearUndoSnackTimer()
      setUndoSnack(payload)
      undoSnackTimerRef.current = window.setTimeout(() => {
        setUndoSnack(null)
        undoSnackTimerRef.current = null
      }, 8500)
    },
    [clearUndoSnackTimer],
  )
  useEffect(() => () => clearUndoSnackTimer(), [clearUndoSnackTimer])

  const removeCaseLocation = useCallback(
    async (locationId: string) => {
      const loc = locations.find((l) => l.id === locationId)
      if (!loc) return
      const orphaned = caseTrackPoints.filter((p) => p.locationId === locationId)
      const snapshot = { location: { ...loc }, trackPoints: orphaned.map((p) => ({ ...p })) }
      await deleteLocation(actorId, locationId)
      showUndoSnack({ kind: 'location', snapshot })
    },
    [actorId, caseTrackPoints, deleteLocation, locations, showUndoSnack],
  )

  const removeCaseTrackPoint = useCallback(
    async (pointId: string) => {
      const pt = caseTrackPoints.find((p) => p.id === pointId)
      if (!pt) return
      const snapshot = { ...pt }
      await deleteTrackPoint(actorId, pointId)
      showUndoSnack({ kind: 'trackPoint', point: snapshot })
    },
    [actorId, caseTrackPoints, deleteTrackPoint, showUndoSnack],
  )

  /** Map tools Tracks tab: subject paths only (empty or map-placed steps). Import-only paths → Import coordinates. */
  const caseTracksForMapDockTracksTab = useMemo(
    () => caseTracks.filter((t) => trackBelongsInTracksMapTab(t, caseTrackPoints)),
    [caseTracks, caseTrackPoints],
  )

  const caseTracksForImportCoordsPanel = useMemo(() => {
    const withImports = new Set(
      caseTrackPoints.filter((p) => isImportedCoordinatePoint(p)).map((p) => p.trackId),
    )
    return caseTracks
      .filter((t) => withImports.has(t.id))
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  }, [caseTracks, caseTrackPoints])

  const [trackSimplifyPreset, setTrackSimplifyPreset] = useState<TrackSimplifyPreset>(() => readStoredTrackSimplifyPreset())
  useEffect(() => {
    try {
      localStorage.setItem(TRACK_SIMPLIFY_STORAGE_KEY, trackSimplifyPreset)
    } catch {
      /* ignore */
    }
  }, [trackSimplifyPreset])

  const [trackDisplayTzInput, setTrackDisplayTzInput] = useState(() => loadStoredTrackDisplayTimeZone() ?? getBrowserIanaTimeZone())
  const trackDisplayTimeZone = isValidIanaTimeZone(trackDisplayTzInput) ? trackDisplayTzInput.trim() : getBrowserIanaTimeZone()
  const trackDockIanaZones = useMemo(() => listIanaTimeZones().slice().sort((a, b) => a.localeCompare(b)), [])
  useEffect(() => {
    if (isValidIanaTimeZone(trackDisplayTzInput)) saveTrackDisplayTimeZone(trackDisplayTzInput.trim())
  }, [trackDisplayTzInput])

  const [importPanelDwellExpanded, setImportPanelDwellExpanded] = useState(false)
  useEffect(() => {
    if (mapLeftToolSection !== 'importCoords') setImportPanelDwellExpanded(false)
  }, [mapLeftToolSection])

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
  /** Map dock / manage-tracks modal: double-click name to edit; single click selects track for new points. */
  const [trackListNameEditingId, setTrackListNameEditingId] = useState<string | null>(null)
  const trackNameSelectClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trackForMapAdd = useMemo(() => {
    const pool = caseTracksForMapDockTracksTab
    if (autoContinuationTrackId && pool.some((t) => t.id === autoContinuationTrackId)) return autoContinuationTrackId
    return pool[0]?.id ?? null
  }, [autoContinuationTrackId, caseTracksForMapDockTracksTab])
  const [showManageTracks, setShowManageTracks] = useState(false)

  useEffect(() => {
    if (mapLeftToolSection !== 'tracks' && mapLeftToolSection !== 'importCoords') {
      setTrackListNameEditingId(null)
    }
  }, [mapLeftToolSection])

  useEffect(() => {
    if (!showManageTracks) setTrackListNameEditingId(null)
  }, [showManageTracks])

  useEffect(() => {
    return () => {
      if (trackNameSelectClickTimerRef.current) {
        clearTimeout(trackNameSelectClickTimerRef.current)
        trackNameSelectClickTimerRef.current = null
      }
    }
  }, [])
  const [selectedTrackPointId, setSelectedTrackPointId] = useState<string | null>(null)
  /** Tracks dock = subject paths only on the map; imports stay in Import coordinates. */
  const caseTrackPointsForMapSource = useMemo(() => {
    if (mapLeftToolSection !== 'tracks') return caseTrackPoints
    return caseTrackPoints.filter((p) => isMapPlacedTrackPoint(p))
  }, [mapLeftToolSection, caseTrackPoints])

  const caseTrackPointsForMap = useMemo(
    () =>
      filterTrackPointsForMapDisplay(
        caseTrackPointsForMapSource,
        caseTracks,
        visibleTrackIds,
        trackSimplifyPreset,
        selectedTrackPointId,
      ),
    [caseTrackPointsForMapSource, caseTracks, visibleTrackIds, trackSimplifyPreset, selectedTrackPointId],
  )

  useEffect(() => {
    if (mapLeftToolSection !== 'tracks') return
    const p = selectedTrackPointId ? caseTrackPoints.find((x) => x.id === selectedTrackPointId) : null
    if (p && isImportedCoordinatePoint(p)) setSelectedTrackPointId(null)
  }, [mapLeftToolSection, selectedTrackPointId, caseTrackPoints])
  const [playbackPlaying, setPlaybackPlaying] = useState(false)
  const [playbackStepIndex, setPlaybackStepIndex] = useState(0)
  const [playbackSpeedIdx, setPlaybackSpeedIdx] = useState(2)
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playbackIndexRef = useRef(0)
  const playbackSpeedMultRef = useRef(1)
  const [addressMapModalOpen, setAddressMapModalOpen] = useState(false)
  const [trackMapModalOpen, setTrackMapModalOpen] = useState(false)
  const [trackMapTimeModalOpen, setTrackMapTimeModalOpen] = useState(false)
  /** Narrow track pill: full chrome only after user opens step detail (modal or double-tap). */
  const [trackMapPillShowFull, setTrackMapPillShowFull] = useState(false)
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
    setTrackMapPillShowFull(false)
  }, [selectedTrackPointId])

  useEffect(() => {
    setAddressMapModalOpen(false)
    setTrackMapModalOpen(false)
    setTrackMapTimeModalOpen(false)
  }, [caseTab])

  useEffect(() => {
    if (viewMode === 'list') {
      setAddressMapModalOpen(false)
      setTrackMapModalOpen(false)
      setTrackMapTimeModalOpen(false)
    }
  }, [viewMode])

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

  const {
    trackImportModalOpen,
    setTrackImportModalOpen,
    handleTrackImportCreateTrack,
    handleTrackImportPoints,
  } = useCaseTrackImport({
    caseId: props.caseId,
    actorId,
    canAddCaseContent: canAddCaseContentHere,
    caseTracksLength: caseTracks.length,
    createTrack,
    createTrackPointsBulk,
    mapRef,
    setAutoContinuationTrackId,
    setVisibleTrackIds,
    setWorkspaceCaseTab,
  })

  useEffect(() => {
    if (!autoContinuationTrackId) return
    const exists = caseTracks.some((t) => t.id === autoContinuationTrackId)
    if (!exists) {
      setAutoContinuationTrackId(caseTracksForMapDockTracksTab[0]?.id ?? null)
      return
    }
    if (!caseTracksForMapDockTracksTab.some((t) => t.id === autoContinuationTrackId)) {
      setAutoContinuationTrackId(caseTracksForMapDockTracksTab[0]?.id ?? null)
    }
  }, [caseTracks, caseTracksForMapDockTracksTab, autoContinuationTrackId])

  useEffect(() => {
    if (!selectedTrackPointId) return
    const p = caseTrackPoints.find((x) => x.id === selectedTrackPointId)
    if (!p || isImportedCoordinatePoint(p)) return
    setAutoContinuationTrackId(p.trackId)
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
    if (selectedId && !locations.some((l) => l.id === selectedId)) {
      setSelectedId(null)
    }
  }, [locations, selectedId])

  useEffect(() => {
    setCanvassMapResultQueue((q) =>
      q.filter((s) => s.mode !== 'existing' || locations.some((l) => l.id === s.locationId)),
    )
  }, [locations])

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
    isRefreshing: addrRemoteSuggestRefreshing,
  } = useCaseGeocodeSearch('', { bias: geoBias, mapCenterFallback: mapSearchCenterFallback })
  const [addrFieldFocused, setAddrFieldFocused] = useState(false)
  const addrBlurClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearAddrFieldFocusSoon = useCallback(() => {
    if (addrBlurClearRef.current) clearTimeout(addrBlurClearRef.current)
    addrBlurClearRef.current = window.setTimeout(() => {
      addrBlurClearRef.current = null
      setAddrFieldFocused(false)
      setSuggestions([])
      setLoadingSug(false)
      setAddr('')
    }, 180)
  }, [setAddr, setSuggestions, setLoadingSug])
  const { localAddrSugs, remoteAddrSugs } = useMemo(() => {
    const q = addr.trim()
    const minChars = 3
    if (q.length < minChars) {
      return { localAddrSugs: [] as PlaceSuggestion[], remoteAddrSugs: [] as PlaceSuggestion[] }
    }
    const locals = localCaseAddressSuggestions(locations, props.caseId, q, 8)
    const seen = new Set<string>()
    const localAddrSugs: PlaceSuggestion[] = []
    for (const s of locals) {
      const k = `${s.label}\0${s.lat}\0${s.lon}`
      if (seen.has(k)) continue
      seen.add(k)
      localAddrSugs.push(s)
    }
    const remoteAddrSugs: PlaceSuggestion[] = []
    for (const s of suggestions) {
      const k = `${s.label}\0${s.lat}\0${s.lon}`
      if (seen.has(k)) continue
      seen.add(k)
      remoteAddrSugs.push(s)
    }
    return { localAddrSugs, remoteAddrSugs }
  }, [addr, locations, props.caseId, suggestions])

  const mergedAddrSuggestCount = localAddrSugs.length + remoteAddrSugs.length

  const addrAutocompleteEngaged = addrFieldFocused || loadingSug || mergedAddrSuggestCount > 0
  /** Map shield / `addrSearchBlocksMapClicks` / list selection only while the field is active or loading — not stale suggestions after blur. */
  const addrSearchBlocksMapInteraction = addrFieldFocused || loadingSug
  const dismissAddressSearch = useCallback(() => {
    addrMapInteractionFreezeUntilRef.current = performance.now() + ADDR_MAP_INTERACTION_FREEZE_MS
    mapRef.current?.clearPendingMapTap()
    setAddrFieldFocused(false)
    setSuggestions([])
    setLoadingSug(false)
    setAddr('')
    addrSearchInputRef.current?.blur()
  }, [setAddr, setSuggestions, setLoadingSug])

  useEffect(() => {
    return () => {
      if (addrBlurClearRef.current) clearTimeout(addrBlurClearRef.current)
    }
  }, [])

  const canvassMapResultQueueRef = useRef(canvassMapResultQueue)
  canvassMapResultQueueRef.current = canvassMapResultQueue

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
    addrSearchBlocksMapInteraction && !probativePlacementSession && (caseTab === 'tracking' || caseTab === 'addresses')

  const postProbativeEffectiveTrackId = useMemo(() => {
    if (postProbativeMarkerPhase !== 'ask' || !caseTracksForMapDockTracksTab.length) return ''
    if (
      postProbativePickTrackId &&
      caseTracksForMapDockTracksTab.some((t) => t.id === postProbativePickTrackId)
    ) {
      return postProbativePickTrackId
    }
    return (
      autoContinuationTrackId && caseTracksForMapDockTracksTab.some((t) => t.id === autoContinuationTrackId)
        ? autoContinuationTrackId
        : caseTracksForMapDockTracksTab[0]!.id
    )
  }, [postProbativeMarkerPhase, caseTracksForMapDockTracksTab, postProbativePickTrackId, autoContinuationTrackId])

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
      if (canvassMapResultQueue.length > 0 || showManageTracks) return
      if (probativeFlow != null) return
      if (postProbativeMarkerPhase != null) return

      if (caseTab === 'tracking' && selectedTrackPointId) {
        const pt = caseTrackPoints.find((p) => p.id === selectedTrackPointId)
        if (!pt || !isMapPlacedTrackPoint(pt) || !canDeleteTrackPoint(data, actorId, pt)) return
        e.preventDefault()
        void removeCaseTrackPoint(selectedTrackPointId)
        setSelectedTrackPointId(null)
        return
      }

      if (caseTab === 'addresses' && selectedId) {
        const loc = locations.find((l) => l.id === selectedId)
        if (!loc || !canDeleteLocation(data, actorId, loc)) return
        e.preventDefault()
        if (!window.confirm('Delete this address? You can undo for a few seconds.')) return
        setProbativeFlow(null)
        void removeCaseLocation(selectedId)
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
    removeCaseLocation,
    removeCaseTrackPoint,
    canvassMapResultQueue.length,
    probativeFlow,
    selectedId,
    selectedTrackPointId,
    showManageTracks,
    postProbativeMarkerPhase,
    probativePlacementSession,
  ])

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

  const openAddLocationModal = useCallback(
    (payload: {
      lat: number
      lon: number
      addressText: string
      bounds?: Location['bounds'] | null
      vectorTileBuildingRing?: LatLon[] | null
    }) => {
      setSelectedId(null)
      setLocationDetailOpen(false)
      setAddressMapModalOpen(false)
      addCategoryInFlightRef.current = false
      setAddLocationSaving(false)
      setCanvassMapResultQueue((q) => {
        if (q.some((x) => x.mode === 'new' && samePendingPin(x, payload))) return q
        const item: CanvassMapResultSession = {
          key: newCanvassMapResultSessionKey(),
          mode: 'new',
          lat: payload.lat,
          lon: payload.lon,
          addressText: payload.addressText,
          bounds: payload.bounds ?? undefined,
          vectorTileBuildingRing: payload.vectorTileBuildingRing,
        }
        return [...q, item]
      })
    },
    [dismissAddressSearch, setAddr],
  )
  const closeAddLocationModal = useCallback(() => {
    addCategoryInFlightRef.current = false
    setAddLocationSaving(false)
    setCanvassMapResultQueue((q) => q.slice(1))
  }, [])

  const popCanvassMapResultFront = useCallback(() => {
    setCanvassMapResultQueue((q) => q.slice(1))
  }, [])

  /** One in-flight reverse lookup per map coordinate so the record-result modal can fill in street text while you keep working. */
  const pendingQueueGeoKeysRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const item of canvassMapResultQueue) {
      if (item.mode !== 'new') continue
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
          const resolvedTrim = resolved.trim()
          setCanvassMapResultQueue((q) => {
            const i = q.findIndex((x) => x.mode === 'new' && samePendingPin(x, { lat, lon }))
            if (i < 0) return q
            const cur = q[i]!
            if (cur.mode !== 'new' || !isProvisionalCanvassLabel(cur.addressText)) return q
            const dup = findLocationByAddressText(locationsRef.current, resolvedTrim)
            if (dup) {
              queueMicrotask(() => {
                setSelectedId(dup.id)
                setLocationDetailOpen(true)
                setAddressMapModalOpen(false)
              })
              return q.filter((_, j) => j !== i)
            }
            const next = q.slice()
            next[i] = { ...cur, addressText: resolvedTrim }
            return next
          })
        } finally {
          pendingQueueGeoKeysRef.current.delete(key)
        }
      })()
    }
  }, [canvassMapResultQueue])

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

  /**
   * Saved pins picked from the map (including footprint polygon hits) skip `onEnsureFootprint` once an outline
   * exists — so coordinate-only labels never got another reverse pass. Re-run geocode on each explicit map pick.
   */
  const tryResolveProvisionalAddressOnMapPick = useCallback(
    (locationId: string) => {
      const loc = locationsRef.current.find((l) => l.id === locationId)
      if (!loc || !isProvisionalCanvassLabel(loc.addressText)) return
      const id = loc.id
      const lat0 = loc.lat
      const lon0 = loc.lon
      void (async () => {
        const signal =
          typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
            ? AbortSignal.timeout(12_000)
            : undefined
        const resolved = await reverseGeocodeAddressText(lat0, lon0, signal).catch(() => null)
        if (!resolved?.trim() || isProvisionalCanvassLabel(resolved)) return
        const still = locationsRef.current.find((l) => l.id === id)
        if (!still || !isProvisionalCanvassLabel(still.addressText)) return
        void updateLocation(actorId, id, { addressText: resolved.trim() })
      })()
    },
    [actorId, updateLocation],
  )

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
    async (
      snapshot: PendingAddItem,
      status: CanvassStatus,
      notes?: string,
      opts?: { closeModalFirst?: boolean },
    ) => {
      if (addCategoryInFlightRef.current) return
      const { lat, lon, bounds, vectorTileBuildingRing } = snapshot
      const { addressText } = snapshot
      addCategoryInFlightRef.current = true
      setAddLocationSaving(true)
      if (opts?.closeModalFirst) {
        popCanvassMapResultFront()
      }
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
        if (!opts?.closeModalFirst) {
          closeAddLocationModal()
        }
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
      } catch (e) {
        console.warn('Save address failed:', e)
        const msg =
          e instanceof Error && e.message.trim()
            ? e.message
            : 'Could not save this address. Check permissions or try again.'
        window.alert(msg)
      } finally {
        setAddLocationSaving(false)
        addCategoryInFlightRef.current = false
      }
    },
    [
      actorId,
      closeAddLocationModal,
      createLocation,
      enqueueOutlineForLocation,
      popCanvassMapResultFront,
      props.caseId,
      updateLocation,
    ],
  )

  const popCanvassResultIfFrontExistingId = useCallback((locationId: string) => {
    setCanvassMapResultQueue((q) => {
      const front = q[0]
      if (front?.mode === 'existing' && front.locationId === locationId) return q.slice(1)
      return q
    })
  }, [])

  const handleProbativeAccurate = useCallback(() => {
    const f = probativeFlowRef.current
    if (!f || f.target.kind === 'dvr_only') return
    const t = f.target
    setProbativeFlow(null)
    setPostProbativeMarkerPhase('ask')
    if (t.kind === 'existing') {
      void updateLocation(actorId, t.locationId, { status: 'probativeFootage' }).then(() => {
        popCanvassResultIfFrontExistingId(t.locationId)
      })
    } else {
      void completePendingLocation(t.pending, 'probativeFootage', undefined, { closeModalFirst: true })
    }
  }, [completePendingLocation, popCanvassResultIfFrontExistingId, updateLocation])

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
        }).then(() => {
          popCanvassResultIfFrontExistingId(t.locationId)
        })
      } else {
        void completePendingLocation(t.pending, 'probativeFootage', notesAppend, { closeModalFirst: true })
      }
    },
    [
      completePendingLocation,
      data.locations,
      finalizeDvrOnlyCalculatorApply,
      popCanvassResultIfFrontExistingId,
      updateLocation,
    ],
  )

  const pickCanvassMapResultStatus = useCallback(
    async (status: CanvassStatus, sessionKey: string) => {
      if (addCategoryInFlightRef.current) return
      const q = canvassMapResultQueueRef.current
      const front = q[0]
      if (!front || front.key !== sessionKey) return

      if (status === 'probativeFootage') {
        if (front.mode === 'existing') {
          setProbativeFlow({
            step: 'accuracy',
            target: { kind: 'existing', locationId: front.locationId },
          })
        } else {
          setProbativeFlow({
            step: 'accuracy',
            target: {
              kind: 'new',
              pending: {
                lat: front.lat,
                lon: front.lon,
                addressText: front.addressText,
                bounds: front.bounds,
                vectorTileBuildingRing: front.vectorTileBuildingRing,
              },
            },
          })
        }
        return
      }

      setProbativeFlow(null)

      if (front.mode === 'existing') {
        addCategoryInFlightRef.current = true
        setAddLocationSaving(true)
        try {
          await updateLocation(actorId, front.locationId, { status })
          closeAddLocationModal()
          setLocationDetailOpen(false)
          setSelectedId(front.locationId)
          window.setTimeout(() => {
            const loc = locationsRef.current.find((l) => l.id === front.locationId)
            const m = mapRef.current
            if (loc && m) m.flyTo(loc.lat, loc.lon, Math.max(m.getZoom(), 16), { duration: 0.55 })
          }, 0)
        } finally {
          setAddLocationSaving(false)
          addCategoryInFlightRef.current = false
        }
        return
      }

      void completePendingLocation(
        {
          lat: front.lat,
          lon: front.lon,
          addressText: front.addressText,
          bounds: front.bounds,
          vectorTileBuildingRing: front.vectorTileBuildingRing,
        },
        status,
        undefined,
        { closeModalFirst: true },
      )
    },
    [actorId, closeAddLocationModal, completePendingLocation, updateLocation],
  )

  useEffect(() => {
    if (probativeFlow != null) {
      setMapLeftToolSection((s) => (s === 'dvr' ? null : s))
    }
  }, [probativeFlow])

  const recordResultModalAddressLine = useMemo(() => {
    const s = canvassMapResultQueue[0]
    if (!s) return ''
    if (s.mode === 'existing') {
      const loc = locations.find((l) => l.id === s.locationId)
      return loc ? formatAddressLineForMapList(loc.addressText) : 'Address'
    }
    return formatAddressLineForMapList(s.addressText)
  }, [canvassMapResultQueue, locations])

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

  /** Tracks with ≥1 visible map point (export modal + PDF path maps use track label). */
  const pdfPathExportChoices = useMemo(() => {
    const trackIdsWithPoints = new Set<string>()
    for (const p of caseTrackPoints) {
      if (visibleTrackIds[p.trackId] === false) continue
      if (p.showOnMap === false) continue
      trackIdsWithPoints.add(p.trackId)
    }
    return caseTracks
      .filter((t) => trackIdsWithPoints.has(t.id))
      .slice()
      .sort(
        (a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id),
      )
      .map((t) => ({ trackId: t.id, label: t.label }))
  }, [caseTracks, caseTrackPoints, visibleTrackIds])

  const addressExportStatusOptions = useMemo(
    () => EXPORT_ADDRESS_STATUS_ORDER.map((status) => ({ status, label: statusLabel(status) })),
    [],
  )

  const runCaseExport = useCallback(
    async (sel: CaseExportSelections) => {
      if (!c) return
      setCaseExportBusy(true)
      try {
        const pdfAddressLocations = locations.filter((l) => sel.exportAddressStatuses.includes(l.status))
        if (sel.csvAddresses && sel.csvTracks) {
          await downloadCaseAddressesTracksWorkbook(c.caseNumber, locations, caseTracks, caseTrackPoints)
        } else {
          if (sel.csvAddresses) downloadCaseLocationsCsv(c.caseNumber, locations)
          if (sel.csvTracks) downloadCaseTracksCsv(c.caseNumber, caseTracks, caseTrackPoints)
        }

        if (sel.pdf) {
          const mapImages: CaseExportPdfMapImages = { full: null, addresses: null, pathMaps: [] }
          const map = mapRef.current
          if (map) {
            if (sel.pdfMapFull) {
              const bb = boundsForPdfExportFitAll(filtered, locations, trackingMapPoints)
              if (bb) mapImages.full = await map.captureExportSnapshot({ mode: 'full', leafletBounds: bb })
            }
            if (sel.pdfMapAddresses) {
              const bb = boundsForPdfExportFitCanvass(pdfAddressLocations, pdfAddressLocations)
              if (bb) mapImages.addresses = await map.captureExportSnapshot({ mode: 'addresses', leafletBounds: bb })
            }
            if (sel.pdfMapTracks) {
              const validIds = sel.pdfMapPathTrackIds.filter((id) =>
                pdfPathExportChoices.some((c) => c.trackId === id),
              )
              for (const trackId of validIds) {
                const pathPts: Array<{ lat: number; lon: number }> = []
                for (const p of caseTrackPoints) {
                  if (visibleTrackIds[p.trackId] === false) continue
                  if (p.showOnMap === false) continue
                  if (p.trackId !== trackId) continue
                  pathPts.push({ lat: p.lat, lon: p.lon })
                }
                const bb = boundsForPdfExportFitPaths(pathPts)
                const choice = pdfPathExportChoices.find((x) => x.trackId === trackId)
                const pathName = choice?.label.trim() || 'Untitled path'
                const title = `Map — ${pathName}`
                const dataUrl = bb
                  ? await map.captureExportSnapshot({ mode: 'tracks', leafletBounds: bb, onlyTrackId: trackId })
                  : null
                mapImages.pathMaps.push({ title, dataUrl })
              }
            }
          }
          const doc = await buildCaseExportPdf({
            caseFile: c,
            locations: sel.pdfAddressesTable ? pdfAddressLocations : locations,
            tracks: caseTracks,
            trackPoints: caseTrackPoints,
            selections: sel,
            mapImages,
            exportedAtMs: Date.now(),
          })
          await downloadCaseExportPdf(doc, c.caseNumber)
        }
        setCaseExportOpen(false)
      } catch (e) {
        console.warn('Case export failed:', e)
      } finally {
        setCaseExportBusy(false)
      }
    },
    [c, locations, caseTracks, caseTrackPoints, filtered, trackingMapPoints, pdfPathExportChoices, visibleTrackIds],
  )

  const selectedTrackPoint = useMemo(
    () => (selectedTrackPointId ? caseTrackPoints.find((p) => p.id === selectedTrackPointId) ?? null : null),
    [caseTrackPoints, selectedTrackPointId],
  )

  const selectedTrackPointStepIndex = useMemo(() => {
    if (!selectedTrackPoint) return 0
    const tid = selectedTrackPoint.trackId
    if (isMapPlacedTrackPoint(selectedTrackPoint)) {
      const pts = caseTrackPoints
        .filter((p) => p.trackId === tid && isMapPlacedTrackPoint(p))
        .slice()
        .sort(sortTrackPointsStable)
      const i = pts.findIndex((p) => p.id === selectedTrackPoint.id)
      return i >= 0 ? i + 1 : 0
    }
    const coordPts = caseTrackPoints
      .filter((p) => p.trackId === tid && isImportedCoordinatePoint(p))
      .slice()
      .sort(sortTrackPointsStable)
    const j = coordPts.findIndex((p) => p.id === selectedTrackPoint.id)
    return j >= 0 ? j + 1 : 0
  }, [selectedTrackPoint, caseTrackPoints])

  useEffect(() => {
    if (caseTab !== 'tracking') return
    const p = selectedTrackPointId ? caseTrackPoints.find((x) => x.id === selectedTrackPointId) : null
    if (p && isImportedCoordinatePoint(p)) {
      setSelectedTrackPointId(null)
      setTrackMapModalOpen(false)
      setTrackMapTimeModalOpen(false)
      setTrackMapPillShowFull(false)
    }
  }, [caseTab, selectedTrackPointId, caseTrackPoints])

  const selectedTrackLabel = useMemo(() => {
    if (!selectedTrackPoint) return ''
    return caseTracks.find((t) => t.id === selectedTrackPoint.trackId)?.label ?? 'Track'
  }, [selectedTrackPoint, caseTracks])

  const focusTrackIdForPlayback = selectedTrackPoint?.trackId ?? autoContinuationTrackId

  /** Import coordinates panel: playback / dwell only for spreadsheet–paste points, not subject map steps. */
  const playbackTrackPointsOrdered = useMemo(() => {
    if (!focusTrackIdForPlayback) return [] as TrackPoint[]
    return caseTrackPoints
      .filter(
        (p) =>
          p.trackId === focusTrackIdForPlayback &&
          visibleTrackIds[p.trackId] !== false &&
          p.showOnMap !== false &&
          isImportedCoordinatePoint(p),
      )
      .slice()
      .sort(sortTrackPointsStable)
  }, [caseTrackPoints, focusTrackIdForPlayback, visibleTrackIds])

  const focusTrackDwellSegments = useMemo(() => {
    if (!focusTrackIdForPlayback) return []
    const sorted = caseTrackPoints
      .filter(
        (p) =>
          p.trackId === focusTrackIdForPlayback &&
          visibleTrackIds[p.trackId] !== false &&
          p.showOnMap !== false &&
          isImportedCoordinatePoint(p),
      )
      .slice()
      .sort(sortTrackPointsStable)
    return computeContiguousDwellSegments(sorted, dwellEpsilonMeters(trackSimplifyPreset))
  }, [caseTrackPoints, focusTrackIdForPlayback, visibleTrackIds, trackSimplifyPreset])

  const playbackPointsRef = useRef(playbackTrackPointsOrdered)
  playbackPointsRef.current = playbackTrackPointsOrdered

  useEffect(() => {
    playbackSpeedMultRef.current = PLAYBACK_SPEED_STEPS[playbackSpeedIdx] ?? 1
  }, [playbackSpeedIdx])

  useEffect(() => {
    setPlaybackPlaying(false)
    playbackIndexRef.current = 0
    setPlaybackStepIndex(0)
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current)
      playbackTimerRef.current = null
    }
  }, [focusTrackIdForPlayback])

  useEffect(() => {
    if (!playbackPlaying) {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
      return
    }
    const tick = () => {
      const list = playbackPointsRef.current
      const i = playbackIndexRef.current
      const cur = list[i]
      if (!cur) {
        setPlaybackPlaying(false)
        return
      }
      setSelectedTrackPointId(cur.id)
      const m = mapRef.current
      if (m) m.flyTo(cur.lat, cur.lon, Math.max(m.getZoom(), 15), { duration: 0.38 })
      if (i + 1 >= list.length) {
        setPlaybackPlaying(false)
        playbackIndexRef.current = 0
        setPlaybackStepIndex(0)
        return
      }
      const next = list[i + 1]!
      const ms = playbackDelayBetweenSteps(cur, next, playbackSpeedMultRef.current)
      playbackTimerRef.current = window.setTimeout(() => {
        playbackIndexRef.current = i + 1
        setPlaybackStepIndex(i + 1)
        tick()
      }, ms)
    }
    tick()
    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
    }
  }, [playbackPlaying])

  const startFocusTrackPlayback = useCallback(() => {
    const pts = playbackPointsRef.current
    if (pts.length < 2) return
    let start = playbackIndexRef.current
    if (start >= pts.length) start = 0
    if (selectedTrackPointId) {
      const si = pts.findIndex((p) => p.id === selectedTrackPointId)
      if (si >= 0) start = si
    }
    playbackIndexRef.current = start
    setPlaybackStepIndex(start)
    setPlaybackPlaying(true)
  }, [selectedTrackPointId])

  const pauseFocusTrackPlayback = useCallback(() => setPlaybackPlaying(false), [])
  const resetFocusTrackPlayback = useCallback(() => {
    setPlaybackPlaying(false)
    playbackIndexRef.current = 0
    setPlaybackStepIndex(0)
  }, [])

  const cyclePlaybackSpeed = useCallback(() => {
    setPlaybackSpeedIdx((i) => (i + 1) % PLAYBACK_SPEED_STEPS.length)
  }, [])

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
    trackMapPillShowFull,
    narrowMapBottomChromeHeightPx,
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
        ? `[Canvass — DVR link] ${statusLabel('probativeFootage')}. ${s.label}`
        : `[Canvass — DVR link] ${statusLabel('notProbativeFootage')}. ${s.label}`
      const mergedNotes = appendToNotes(dvrLinkLocationSession.notesAppend, canvassLine)

      setDvrLinkSaving(true)
      try {
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
      dvrLinkLocationSession,
      dvrLinkPicked,
      enqueueOutlineForLocation,
      props.caseId,
    ],
  )

  mapLeftToolDockOpenRef.current = mapLeftToolDockOpen
  useEffect(() => {
    if (mapLeftToolDockOpen) {
      mapRef.current?.clearPendingMapTap()
    }
  }, [mapLeftToolDockOpen])

  useEffect(() => {
    if (!mapLeftToolDockOpen || probativePlacementSession) return
    const touchOpts: AddEventListenerOptions = { capture: true, passive: false }
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (performance.now() < mapToolsDockIgnoreOutsideUntilRef.current) {
        mapRef.current?.clearPendingMapTap()
        return
      }
      mapRef.current?.clearPendingMapTap()
      closeMapToolsDock({ suppressMapFollowupMs: MAP_DOCK_OUTSIDE_DISMISS_CLICK_SUPPRESS_MS })
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const z22 = mapDockDismissScrimColumnRef.current
    const z80 = mapDockDismissScrimInnerRef.current
    z22?.addEventListener('touchstart', onTouchStart, touchOpts)
    z22?.addEventListener('touchmove', onTouchMove, touchOpts)
    z80?.addEventListener('touchstart', onTouchStart, touchOpts)
    z80?.addEventListener('touchmove', onTouchMove, touchOpts)
    return () => {
      z22?.removeEventListener('touchstart', onTouchStart, touchOpts)
      z22?.removeEventListener('touchmove', onTouchMove, touchOpts)
      z80?.removeEventListener('touchstart', onTouchStart, touchOpts)
      z80?.removeEventListener('touchmove', onTouchMove, touchOpts)
    }
  }, [mapLeftToolDockOpen, probativePlacementSession, closeMapToolsDock])

  useEffect(() => {
    if (!showAddressesListBottomSheet) return
    const touchOpts: AddEventListenerOptions = { capture: true, passive: false }
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      closeAddressesListViewFromOverlay()
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const el = addressesListDismissScrimRef.current
    el?.addEventListener('touchstart', onTouchStart, touchOpts)
    el?.addEventListener('touchmove', onTouchMove, touchOpts)
    return () => {
      el?.removeEventListener('touchstart', onTouchStart, touchOpts)
      el?.removeEventListener('touchmove', onTouchMove, touchOpts)
    }
  }, [showAddressesListBottomSheet, closeAddressesListViewFromOverlay])

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
    dockOutsideDismissSuppressMs: MAP_DOCK_OUTSIDE_DISMISS_CLICK_SUPPRESS_MS,
  })

  /** MapLibre only: query Carto vector `building` layers at a pin (speeds queued fetches). */
  const vectorRingLookupRef = useRef<((lat: number, lon: number) => LatLon[] | null) | null>(null)

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
      tryResolveProvisionalAddressOnMapPick(l.id)
      closeMapToolsDock()
      window.setTimeout(() => {
        const m = mapRef.current
        if (m) m.flyTo(l.lat, l.lon, Math.max(m.getZoom(), 16), { duration: 0.55 })
      }, 50)
    },
    [closeMapToolsDock, setWorkspaceCaseTab, setWorkspaceViewMode, tryResolveProvisionalAddressOnMapPick],
  )

  const canManipulateTrackPointFn = useCallback(
    (pointId: string) => {
      const p = caseTrackPoints.find((x) => x.id === pointId)
      return !!p && canEditTrackPoint(data, actorId, p)
    },
    [caseTrackPoints, data, actorId],
  )
  const canPickTrackPointOnSubjectMap = useCallback((pointId: string) => {
    const p = caseTrackPoints.find((x) => x.id === pointId)
    return !p || isMapPlacedTrackPoint(p)
  }, [caseTrackPoints])
  const onSelectTrackPointMap = useCallback((id: string) => setSelectedTrackPointId(id), [])
  const onDoubleTapTrackPointFromMap = useCallback(
    (pointId: string) => {
      const p = caseTrackPoints.find((x) => x.id === pointId)
      if (!p) return
      if (isImportedCoordinatePoint(p)) {
        if (MAP_TOOLS_IMPORT_COORDINATES_ENABLED) {
          setMapLeftToolSection('importCoords')
        }
        closeMapToolsDock()
        return
      }
      setWorkspaceCaseTab('tracking')
      setSelectedTrackPointId(pointId)
      setTrackMapPillShowFull(true)
      setTrackMapModalOpen(true)
      closeMapToolsDock()
    },
    [caseTrackPoints, setWorkspaceCaseTab, closeMapToolsDock, setMapLeftToolSection, MAP_TOOLS_IMPORT_COORDINATES_ENABLED],
  )
  const onDoubleTapLocationFromMap = useCallback(
    (locationId: string) => {
      if (!locations.some((l) => l.id === locationId)) return
      setWorkspaceCaseTab('addresses')
      setWorkspaceViewMode('map')
      setSelectedId(locationId)
      setLocationDetailOpen(true)
      setAddressMapModalOpen(true)
      tryResolveProvisionalAddressOnMapPick(locationId)
      closeMapToolsDock()
    },
    [locations, setWorkspaceCaseTab, setWorkspaceViewMode, closeMapToolsDock, tryResolveProvisionalAddressOnMapPick],
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
      trackPoints: caseTrackPointsForMap,
      visibleTrackIds,
      canManipulateTrackPoint: canManipulateTrackPointFn,
      canPickTrackPoint: caseTab === 'tracking' ? canPickTrackPointOnSubjectMap : undefined,
      onPickPoint: onSelectTrackPointMap,
      onAddPoint: (lat: number, lon: number) => {
        const placeTid = probativePlacementSession?.trackId
        const tid = placeTid ?? trackForMapAdd
        if (!tid) return
        const nowDedupe = Date.now()
        const prev = trackMapAddDedupeRef.current
        const dedupeMs = 450
        const eps = 1e-6
        if (
          prev &&
          nowDedupe - prev.t < dedupeMs &&
          Math.abs(prev.lat - lat) < eps &&
          Math.abs(prev.lon - lon) < eps
        ) {
          return
        }
        trackMapAddDedupeRef.current = { t: nowDedupe, lat, lon }
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
      caseTab,
      caseTrackPointsForMap,
      visibleTrackIds,
      trackForMapAdd,
      probativePlacementSession,
      addrSearchMapShieldActive,
      props.caseId,
      createTrackPoint,
      onSelectTrackPointMap,
      canManipulateTrackPointFn,
      canPickTrackPointOnSubjectMap,
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
            gap: 6,
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
            gap: 8,
            alignItems: 'stretch',
            flex: 1,
            minHeight: 0,
            minWidth: 0,
          },
    [isNarrow],
  )
  /**
   * Map/dock interaction invariants:
   * - selection pill z-index stays above map content (markers/paths) but below modal dialogs.
   * - outside-dismiss treats the pill wrapper (`caseMapDetailOverlayRef`) as an interactive zone.
   */
  /** Flush map canvas to card bottom on wide map views — removes idle white strip from bottom inset. */
  const wideMapUsesFullBleedMapCanvas = !isNarrow && (caseTab === 'tracking' || caseTab === 'addresses')
  const mapStackBottom: CSSProperties['bottom'] = wideMapUsesFullBleedMapCanvas ? 0 : MAP_CANVAS_BOTTOM_RESERVE
  /** Floating on map near page/card bottom with comfortable inset (above narrow mode bar when present). */
  /** Narrow: sibling of map layer (clears bottom mode bar). */
  const mapSelectionPillWrapStyle: CSSProperties = {
    position: 'absolute',
    left: '14px',
    right: '14px',
    bottom: `calc(${MAP_FLOAT_BOTTOM_INSET_IN_STACK} + ${narrowMapBottomChromeHeightPx}px + clamp(22px, 4vw, 36px))`,
    zIndex: 44,
    pointerEvents: 'auto',
    isolation: 'isolate',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 0,
  }
  /**
   * Web: must live inside the map layer wrapper (`z-index: 1`) so it anchors to the map viewport bottom
   * and stays under the top mode/search row (`z-index: 45`). Sibling pills were painting at the top.
   */
  /**
   * Wide web: selection pill band to the right of the fixed basemap chip (same bottom inset); outer layer
   * ignores pointer events so the map stays clickable except on the pill.
   */
  const mapSelectionPillWrapStyleWebInMapLayer: CSSProperties = {
    position: 'absolute',
    left: `calc(10px + 44px + clamp(12px, 2.8vw, 24px))`,
    right: '10px',
    bottom: MAP_FLOAT_BOTTOM_INSET_IN_STACK,
    zIndex: 46,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
    minWidth: 0,
    boxSizing: 'border-box',
  }
  const mapSelectionPillWrapStyleWebInMapLayerInteractive: CSSProperties = {
    pointerEvents: 'auto',
    maxWidth: '100%',
    minWidth: 0,
  }
  const mapColumnWrapperStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
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
  /**
   * Fill the map card: all children are position:absolute — a flex-only relative box would collapse to 0 height
   * and pins `bottom:` UI (notes pill) to the top. Inset 0 ties coordinates to the real map viewport.
   */
  const mapPaneMapStackAreaStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  }

  if (!c) {
    return (
      <Layout left={<CaseBackToListButton onBack={props.onBack} />} titleAlign="center" title="Case not found">
        <div style={{ color: vcGlassFgMutedOnPanel }}>This case may have been deleted.</div>
      </Layout>
    )
  }

  const addrSearchProminent =
    addrFieldFocused || loadingSug || mergedAddrSuggestCount > 0 || addr.trim().length > 0

  const renderAddAddressSearch = (
    floating: boolean,
    opts?: { glassChrome?: boolean; narrowCondensed?: boolean; mapFloatingPart?: 'input' | 'dropdown' },
  ) => {
    const glass = opts?.glassChrome === true
    const narrowCondensed = opts?.narrowCondensed === true && isNarrow
    const mapPart = opts?.mapFloatingPart
    const hintColor = glass ? vcGlassFgMutedOnPanel : '#374151'
    const pickAddrSuggestion = (s: PlaceSuggestion) => {
      if (addrBlurClearRef.current) {
        clearTimeout(addrBlurClearRef.current)
        addrBlurClearRef.current = null
      }
      dismissAddressSearch()
      setAddr('')
      openAddLocationModal({ lat: s.lat, lon: s.lon, addressText: s.label, bounds: s.bounds ?? null })
      const m = mapRef.current
      if (m) m.flyTo(s.lat, s.lon, Math.max(m.getZoom(), 16), { duration: 0.6 })
    }
    /** Floating map search: light field on blue map glass; modal / slab search uses on-panel frost. */
    const glassInput: CSSProperties = glass ? (floating ? vcGlassFieldFloatingMapSearch : vcGlassFieldOnPanel) : {}
    const glassSug: CSSProperties = glass ? { ...suggestionBtn, ...vcGlassSuggestionRow } : suggestionBtn
    const floatingMapSearchIcon =
      floating && glass ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: narrowCondensed ? 7 : 10,
            top: '50%',
            transform: 'translateY(-50%)',
            width: narrowCondensed ? 15 : 18,
            height: narrowCondensed ? 15 : 18,
            color: 'rgba(15, 23, 42, 0.38)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
      ) : null
    const addrSearchAriaLabel =
      GEOCODE_SCOPE === 'ny' ? 'Search for a New York address' : 'Search for an address'
    const addrSearchPlaceholder =
      floating && glass ? '' : GEOCODE_SCOPE === 'ny' ? 'Search NY address…' : 'Search address…'
    const addrSearchInputStyle: CSSProperties = {
      ...field,
      maxWidth: '100%',
      boxSizing: 'border-box',
      minWidth: 0,
      ...glassInput,
      ...(floating && glass
        ? narrowCondensed
          ? { padding: '3px 8px 3px 28px', minHeight: 26, lineHeight: 1.25, fontSize: 15 }
          : { padding: '6px 10px 6px 36px', minHeight: 38, lineHeight: 1.25 }
        : isNarrow
          ? { padding: '8px 10px' }
          : {}),
    }
    const addrSearchInputEl = (
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
        placeholder={addrSearchPlaceholder}
        {...(floating && glass ? { 'aria-label': addrSearchAriaLabel } : {})}
        {...(isNarrow ? nativeMobileSearchInputProps(mobileOS) : {})}
        style={addrSearchInputStyle}
      />
    )
    /** Wide: measured top = just below search field; z-index over track column. Narrow: below full chrome strip. */
    const wideSuggestBelowSearch =
      !isNarrow && floating && glass && wideMapAddrSuggestTopPx != null
    const mapFloatingDropdownPanelStyle: CSSProperties = {
      position: 'absolute',
      left: 0,
      right: 0,
      top: wideSuggestBelowSearch ? wideMapAddrSuggestTopPx : '100%',
      marginTop: wideSuggestBelowSearch ? 0 : 6,
      zIndex: wideSuggestBelowSearch ? 70 : 60,
      padding: 8,
      borderRadius: 14,
      boxSizing: 'border-box',
      maxHeight: 'min(48vh, 340px)',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      pointerEvents: 'auto',
      ...vcLiquidGlassPanel,
    }
    const mapFloatingDropdownBody = (
      <>
        {(!floating || addrSearchProminent) && GEOCODE_SCOPE === 'ny' ? (
          <div
            style={{
              color: hintColor,
              fontSize: floating ? 11 : 12,
              lineHeight: 1.35,
              marginBottom: mergedAddrSuggestCount || loadingSug ? 6 : 0,
            }}
          >
            Autocomplete is currently scoped to New York addresses.
          </div>
        ) : null}
        {!floating || addrSearchProminent ? (
          loadingSug ? (
            <div
              style={{ color: hintColor, fontSize: floating ? 11 : 12, marginBottom: mergedAddrSuggestCount ? 6 : 0 }}
            >
              {addrRemoteSuggestRefreshing ? 'Updating results…' : 'Searching…'}
            </div>
          ) : null
        ) : null}
        {mergedAddrSuggestCount ? (
          <div style={{ display: 'grid', gap: 4 }}>
            {localAddrSugs.length ? (
              <>
                <div
                  style={{
                    fontSize: floating ? 10 : 11,
                    fontWeight: 800,
                    color: hintColor,
                    opacity: 0.88,
                    letterSpacing: '0.02em',
                  }}
                >
                  On this case
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  {localAddrSugs.map((s) => (
                    <button
                      type="button"
                      key={`local-${s.lat},${s.lon},${s.label}`}
                      style={glassSug}
                      onClick={() => pickAddrSuggestion(s)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {remoteAddrSugs.length ? (
              <>
                {localAddrSugs.length ? (
                  <div
                    style={{
                      fontSize: floating ? 10 : 11,
                      fontWeight: 800,
                      color: hintColor,
                      opacity: 0.88,
                      marginTop: 4,
                      letterSpacing: '0.02em',
                    }}
                  >
                    Search
                  </div>
                ) : null}
                <div style={{ display: 'grid', gap: 4 }}>
                  {remoteAddrSugs.map((s) => (
                    <button
                      type="button"
                      key={`${s.lat},${s.lon},${s.label}`}
                      style={glassSug}
                      onClick={() => pickAddrSuggestion(s)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
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
      </>
    )
    const inputGridOnly = (
      <div style={{ display: 'grid', gap: floating ? 3 : 6 }}>
        {!floating && !isNarrow ? (
          <div style={{ fontWeight: 900, fontSize: 13 }}>Add address</div>
        ) : null}
        {floating && glass ? (
          <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
            {floatingMapSearchIcon}
            {addrSearchInputEl}
          </div>
        ) : (
          addrSearchInputEl
        )}
      </div>
    )

    if (floating && glass && mapPart === 'input') {
      return inputGridOnly
    }
    if (floating && glass && mapPart === 'dropdown') {
      const showMapFloatingDropdown = mergedAddrSuggestCount > 0 || loadingSug || addrSearchProminent
      if (!showMapFloatingDropdown) return null
      return <div style={mapFloatingDropdownPanelStyle}>{mapFloatingDropdownBody}</div>
    }
    if (floating && glass && !mapPart) {
      return inputGridOnly
    }

    return (
      <div style={{ display: 'grid', gap: floating ? 3 : 6 }}>
        {!floating && !isNarrow ? (
          <div style={{ fontWeight: 900, fontSize: 13 }}>Add address</div>
        ) : null}
        {floating && glass ? (
          <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
            {floatingMapSearchIcon}
            {addrSearchInputEl}
          </div>
        ) : (
          addrSearchInputEl
        )}
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
            <div style={{ color: hintColor, fontSize: floating ? 11 : 12 }}>
              {addrRemoteSuggestRefreshing ? 'Updating results…' : 'Searching…'}
            </div>
          ) : null
        ) : null}
        {mergedAddrSuggestCount ? (
          <div
            style={{
              display: 'grid',
              gap: floating ? 3 : 6,
              maxHeight: isNarrow ? `min(${floating ? 150 : 220}px, ${floating ? 28 : 36}vh)` : undefined,
              overflowY: isNarrow ? 'auto' : undefined,
              WebkitOverflowScrolling: isNarrow ? 'touch' : undefined,
            }}
          >
            {localAddrSugs.length ? (
              <>
                <div
                  style={{
                    fontSize: floating ? 10 : 11,
                    fontWeight: 800,
                    color: hintColor,
                    opacity: 0.88,
                    letterSpacing: '0.02em',
                  }}
                >
                  On this case
                </div>
                <div style={{ display: 'grid', gap: floating ? 3 : 6 }}>
                  {localAddrSugs.map((s) => (
                    <button
                      type="button"
                      key={`local-${s.lat},${s.lon},${s.label}`}
                      style={glassSug}
                      onClick={() => pickAddrSuggestion(s)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
            {remoteAddrSugs.length ? (
              <>
                {localAddrSugs.length ? (
                  <div
                    style={{
                      fontSize: floating ? 10 : 11,
                      fontWeight: 800,
                      color: hintColor,
                      opacity: 0.88,
                      marginTop: 4,
                      letterSpacing: '0.02em',
                    }}
                  >
                    Search
                  </div>
                ) : null}
                <div style={{ display: 'grid', gap: floating ? 3 : 6 }}>
                  {remoteAddrSugs.map((s) => (
                    <button
                      type="button"
                      key={`${s.lat},${s.lon},${s.label}`}
                      style={glassSug}
                      onClick={() => pickAddrSuggestion(s)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
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

  const selectTrackQuickPick = useCallback(
    (trackId: string) => {
      setAutoContinuationTrackId(trackId)
      setVisibleTrackIds((prev) => ({ ...prev, [trackId]: true }))
      setWorkspaceCaseTab('tracking')
    },
    [setWorkspaceCaseTab],
  )
  const cancelPendingTrackNameSelectClick = useCallback(() => {
    if (trackNameSelectClickTimerRef.current) {
      clearTimeout(trackNameSelectClickTimerRef.current)
      trackNameSelectClickTimerRef.current = null
    }
  }, [])
  const scheduleSelectTrackFromNameClick = useCallback(
    (trackId: string) => {
      cancelPendingTrackNameSelectClick()
      trackNameSelectClickTimerRef.current = setTimeout(() => {
        trackNameSelectClickTimerRef.current = null
        selectTrackQuickPick(trackId)
      }, 280)
    },
    [cancelPendingTrackNameSelectClick, selectTrackQuickPick],
  )
  const mapFilterUniformGridChipRoot = useMemo(
    () =>
      ({
        width: '100%' as const,
        maxWidth: 'none' as const,
      }) satisfies CSSProperties,
    [],
  )
  const filterChipsMeasureKey = `${isNarrow ? 1 : 0}-${counts.noCameras}-${counts.camerasNoAnswer}-${counts.notProbativeFootage}-${counts.probativeFootage}`
  const filterLegendChipsGridDock = (
    <UniformFilterChipGrid columnCount={2} measureKey={filterChipsMeasureKey}>
      <LegendChip
        dockCompact
        rootStyle={mapFilterUniformGridChipRoot}
        label={statusLabel('noCameras')}
        count={counts.noCameras}
        color={statusColor('noCameras')}
        on={filters.noCameras}
        onToggle={() => setFilters((f) => ({ ...f, noCameras: !f.noCameras }))}
      />
      <LegendChip
        dockCompact
        rootStyle={mapFilterUniformGridChipRoot}
        label={statusLabel('camerasNoAnswer')}
        count={counts.camerasNoAnswer}
        color={statusColor('camerasNoAnswer')}
        on={filters.camerasNoAnswer}
        onToggle={() => setFilters((f) => ({ ...f, camerasNoAnswer: !f.camerasNoAnswer }))}
      />
      <LegendChip
        dockCompact
        rootStyle={mapFilterUniformGridChipRoot}
        label={statusLabel('notProbativeFootage')}
        count={counts.notProbativeFootage}
        color={statusColor('notProbativeFootage')}
        on={filters.notProbativeFootage}
        onToggle={() => setFilters((f) => ({ ...f, notProbativeFootage: !f.notProbativeFootage }))}
      />
      <LegendChip
        dockCompact
        rootStyle={mapFilterUniformGridChipRoot}
        label={statusLabel('probativeFootage')}
        count={counts.probativeFootage}
        color={statusColor('probativeFootage')}
        on={filters.probativeFootage}
        onToggle={() => setFilters((f) => ({ ...f, probativeFootage: !f.probativeFootage }))}
      />
    </UniformFilterChipGrid>
  )

  /**
   * Primary glass button recipe (`btnPrimary` + responsive padding/font) for map tools rail
   * (Views, Filters, …) and Views dock actions (List / Fit / Locate).
   */
  const mapDockViewsChromeBtn = (active: boolean): CSSProperties => ({
    ...btnPrimary,
    fontSize: 'clamp(10px, 0.98vw, 12px)',
    padding: 'clamp(5px, 0.9vw, 9px) clamp(8px, 1.2vw, 12px)',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    margin: 0,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    alignSelf: 'stretch',
    flexShrink: 0,
    WebkitTapHighlightColor: 'transparent',
    ...(active
      ? {
          border: '1px solid rgba(15, 23, 42, 0.2)',
          background: 'linear-gradient(180deg, rgba(226,232,240,0.98) 0%, rgba(186,198,210,0.92) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 16px rgba(15,23,42,0.14)',
        }
      : {}),
  })

  /** Views panel only: same padding/font as Add Photo (`btnPrimary` + clamps), centered label. */
  const mapViewPanelActionBtn = (active: boolean): CSSProperties => ({
    ...mapDockViewsChromeBtn(active),
    textAlign: 'center',
  })

  const runLocateMe = useCallback(async () => {
    if (isNarrow) closeMapToolsDock()
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      window.alert('Location is not available in this browser.')
      return
    }

    const applyUserPosition = (position: GeolocationPosition) => {
      const m = mapRef.current
      if (m) {
        m.flyTo(
          position.coords.latitude,
          position.coords.longitude,
          Math.max(m.getZoom(), 16),
          { duration: 0.6 },
        )
        if (!isNarrow) {
          setMapLeftToolSection(null)
          setWideSidebarListReveal(false)
        }
      }
    }

    const failMessage = (code: 'denied' | 'timeout' | 'unavailable' | 'unknown' | 'unsupported') => {
      switch (code) {
        case 'denied':
          return 'Location permission was denied.'
        case 'timeout':
          return 'Location timed out. Try again with GPS/Wi‑Fi location on.'
        case 'unavailable':
          return 'Your device could not determine a position.'
        default:
          return 'Could not get your location.'
      }
    }

    const perm = await getGeolocationPermissionState()
    if (perm === 'denied') {
      const tryAfterEnabling = window.confirm(
        'Location is turned off for this site. To use Locate me, allow location in your browser or site settings.\n\nTap OK to try again (for example, after you change the setting). Tap Cancel to close.',
      )
      if (!tryAfterEnabling) return
    }

    let res = await requestCurrentPosition()
    if (res.ok) {
      applyUserPosition(res.position)
      return
    }

    if (res.code === 'denied' && perm !== 'denied') {
      const tryAgain = window.confirm(
        'Location permission was denied. Would you like to try again? Your browser may show the permission prompt again.',
      )
      if (!tryAgain) return
      res = await requestCurrentPosition()
      if (res.ok) {
        applyUserPosition(res.position)
        return
      }
    }

    if (!res.ok) {
      window.alert(
        res.code === 'denied' && perm === 'denied'
          ? 'Location is still blocked for this site. Allow location in your browser or site settings, then tap Locate me again.'
          : failMessage(res.code),
      )
    }
  }, [closeMapToolsDock, isNarrow])

  const mapViewFitLocateButtons = (
    <>
      <button
        type="button"
        data-vc-tour={VC_TOUR.caseListViewBtn}
        style={mapViewPanelActionBtn(viewMode === 'list')}
        onClick={() => {
          setWorkspaceViewMode('list')
          if (isNarrow) closeMapToolsDock()
          else {
            setMapLeftToolSection(null)
            setWideSidebarListReveal(true)
          }
        }}
      >
        List View
      </button>
      <button
        type="button"
        style={{
          ...mapViewPanelActionBtn(false),
          ...(!locations.length ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
        }}
        onClick={() => {
          fitMapToCanvass()
          if (isNarrow) closeMapToolsDock()
          else {
            setMapLeftToolSection(null)
            setWideSidebarListReveal(false)
          }
        }}
        disabled={!locations.length}
        title="Zoom to Canvass Pins"
      >
        Fit Canvass
      </button>
      <button
        type="button"
        style={{
          ...mapViewPanelActionBtn(false),
          ...(!trackingMapPoints.length ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
        }}
        onClick={() => {
          fitMapToPaths()
          if (isNarrow) closeMapToolsDock()
          else {
            setMapLeftToolSection(null)
            setWideSidebarListReveal(false)
          }
        }}
        disabled={!trackingMapPoints.length}
        title="Zoom to Visible Tracks"
      >
        Fit Paths
      </button>
      <button
        type="button"
        style={{
          ...mapViewPanelActionBtn(false),
          ...(!locations.length && !trackingMapPoints.length ? { opacity: 0.45, cursor: 'not-allowed' } : {}),
        }}
        onClick={() => {
          fitMapToAll()
          if (isNarrow) closeMapToolsDock()
          else {
            setMapLeftToolSection(null)
            setWideSidebarListReveal(false)
          }
        }}
        disabled={!locations.length && !trackingMapPoints.length}
        title="Zoom to Show Everything"
      >
        Fit All
      </button>
      <button type="button" style={mapViewPanelActionBtn(false)} onClick={() => void runLocateMe()}>
        Locate Me
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
            Add Photo
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

  /**
   * Left top slab: Video canvassing | Subject tracking | address search on one row (chips sit in a sibling slab).
   * `pointer-events: none` on the slab so `flex: 1 1 0` empty glass does not cover the map — restores map cursor/hover.
   * Interactive descendants set `pointer-events: auto` (mode bar grid, address search wrapper).
   */
  const mapTopModeAndSearchGlassStyle: CSSProperties = {
    ...vcLiquidGlassPanel,
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'row',
    flexWrap: isCompactWebMapTop ? 'wrap' : 'nowrap',
    alignItems: 'center',
    justifyContent: isCompactWebMapTop ? 'center' : undefined,
    gap: 10,
    padding: '8px 12px',
    pointerEvents: 'none',
    flex: isCompactWebMapTop ? '1 1 auto' : '1 1 0',
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'visible',
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
    ...vcLiquidGlassPanel,
    borderRadius: 16,
  }
  const mapDockNarrowToolPanelGlass: CSSProperties = {
    ...vcLiquidGlassPanel,
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
    ? {
        ...mapDockNarrowToolPanelGlass,
        maxHeight: 'none',
        overflowY: 'visible',
        overflowX: 'visible',
        padding: 8,
        marginTop: 4,
        width: 'fit-content',
        minWidth: 'min-content',
        maxWidth: 'none',
      }
    : {
        ...webWideMapToolPanelGlass,
        padding: 8,
        overflowX: 'visible',
        overflowY: 'visible',
        width: 'fit-content',
        maxWidth: '100%',
      }

  const trackDockSegBtn = (active: boolean): CSSProperties => ({
    ...btn,
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    padding: '6px 8px',
    borderColor: active
      ? isNarrow
        ? '#111827'
        : 'rgba(255,255,255,0.45)'
      : isNarrow
        ? 'rgba(148, 163, 184, 0.55)'
        : 'rgba(148, 163, 184, 0.45)',
    background: active ? (isNarrow ? 'rgba(15, 23, 42, 0.08)' : 'rgba(30, 41, 59, 0.55)') : 'transparent',
    color: isNarrow ? '#111827' : active ? '#f8fafc' : '#cbd5e1',
  })

  /** Match floating map top chrome — `body` safe-area already applied; fixed gutters on the map card. */
  const narrowMapTopChromeInsetTopStr = NARROW_MAP_TOP_CHROME_INSET
  const narrowMapTopChromeInsetLeftStr = '10px'
  const narrowMapTopChromeInsetRightStr = '10px'

  /** Left inset for map top chrome (zoom controls removed). */
  const narrowMapTopReserveLeft = '10px'

  /**
   * Narrow map top: one liquid-glass pill (matches web map top slab) with ☰, address search, and track chips in one row.
   */
  const mapTopNarrowUnifiedToolbarGlassStyle: CSSProperties = {
    ...vcLiquidGlassPanel,
    borderRadius: 20,
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    pointerEvents: 'none',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    minHeight: 44,
    boxSizing: 'border-box',
    /** Must stay visible so the floating address dropdown (`top: 100%`) is not clipped under the pill. */
    overflow: 'visible',
  }

  const narrowMapDockExpandedGlassShell: CSSProperties = useMemo(
    () => ({
      ...vcLiquidGlassPanel,
      borderRadius: 16,
      padding: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      /** `stretch` + `max-content` shell used nav button width and clipped the wider filter grid. */
      alignItems: mapLeftToolSection === 'filters' ? 'flex-start' : 'stretch',
      minWidth: 'min-content',
      width: 'max-content',
      maxWidth:
        mapLeftToolSection === 'filters'
          ? 'calc(100vw - 20px)'
          : 'min(280px, calc(100vw - 48px))',
      maxHeight:
        mapLeftToolSection === 'filters'
          ? 'none'
          : detailOverlayHeightPx > 0
            ? `min(65vh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${detailOverlayHeightPx + 100}px))`
            : 'min(65vh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 120px))',
      overflowY: mapLeftToolSection === 'filters' ? 'visible' : 'auto',
      overflowX: 'visible',
      WebkitOverflowScrolling: 'touch',
      boxSizing: 'border-box',
    }),
    [mapLeftToolSection, detailOverlayHeightPx],
  )

  const narrowMapDockPositionedShellMaxW = useMemo(
    () =>
      mapLeftToolSection === 'filters' ? 'calc(100vw - 20px)' : 'min(280px, calc(100vw - 24px))',
    [mapLeftToolSection],
  )

  /** Shared 44×44 glass chip: basemap cycle button + narrow map tools face (pixel-matched). */
  const mapLayersGlassChipFaceStyle: CSSProperties = {
    ...vcLiquidGlassPanelDense,
    width: 44,
    minWidth: 44,
    maxWidth: 44,
    minHeight: 44,
    height: 44,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    boxSizing: 'border-box',
    WebkitTapHighlightColor: 'transparent',
  }
  /**
   * Hamburger inside narrow unified map toolbar: parent row is already `vcLiquidGlassPanel`.
   * Use a light frost well (header-ghost style) instead of a second liquid-glass slab so it doesn’t read as a dark nested tile.
   */
  const mapDockMenuToggleFaceNarrowStyle: CSSProperties = {
    width: 44,
    minWidth: 44,
    maxWidth: 44,
    minHeight: 44,
    height: 44,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    boxSizing: 'border-box',
    WebkitTapHighlightColor: 'transparent',
    pointerEvents: 'none',
    border: '1px solid rgba(255,255,255,0.28)',
    background: 'rgba(255,255,255,0.14)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
  }
  const dockRailBtnActive = (section: MapToolsDockRailSection) => mapLeftToolSection === section

  const renderDockSectionButton = (section: MapToolsDockRailSection, label: string) => (
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
      style={mapDockViewsChromeBtn(dockRailBtnActive(section))}
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
    ...vcLiquidGlassPanel,
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
  const webDockToolIconSvg = (section: MapToolsDockRailSection) => {
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
      case 'importCoords':
        return (
          <svg {...p} aria-hidden>
            <path d="M12 3v10" />
            <path d="m8.5 9.5 3.5-3.5 3.5 3.5" />
            <rect x="4" y="16" width="16" height="5" rx="1.25" />
            <path d="M8 16V14a4 4 0 0 1 8 0v2" />
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
  const renderWebDockSectionButton = (section: MapToolsDockRailSection, label: string) => {
    const active = dockRailBtnActive(section)
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
      Visit Density Heatmap
    </label>
  )

  const mapToolsDockViewsPanel =
    mapLeftToolSection === 'views' ? (
      <div style={mapDockPanelShellForMapTools}>
        <div
          className="case-pane-actions-row"
          style={{
            display: 'grid',
            gap: 8,
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

  const renderTrackDockNameField =
    (mode: 'subjectMapAdd' | 'importManage') =>
    (t: Track, canEditT: boolean, inputStyle: CSSProperties) => {
      const isEditing = trackListNameEditingId === t.id
      const isActive = mode === 'subjectMapAdd' && trackForMapAdd === t.id
      const lineColor = resolvedTrackColors.get(t.id) ?? TRACK_DEFAULT_COLORS_FIRST_FOUR[0]
      const inactiveBorder = isNarrow ? '1px solid rgba(148, 163, 184, 0.45)' : '1px solid rgba(255,255,255,0.28)'

      if (isEditing && canEditT) {
        return (
          <input
            autoFocus
            value={trackLabelDrafts[t.id] ?? t.label}
            aria-label="Track name"
            placeholder="Track name"
            title="Rename Track"
            onFocus={() => {
              trackLabelFocusRef.current[t.id] = true
            }}
            onBlur={(e) => {
              trackLabelFocusRef.current[t.id] = false
              const v = e.currentTarget.value
              setTrackLabelDrafts((prev) => ({ ...prev, [t.id]: v }))
              setTrackListNameEditingId(null)
              flushTrackLabelPersist(t.id, v)
            }}
            onChange={(e) => {
              const v = e.target.value
              setTrackLabelDrafts((prev) => ({ ...prev, [t.id]: v }))
              scheduleTrackLabelPersist(t.id, v)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.currentTarget.blur()
              }
            }}
            {...(isNarrow ? nativeMobileTextInputProps(mobileOS) : {})}
            style={{
              ...inputStyle,
              border: isActive ? `2px solid ${lineColor}` : inactiveBorder,
              fontWeight: isActive ? 800 : 600,
            }}
          />
        )
      }

      return (
        <button
          type="button"
          onClick={
            mode === 'subjectMapAdd' ? () => scheduleSelectTrackFromNameClick(t.id) : undefined
          }
          onDoubleClick={(e) => {
            e.preventDefault()
            cancelPendingTrackNameSelectClick()
            if (!canEditT) return
            trackLabelFocusRef.current[t.id] = true
            setTrackListNameEditingId(t.id)
          }}
          style={{
            ...inputStyle,
            cursor: canEditT ? 'pointer' : 'default',
            border: isActive ? `2px solid ${lineColor}` : inactiveBorder,
            fontWeight: isActive ? 800 : 600,
            textAlign: 'left',
            boxSizing: 'border-box',
          }}
          aria-pressed={isActive}
          title={
            mode === 'importManage'
              ? canEditT
                ? 'Double-click to rename this path.'
                : 'Path name'
              : canEditT
                ? 'Click to use this track for new map points. Double-click to rename.'
                : 'Click to use this track for new map points.'
          }
        >
          {(trackLabelDrafts[t.id] ?? t.label).trim() || 'Track'}
        </button>
      )
    }

  const mapDockToggleTrackVisibility = useCallback((trackId: string) => {
    setVisibleTrackIds((prev) => {
      const wasVisible = prev[trackId] !== false
      return { ...prev, [trackId]: !wasVisible }
    })
  }, [])

  const mapDockRequestDeleteTrack = useCallback(
    (t: Track) => {
      if (!window.confirm(`Delete "${t.label}" and every step on it? This cannot be undone.`)) return
      const pointsAfterDelete = caseTrackPoints.filter((p) => p.trackId !== t.id)
      const remaining = caseTracks.filter((x) => x.id !== t.id)
      const nextTrackId =
        remaining.find((tr) => trackBelongsInTracksMapTab(tr, pointsAfterDelete))?.id ?? null
      const clearStep =
        !!selectedTrackPointId && caseTrackPoints.some((p) => p.id === selectedTrackPointId && p.trackId === t.id)
      void deleteTrack(actorId, t.id).then(() => {
        setVisibleTrackIds((prev) => {
          const next = { ...prev }
          delete next[t.id]
          return next
        })
        if (autoContinuationTrackId === t.id) setAutoContinuationTrackId(nextTrackId)
        if (clearStep) setSelectedTrackPointId(null)
      })
    },
    [actorId, caseTracks, caseTrackPoints, selectedTrackPointId, autoContinuationTrackId, deleteTrack],
  )

  const mapDockRouteColorChange = useCallback(
    (trackId: string, color: string) => {
      void updateTrack(actorId, trackId, { routeColor: color })
    },
    [actorId, updateTrack],
  )

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
              color: isNarrow ? '#6b7280' : '#cbd5e1',
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
              title={contentMutateBlockedTitle}
              onClick={() => {
                if (!canAddCaseContentHere) return
                setWorkspaceCaseTab('tracking')
                const label = `Track ${caseTracks.length + 1}`
                void createTrack({ caseId: props.caseId, createdByUserId: actorId, label, kind: 'person' }).then((id) => {
                  setSelectedTrackPointId(null)
                  setAutoContinuationTrackId(id)
                  setVisibleTrackIds((prev) => ({ ...prev, [id]: true }))
                  trackLabelFocusRef.current[id] = true
                  setTrackListNameEditingId(id)
                })
              }}
            >
              New Track
            </button>
            {caseTracksForMapDockTracksTab.length === 0 ? (
              <div style={{ fontSize: 12, color: isNarrow ? '#6b7280' : '#cbd5e1', lineHeight: 1.45 }}>
                {caseTracks.length > 0 ? (
                  <>
                    Every path in this case only has imported coordinates — they stay in{' '}
                    <strong>Import Coordinates</strong>. Use <strong>New Track</strong> here to start a subject path
                    (map-placed steps).
                  </>
                ) : (
                  <>
                    No paths yet — add one for subject tracking (map-placed steps). Imported coordinates live only in{' '}
                    <strong>Import Coordinates</strong>.
                  </>
                )}
              </div>
            ) : (
              <MapDockTrackRows
                isNarrow={isNarrow}
                caseTracks={caseTracksForMapDockTracksTab}
                visibleTrackIds={visibleTrackIds}
                trackForMapAdd={trackForMapAdd}
                resolvedTrackColors={resolvedTrackColors}
                defaultLineColor={TRACK_DEFAULT_COLORS_FIRST_FOUR[0]}
                onToggleTrackVisibility={mapDockToggleTrackVisibility}
                canEditTrack={(t) => canEditTrack(data, actorId, t)}
                canDeleteTrack={(t) => canDeleteTrack(data, actorId, t)}
                onRouteColorChange={mapDockRouteColorChange}
                onRequestDeleteTrack={mapDockRequestDeleteTrack}
                renderNameField={renderTrackDockNameField('subjectMapAdd')}
              />
            )}
            {caseTracksForMapDockTracksTab.length > 0 && caseTrackPoints.some((p) => isImportedCoordinatePoint(p)) ? (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: isNarrow ? '#6b7280' : '#94a3b8',
                }}
              >
                This tab lists subject paths only. While it is open, the map hides imported pins and solid segments — open{' '}
                <strong>Import Coordinates</strong> to work with imports.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {MAP_TOOLS_IMPORT_COORDINATES_ENABLED && mapLeftToolSection === 'importCoords' ? (
        <div style={mapDockPanelShellForMapTools}>
          <div style={{ display: 'grid', gap: 8, width: '100%', minWidth: 0 }}>
            <div style={{ fontSize: 12, color: isNarrow ? '#6b7280' : '#cbd5e1', lineHeight: 1.45 }}>
              Import pasted pairs or spreadsheet columns here. Pick any path in the wizard (including import-only paths).
              Subject paths are listed in the map <strong>Tracks</strong> tab. Map styling: subject steps are dashed; imports
              are solid on the path.
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: isNarrow ? '#6b7280' : '#94a3b8',
                  marginBottom: 4,
                }}
              >
                Paths with Imported Coordinates
              </div>
              {caseTracksForImportCoordsPanel.length === 0 ? (
                <div style={{ fontSize: 11, color: isNarrow ? '#6b7280' : '#94a3b8', lineHeight: 1.4 }}>
                  None yet — run <strong>Import Coordinates…</strong> to add a path.
                </div>
              ) : (
                <MapDockTrackRows
                  isNarrow={isNarrow}
                  caseTracks={caseTracksForImportCoordsPanel}
                  visibleTrackIds={visibleTrackIds}
                  trackForMapAdd={null}
                  colorInputIdPrefix="import-dock-track-color"
                  resolvedTrackColors={resolvedTrackColors}
                  defaultLineColor={TRACK_DEFAULT_COLORS_FIRST_FOUR[0]}
                  onToggleTrackVisibility={mapDockToggleTrackVisibility}
                  canEditTrack={(t) => canEditTrack(data, actorId, t)}
                  canDeleteTrack={(t) => canDeleteTrack(data, actorId, t)}
                  onRouteColorChange={mapDockRouteColorChange}
                  onRequestDeleteTrack={mapDockRequestDeleteTrack}
                  renderNameField={renderTrackDockNameField('importManage')}
                />
              )}
            </div>
            <button
              type="button"
              style={{ ...btnPrimary, width: '100%', boxSizing: 'border-box', fontSize: 12 }}
              disabled={!canAddCaseContentHere}
              title={contentMutateBlockedTitle}
              onClick={() => setTrackImportModalOpen(true)}
            >
              Import Coordinates…
            </button>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: isNarrow ? '#6b7280' : '#94a3b8',
                  marginBottom: 4,
                }}
              >
                Map Path (Dense Tracks)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['off', 'moderate', 'aggressive'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    style={trackDockSegBtn(trackSimplifyPreset === preset)}
                    onClick={() => setTrackSimplifyPreset(preset)}
                  >
                    {preset === 'off' ? 'Off' : preset === 'moderate' ? 'Moderate' : 'Aggressive'}
                  </button>
                ))}
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: isNarrow ? '#9ca3af' : '#94a3b8',
                  lineHeight: 1.35,
                  marginTop: 2,
                }}
              >
                Affects map drawing only; every step stays in your case.
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: isNarrow ? '#6b7280' : '#94a3b8',
                  marginBottom: 4,
                }}
              >
                Step Times (Dwell Labels)
              </div>
              <input
                list="vc-track-display-tz-datalist"
                value={trackDisplayTzInput}
                onChange={(e) => setTrackDisplayTzInput(e.target.value)}
                onBlur={() => {
                  if (!isValidIanaTimeZone(trackDisplayTzInput)) setTrackDisplayTzInput(getBrowserIanaTimeZone())
                }}
                style={{
                  ...field,
                  width: '100%',
                  boxSizing: 'border-box',
                  fontSize: 12,
                  padding: '6px 8px',
                  color: '#111827',
                  background: isNarrow ? '#fff' : 'rgba(248,250,252,0.95)',
                }}
                autoCorrect="off"
                spellCheck={false}
              />
              <datalist id="vc-track-display-tz-datalist">
                {trackDockIanaZones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
              {!isValidIanaTimeZone(trackDisplayTzInput) ? (
                <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 2 }}>Invalid zone; using this device zone until fixed.</div>
              ) : null}
            </div>
            {caseTracks.length > 0 ? (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: isNarrow ? '#6b7280' : '#94a3b8',
                    marginBottom: 4,
                  }}
                >
                  Playback (Imported Coordinates only)
                  {focusTrackIdForPlayback
                    ? ` · ${caseTracks.find((x) => x.id === focusTrackIdForPlayback)?.label ?? 'track'}`
                    : ''}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    style={{ ...btn, fontSize: 11, padding: '6px 10px' }}
                    disabled={playbackTrackPointsOrdered.length < 2}
                    onClick={() => (playbackPlaying ? pauseFocusTrackPlayback() : startFocusTrackPlayback())}
                  >
                    {playbackPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    type="button"
                    style={{ ...btn, fontSize: 11, padding: '6px 10px' }}
                    disabled={playbackTrackPointsOrdered.length < 2}
                    onClick={resetFocusTrackPlayback}
                  >
                    Reset
                  </button>
                  <button type="button" style={{ ...btn, fontSize: 11, padding: '6px 10px' }} onClick={cyclePlaybackSpeed}>
                    {PLAYBACK_SPEED_STEPS[playbackSpeedIdx] ?? 1}× Speed
                  </button>
                  <span style={{ fontSize: 10, color: isNarrow ? '#6b7280' : '#94a3b8' }}>
                    Step {Math.min(playbackStepIndex + 1, Math.max(playbackTrackPointsOrdered.length, 1))} /{' '}
                    {playbackTrackPointsOrdered.length || 0}
                  </span>
                </div>
                {focusTrackDwellSegments.length > 0 ? (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => setImportPanelDwellExpanded((o) => !o)}
                      style={{
                        ...btn,
                        width: '100%',
                        boxSizing: 'border-box',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '6px 8px',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span>
                        Dwell Segments (Copy){' '}
                        <span style={{ fontWeight: 600, opacity: 0.85 }}>({focusTrackDwellSegments.length})</span>
                      </span>
                      <span aria-hidden>{importPanelDwellExpanded ? '▼' : '▶'}</span>
                    </button>
                    {importPanelDwellExpanded ? (
                      <div style={{ display: 'grid', gap: 4, maxHeight: 160, overflowY: 'auto', marginTop: 6 }}>
                        {focusTrackDwellSegments.map((seg, idx) => {
                          const label = formatDwellSegmentLabel(
                            seg.startStepNum,
                            seg.endStepNum,
                            seg.startMs,
                            seg.endMs,
                            trackDisplayTimeZone,
                          )
                          return (
                            <div
                              key={`${seg.startStepNum}-${seg.endStepNum}-${idx}`}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 6,
                                fontSize: 10,
                                lineHeight: 1.35,
                                color: isNarrow ? '#374151' : '#e2e8f0',
                              }}
                            >
                              <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
                              <button
                                type="button"
                                style={{ ...btn, flexShrink: 0, fontSize: 10, padding: '4px 8px' }}
                                onClick={() => void navigator.clipboard?.writeText(label)}
                              >
                                Copy
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {caseTracks.length === 0 ? (
              <div style={{ fontSize: 12, color: isNarrow ? '#6b7280' : '#cbd5e1', lineHeight: 1.4 }}>
                No paths yet — start the import wizard to create one, or add a subject path from the map{' '}
                <strong>Tracks</strong> tab.
              </div>
            ) : (
              <div style={{ fontSize: 11, color: isNarrow ? '#6b7280' : '#94a3b8', lineHeight: 1.4 }}>
                Subject path names, colors, and visibility: <strong>Tracks</strong> tab. Import-only paths are not listed
                there — they stay here and in this wizard.
              </div>
            )}
          </div>
        </div>
      ) : null}
      {mapLeftToolSection === 'photos' ? (
        <div style={{ ...mapDockPanelShellForMapTools, padding: 8 }}>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            {casePhotosSidebarBlock ?? (
              <div style={{ fontSize: 12, color: isNarrow ? '#6b7280' : '#cbd5e1', lineHeight: 1.4 }}>
                No reference photos yet{canAddCaseContentHere ? '. Use Add Photo in this panel.' : '.'}
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

  /** Map stays in the main pane for both map and list on addresses (list is a panel, not a replacement). */
  const showMapInMapColumn = caseTab === 'tracking' || caseTab === 'addresses'

  const narrowMapTopShowsFloatingAddress = caseTab === 'tracking' || caseTab === 'addresses'

  const viewModeBtnGlass = (active: boolean, comfortableTouch?: boolean): CSSProperties => ({
    border: `1px solid ${active ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.2)'}`,
    borderRadius: 'var(--vc-radius-sm)',
    padding: comfortableTouch ? '10px 14px' : 'var(--vc-space-sm) var(--vc-space-md)',
    background: active ? 'rgba(226, 232, 240, 0.88)' : 'rgba(255,255,255,0.12)',
    color: active ? '#0f172a' : 'rgba(248,250,252,0.95)',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 'var(--vc-fs-sm)',
    whiteSpace: 'nowrap',
    ...(comfortableTouch ? { minHeight: 44, boxSizing: 'border-box' as const } : {}),
  })

  /** Mobile map bottom bar: text may wrap; flex shares width so labels stay inside the glass on narrow phones. */
  const viewModeBtnGlassNarrowMapBottom = (active: boolean): CSSProperties => ({
    border: `1px solid ${active ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.2)'}`,
    borderRadius: 'var(--vc-radius-sm)',
    padding: '8px 10px',
    minHeight: 40,
    boxSizing: 'border-box',
    background: active ? 'rgba(226, 232, 240, 0.88)' : 'rgba(255,255,255,0.12)',
    color: active ? '#0f172a' : 'rgba(248,250,252,0.95)',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 12,
    lineHeight: 1.25,
    whiteSpace: 'normal',
    textAlign: 'center',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  })

  useLayoutEffect(() => {
    if (!isNarrow || !showMapInMapColumn || probativePlacementSession || !narrowMapTopShowsFloatingAddress) return
    const el = narrowMobileMapTopChromeRowRef.current
    if (!el) return
    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      setNarrowMapTopRowHeightPx(Math.max(44, h))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [
    isNarrow,
    showMapInMapColumn,
    probativePlacementSession,
    narrowMapTopShowsFloatingAddress,
    mapLeftToolDockOpen,
    caseTracks.length,
    caseTab,
  ])

  useLayoutEffect(() => {
    if (!isNarrow || !showMapInMapColumn || probativePlacementSession || showAddressesListBottomSheet) {
      setNarrowMapBottomChromeHeightPx(0)
      return
    }
    const el = narrowMapBottomChromeRef.current
    if (!el) {
      setNarrowMapBottomChromeHeightPx(0)
      return
    }
    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      setNarrowMapBottomChromeHeightPx(Math.max(0, h))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isNarrow, showMapInMapColumn, probativePlacementSession, showAddressesListBottomSheet, caseTab, viewMode])

  useLayoutEffect(() => {
    if (isNarrow || !narrowMapTopShowsFloatingAddress) {
      setWideMapAddrSuggestTopPx(null)
      return
    }
    const row = wideMapTopChromeRowRef.current
    const search = wideMapSearchFieldRef.current
    if (!row || !search) {
      setWideMapAddrSuggestTopPx(null)
      return
    }
    const measure = () => {
      const sr = search.getBoundingClientRect()
      const rr = row.getBoundingClientRect()
      setWideMapAddrSuggestTopPx(Math.max(0, Math.ceil(sr.bottom - rr.top + 6)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    ro.observe(search)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [
    isNarrow,
    narrowMapTopShowsFloatingAddress,
    isCompactWebMapTop,
    caseTab,
    viewMode,
    addrSearchProminent,
    addr,
    loadingSug,
    mergedAddrSuggestCount,
  ])

  /** Wide without floating address search: mode toggles only in the blue glass slab. */
  const mapTopModeOnlyGlassPanel = (
    <div style={mapTopModeAndSearchGlassStyle}>
      <div style={{ alignSelf: 'center', flexShrink: 0 }}>
        <CaseWorkspaceModeTabs
          caseTab={caseTab}
          onSetCaseTab={setWorkspaceCaseTab}
          modeBtn={(a) => viewModeBtnGlass(a, false)}
          modeBtnNarrowBottom={viewModeBtnGlassNarrowMapBottom}
        />
      </div>
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
          flexWrap: isCompactWebMapTop ? 'wrap' : 'nowrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          pointerEvents: 'none',
          maxWidth: '100%',
          width: 'auto',
          minWidth: 0,
          boxSizing: 'border-box',
          overflow: 'visible',
        }}
      >
        {narrowMapTopShowsFloatingAddress && !isNarrow ? (
          <div
            ref={narrowMapAddressRef}
            data-vc-tour={VC_TOUR.caseFloatingSearch}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              minWidth: 0,
              maxWidth: '100%',
              width: '100%',
              pointerEvents: 'auto',
            }}
          >
            <div
              ref={wideMapTopChromeRowRef}
              style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: isCompactWebMapTop ? 'wrap' : 'nowrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                minWidth: 0,
                width: '100%',
                boxSizing: 'border-box',
                position: 'relative',
              }}
            >
              <div style={{ ...mapTopModeAndSearchGlassStyle, position: 'relative', zIndex: 3 }}>
                <div style={{ alignSelf: 'center', flexShrink: 0 }}>
                  <CaseWorkspaceModeTabs
                    caseTab={caseTab}
                    onSetCaseTab={setWorkspaceCaseTab}
                    modeBtn={(a) => viewModeBtnGlass(a, false)}
                    modeBtnNarrowBottom={viewModeBtnGlassNarrowMapBottom}
                  />
                </div>
                <div
                  ref={wideMapSearchFieldRef}
                  style={{
                    flex: '1 1 140px',
                    minWidth: 0,
                    maxWidth: '100%',
                    alignSelf: 'center',
                    opacity: addrSearchProminent ? 1 : 0.52,
                    transition: 'opacity 0.2s ease',
                    pointerEvents: 'auto',
                    position: 'relative',
                    zIndex: 4,
                  }}
                >
                  {renderAddAddressSearch(true, { glassChrome: true, mapFloatingPart: 'input' })}
                </div>
              </div>
            </div>
            {renderAddAddressSearch(true, { glassChrome: true, mapFloatingPart: 'dropdown' })}
          </div>
        ) : (
          mapTopModeOnlyGlassPanel
        )}
      </div>
    </div>
  )

  /**
   * Mobile map bottom mode bar: clear 44×44 basemap chip on the left only. Mirroring that reserve on both
   * sides made the shell too narrow on small phones so “Subject tracking” overflowed the glass.
   */
  const narrowMapBottomModesPadLeft = `calc(10px + 44px + clamp(8px, 2.5vw, 14px))`
  const narrowMapBottomModesPadRight = `calc(10px + clamp(8px, 2.5vw, 14px))`

  const mapNarrowBottomModesChrome =
    isNarrow && !probativePlacementSession && showMapInMapColumn && !showAddressesListBottomSheet ? (
      <div
        ref={narrowMapBottomChromeRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: MAP_FLOAT_BOTTOM_INSET,
          zIndex: 45,
          pointerEvents: 'none',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          paddingLeft: narrowMapBottomModesPadLeft,
          paddingRight: narrowMapBottomModesPadRight,
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
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              ...vcLiquidGlassPanel,
              borderRadius: 20,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'stretch',
              gap: 0,
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
            }}
          >
            <CaseWorkspaceModeTabs
              caseTab={caseTab}
              onSetCaseTab={setWorkspaceCaseTab}
              narrowMapBottom
              modeBtn={(a) => viewModeBtnGlass(a, true)}
              modeBtnNarrowBottom={viewModeBtnGlassNarrowMapBottom}
            />
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
  const webWideMapToolsLayerWidthDefault = `min(280px, calc(100% - max(${webWideMapToolsZoomMargin}, env(safe-area-inset-left, 0px)) - ${webWideMapToolsMapRightPad}))`
  const webWideMapToolsPillTop = `calc(${webWideMapToolsZoomMargin} + ${webWideMapToolsZoomStackH} + ${webWideMapToolsBelowZoomGap})`
  const webWideMapToolsPanelTop = `calc(${webWideMapToolsZoomMargin} + ${webWideMapToolsZoomStackH} + ${webWideMapToolsBelowZoomGap} + ${webWideMapDockPillFullPx}px + ${webWideMapToolsPillPanelGapPx}px)`

  /**
   * Keep a definite width here: pill + panel children are `position: absolute`, so they do not contribute to
   * intrinsic sizing. `width: max-content` on this layer collapsed to ~0 and the Filters panel never appeared.
   */
  const webWideMapToolsLayerShell: CSSProperties = {
    position: 'absolute',
    left: webWideMapToolsLeft,
    top: 0,
    bottom: 0,
    width: webWideMapToolsLayerWidthDefault,
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
  const webWideMapToolsPanelShell: CSSProperties = useMemo(
    () => ({
      position: 'absolute',
      top: webWideMapToolsPanelTop,
      left: 0,
      right: 0,
      bottom: webWideMapToolsRailEdgeGap,
      overflowX: mapLeftToolSection === 'filters' ? 'visible' : 'hidden',
      overflowY: mapLeftToolSection === 'filters' ? 'visible' : 'auto',
      WebkitOverflowScrolling: 'touch',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      minWidth: 0,
    }),
    [mapLeftToolSection],
  )

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
              {MAP_TOOLS_IMPORT_COORDINATES_ENABLED
                ? renderWebDockSectionButton('importCoords', 'Import Coordinates')
                : null}
              {renderWebDockSectionButton('photos', 'Photos')}
              {renderWebDockSectionButton('dvr', 'DVR Calculator')}
            </div>
          </div>
          {mapLeftToolSection != null ? (
            <div
              style={webWideMapToolsPanelShell}
              role="region"
              aria-label="Map Tool Panel"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  width: '100%',
                  minWidth: mapLeftToolSection === 'filters' ? 'min-content' : 0,
                  boxSizing: 'border-box',
                }}
              >
                {mapToolsDockSectionPanels}
              </div>
            </div>
          ) : null}
        </div>
      </>
    ) : null

  const controlPaneBlock = null
  const WorkspaceShell = WebCaseWorkspace
  const workspaceShellProps = { workspaceGridStyle } as const

  return (
    <>
      <Layout
      dense
      left={<CaseBackToListButton onBack={props.onBack} />}
      titleAlign="center"
      title={
        caseMetaEditing ? (
          <div
            data-vc-tour={VC_TOUR.caseHeaderMeta}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignItems: 'center',
              textAlign: 'center',
              minWidth: 0,
              width: '100%',
            }}
            onMouseDown={(e) => e.stopPropagation()}
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
            {isNarrow ? (
              <div style={{ display: 'flex', gap: 8, width: '100%', boxSizing: 'border-box' }}>
                <button type="button" onClick={saveCaseMetaEdit} style={{ ...vcGlassHeaderBtnPrimary, flex: 1, minWidth: 0 }}>
                  Save
                </button>
                <button type="button" onClick={discardCaseMetaEdit} style={{ ...vcGlassHeaderBtn, flex: 1, minWidth: 0 }}>
                  Discard
                </button>
              </div>
            ) : null}
          </div>
        ) : canEditCaseMetaHere ? (
          <button
            type="button"
            data-vc-tour={VC_TOUR.caseHeaderMeta}
            onClick={beginCaseMetaEdit}
            title="Edit Case Name and Description"
            style={{ ...caseHeaderReadonlyTitle, width: '100%' }}
          >
            {c.caseNumber}
          </button>
        ) : (
          <div
            data-vc-tour={VC_TOUR.caseHeaderMeta}
            style={{ ...caseHeaderReadonlyTitle, cursor: 'default', width: '100%' }}
          >
            {c.caseNumber}
          </div>
        )
      }
      subtitle={
        caseMetaEditing ? (
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
            onMouseDown={(e) => e.stopPropagation()}
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
        ) : canEditCaseMetaHere ? (
          <button
            type="button"
            onClick={beginCaseMetaEdit}
            title="Edit Case Name and Description"
            style={{ ...caseHeaderReadonlyDesc, width: '100%' }}
          >
            {(c.description ?? '').trim() ? c.description : 'Add description'}
          </button>
        ) : (
          <div style={{ ...caseHeaderReadonlyDesc, cursor: 'default', width: '100%' }}>
            {(c.description ?? '').trim() ? c.description : '—'}
          </div>
        )
      }
      right={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {caseMetaEditing && !isNarrow ? (
            <>
              <button type="button" onClick={saveCaseMetaEdit} style={vcGlassHeaderBtnPrimary}>
                Save
              </button>
              <button type="button" onClick={discardCaseMetaEdit} style={vcGlassHeaderBtn}>
                Discard
              </button>
            </>
          ) : null}
          {TOUR_UI_ENABLED ? (
            <button type="button" onClick={() => startTour('case')} style={vcGlassHeaderBtn} disabled={tourOpen}>
              Tour
            </button>
          ) : null}
          {c ? (
            <button
              type="button"
              onClick={() => setCaseExportOpen(true)}
              style={vcGlassHeaderBtn}
              title="Export Case — CSV and PDF options"
            >
              Export Case
            </button>
          ) : null}
        </div>
      }
    >
      <WorkspaceShell {...workspaceShellProps} isNarrow={isNarrow}>
        <div
          style={{
            gridArea: 'map',
            minHeight: 0,
            minWidth: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {controlPaneBlock}
          <div ref={mapPaneShellRef} style={mapColumnWrapperStyle}>
          <div style={mapPaneInnerShellStyle}>
            <div style={mapPaneMapStackAreaStyle}>
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
              {!probativePlacementSession && !isNarrow ? (
                <div
                  style={{
                    position: 'absolute',
                    top: WIDE_MAP_TOP_CHROME_INSET,
                    left: 0,
                    right: 0,
                    zIndex: 45,
                    paddingLeft:
                      narrowMapTopShowsFloatingAddress && showMapInMapColumn
                        ? `calc(${narrowMapTopReserveLeft} + ${webWideMapDockPillWidthPx}px + 10px)`
                        : '10px',
                    paddingRight: '10px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 8,
                    pointerEvents: 'none',
                  }}
                >
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
                          mapRef.current?.clearPendingMapTap()
                          return
                        }
                        e.preventDefault()
                        e.stopPropagation()
                        mapRef.current?.clearPendingMapTap()
                        closeMapToolsDock({ suppressMapFollowupMs: MAP_DOCK_OUTSIDE_DISMISS_CLICK_SUPPRESS_MS })
                      }}
                    />
                  ) : null}
                  {mapTopWideChromeRow}
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
                  {narrowMapTopShowsFloatingAddress ? (
                    <>
                      <div
                        ref={narrowMobileMapTopChromeRowRef}
                        data-vc-tour={VC_TOUR.caseControlPane}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          zIndex: 3,
                          paddingTop: narrowMapTopChromeInsetTopStr,
                          paddingLeft: narrowMapTopChromeInsetLeftStr,
                          paddingRight: narrowMapTopChromeInsetRightStr,
                          boxSizing: 'border-box',
                          pointerEvents: 'none',
                        }}
                      >
                        <div style={mapTopNarrowUnifiedToolbarGlassStyle}>
                          <button
                            type="button"
                            aria-label={
                              mapLeftToolDockOpen
                                ? 'Close Map Tools'
                                : 'Open Map Tools: Views, Filters, Tracks, and Photos'
                            }
                            onClick={() => {
                              mapToolsDockIgnoreOutsideUntilRef.current =
                                performance.now() + MAP_TOOLS_DOCK_OUTSIDE_GRACE_MS
                              if (mapLeftToolDockOpen) {
                                closeMapToolsDock()
                                return
                              }
                              if (caseTab === 'addresses' && locationDetailOpen) {
                                setLocationDetailOpen(false)
                              }
                              if (caseTab === 'tracking' && selectedTrackPointId) {
                                setSelectedTrackPointId(null)
                              }
                              setAddressMapModalOpen(false)
                              setTrackMapModalOpen(false)
                              setTrackMapTimeModalOpen(false)
                              setMapLeftToolDockOpen(true)
                            }}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              padding: 0,
                              margin: 0,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              WebkitTapHighlightColor: 'transparent',
                              pointerEvents: 'auto',
                            }}
                          >
                            <span style={mapDockMenuToggleFaceNarrowStyle} aria-hidden>
                              <VcCaseMapLayersGlyph size={MAP_LAYERS_GLYPH_PX} />
                            </span>
                          </button>
                          <div
                            ref={narrowMapAddressRef}
                            data-vc-tour={VC_TOUR.caseFloatingSearch}
                            style={{
                              flex: '1 1 0',
                              minWidth: 0,
                              pointerEvents: 'auto',
                              position: 'relative',
                              zIndex: 55,
                              opacity: addrSearchProminent ? 1 : 0.52,
                              transition: 'opacity 0.2s ease',
                            }}
                          >
                            {renderAddAddressSearch(true, {
                              glassChrome: true,
                              narrowCondensed: true,
                              mapFloatingPart: 'input',
                            })}
                            {renderAddAddressSearch(true, {
                              glassChrome: true,
                              narrowCondensed: true,
                              mapFloatingPart: 'dropdown',
                            })}
                          </div>
                        </div>
                      </div>
                      {mapLeftToolDockOpen ? (
                        <>
                          {/*
                            Dismiss scrim lives in the map column (same as wide web) so it sits above the
                            map canvas stack. A full-screen layer here sits under pointer-events:none on the
                            dock shell; on some mobile engines touches can still reach the map below.
                          */}
                          <div
                            style={{
                              position: 'absolute',
                              top: `calc(${NARROW_MAP_TOP_CHROME_INSET} + ${narrowMapTopRowHeightPx}px + 4px)`,
                              left: '10px',
                              zIndex: 1,
                              width:
                                mapLeftToolSection === 'filters'
                                  ? 'min(max-content, calc(100vw - 20px))'
                                  : undefined,
                              maxWidth: narrowMapDockPositionedShellMaxW,
                              pointerEvents: 'auto',
                            }}
                          >
                            <div style={narrowMapDockExpandedGlassShell}>
                              {renderDockSectionButton('views', 'Views')}
                              {renderDockSectionButton('filters', 'Filters')}
                              {renderDockSectionButton('tracks', 'Tracks')}
                              {MAP_TOOLS_IMPORT_COORDINATES_ENABLED
                                ? renderDockSectionButton('importCoords', 'Import Coordinates')
                                : null}
                              {renderDockSectionButton('photos', 'Photos')}
                              {renderDockSectionButton('dvr', 'DVR Calculator')}
                              {mapToolsDockSectionPanels}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </>
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
                  {mapLeftToolDockOpen && !probativePlacementSession ? (
                    <div
                      ref={mapDockDismissScrimColumnRef}
                      role="presentation"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 22,
                        background: 'rgba(17,24,39,0.16)',
                        touchAction: 'none',
                        pointerEvents: 'auto',
                      }}
                      onPointerDown={(e) => {
                        if (performance.now() < mapToolsDockIgnoreOutsideUntilRef.current) {
                          e.preventDefault()
                          e.stopPropagation()
                          mapRef.current?.clearPendingMapTap()
                          return
                        }
                        e.preventDefault()
                        e.stopPropagation()
                        mapRef.current?.clearPendingMapTap()
                        closeMapToolsDock({ suppressMapFollowupMs: MAP_DOCK_OUTSIDE_DISMISS_CLICK_SUPPRESS_MS })
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
                    caseTrackPointsForMap={caseTrackPointsForMap}
                    visibleTrackIds={visibleTrackIds}
                    trackingMapPoints={trackingMapPoints}
                    getRouteColor={getRouteColorMemo}
                    findByAddressText={findLocationByAddrMemo}
                    onSelectLocation={(id) => {
                      if (addrSearchBlocksMapInteraction || mapLeftToolDockOpen) return
                      onMapLocationPress(id)
                      tryResolveProvisionalAddressOnMapPick(id)
                    }}
                    onEnsureFootprint={enqueueOutlineForLocation}
                    addrSearchBlocksMapClicks={addrSearchMapShieldActive}
                    mapInteractionFreezeUntilRef={addrMapInteractionFreezeUntilRef}
                    mapLeftToolDockOpenRef={mapLeftToolDockOpenRef}
                    blockMapCanvasPointerEvents={mapLeftToolDockOpen && !probativePlacementSession}
                    onRequestCanvassAdd={(input) => {
                      openAddLocationModal({
                        lat: input.lat,
                        lon: input.lon,
                        addressText: input.addressText,
                        vectorTileBuildingRing: input.vectorTileBuildingRing,
                      })
                    }}
                    onCanvassAddAddressResolved={(result) => {
                      setCanvassMapResultQueue((q) => {
                        const i = q.findIndex((x) => x.mode === 'new' && samePendingPin(x, result))
                        if (i < 0) {
                          if (import.meta.env.DEV) {
                            console.warn(
                              '[VideoCanvass] onCanvassAddAddressResolved: no pending row matched lat/lon (check tap vs pin hit order)',
                              result,
                              'newRows',
                              q.filter((x) => x.mode === 'new').map((x) => ({ lat: x.lat, lon: x.lon })),
                            )
                          }
                          return q
                        }
                        const cur = q[i]!
                        if (cur.mode !== 'new') return q
                        const text = result.addressText.trim()
                        if (!isProvisionalCanvassLabel(text)) {
                          const dup = findLocationByAddressText(locationsRef.current, text)
                          if (dup) {
                            queueMicrotask(() => {
                              setSelectedId(dup.id)
                              setLocationDetailOpen(true)
                              setAddressMapModalOpen(false)
                            })
                            return q.filter((_, j) => j !== i)
                          }
                        }
                        const next = q.slice()
                        next[i] = { ...cur, addressText: result.addressText }
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
                    basemap={mapBasemap}
                  />
                    {mapLeftToolDockOpen && !probativePlacementSession ? (
                      <div
                        ref={mapDockDismissScrimInnerRef}
                        role="presentation"
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: 0,
                          zIndex: 80,
                          pointerEvents: 'auto',
                          touchAction: 'none',
                          background: 'transparent',
                        }}
                        onPointerDown={(e) => {
                          if (performance.now() < mapToolsDockIgnoreOutsideUntilRef.current) {
                            e.preventDefault()
                            e.stopPropagation()
                            mapRef.current?.clearPendingMapTap()
                            return
                          }
                          e.preventDefault()
                          e.stopPropagation()
                          mapRef.current?.clearPendingMapTap()
                          closeMapToolsDock({ suppressMapFollowupMs: MAP_DOCK_OUTSIDE_DISMISS_CLICK_SUPPRESS_MS })
                        }}
                      />
                    ) : null}
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
                  {!(isNarrow && showAddressesListBottomSheet) ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        cycleCaseBasemap()
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label={`Basemap: ${caseBasemapAriaLabel(mapBasemap)}. Click for next.`}
                      title={`Basemap: ${caseBasemapAriaLabel(mapBasemap)} — click to cycle (streets → satellite → dark)`}
                      style={{
                        position: 'absolute',
                        left: '10px',
                        bottom: MAP_FLOAT_BOTTOM_INSET_IN_STACK,
                        zIndex: 44,
                        ...mapLayersGlassChipFaceStyle,
                        cursor: 'pointer',
                      }}
                    >
                      <VcCaseMapBasemapSatelliteGlyph size={MAP_LAYERS_GLYPH_PX} />
                    </button>
                  ) : null}
                  {!isNarrow && viewMode === 'map' && caseTab === 'addresses' && mapChromeLocation && locationDetailOpen ? (
                    <div style={mapSelectionPillWrapStyleWebInMapLayer}>
                      <div ref={caseMapDetailOverlayRef} style={mapSelectionPillWrapStyleWebInMapLayerInteractive}>
                        <MapAddressSelectionPill
                          pillChrome="webDock"
                          addressText={mapChromeLocation.addressText}
                          status={mapChromeLocation.status}
                          canDelete={canDeleteLocation(data, actorId, mapChromeLocation)}
                          onOpenNotes={() => setAddressMapModalOpen(true)}
                          onRemove={() => {
                            void removeCaseLocation(mapChromeLocation.id)
                            popCanvassResultIfFrontExistingId(mapChromeLocation.id)
                            setSelectedId(null)
                            setLocationDetailOpen(false)
                            setAddressMapModalOpen(false)
                          }}
                          onDismissSelection={() => {
                            popCanvassResultIfFrontExistingId(mapChromeLocation.id)
                            setSelectedId(null)
                            setLocationDetailOpen(false)
                            setAddressMapModalOpen(false)
                            setProbativeFlow(null)
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                  <CaseMapTrackFloatingOverlays
                    variant="web"
                    data={data}
                    actorId={actorId}
                    isNarrow={isNarrow}
                    viewMode={viewMode}
                    caseTab={caseTab}
                    selectedTrackPoint={selectedTrackPoint}
                    selectedTrackPointStepIndex={selectedTrackPointStepIndex}
                    selectedTrackLabel={selectedTrackLabel}
                    resolvedTrackColors={resolvedTrackColors}
                    trackMapPillShowFull={trackMapPillShowFull}
                    caseMapDetailOverlayRef={caseMapDetailOverlayRef}
                    mapSelectionPillWrapStyle={mapSelectionPillWrapStyle}
                    mapSelectionPillWrapStyleWebInMapLayer={mapSelectionPillWrapStyleWebInMapLayer}
                    mapSelectionPillWrapStyleWebInMapLayerInteractive={mapSelectionPillWrapStyleWebInMapLayerInteractive}
                    setTrackMapPillShowFull={setTrackMapPillShowFull}
                    setTrackMapModalOpen={setTrackMapModalOpen}
                    setTrackMapTimeModalOpen={setTrackMapTimeModalOpen}
                    setSelectedTrackPointId={setSelectedTrackPointId}
                    setTrackStepUndoTargetId={setTrackStepUndoTargetId}
                    removeCaseTrackPoint={(id) => void removeCaseTrackPoint(id)}
                  />
                </div>
              ) : null}

              {showAddressesListBottomSheet ? (
                <>
                  <div
                    ref={addressesListDismissScrimRef}
                    role="presentation"
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      bottom: mapStackBottom,
                      zIndex: 34,
                      background: 'rgba(17,24,39,0.2)',
                      touchAction: 'none',
                      pointerEvents: 'auto',
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      closeAddressesListViewFromOverlay()
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      bottom: mapStackBottom,
                      zIndex: 35,
                      display: 'flex',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'flex-end',
                      paddingLeft: '10px',
                      paddingRight: '10px',
                      paddingBottom: '10px',
                      boxSizing: 'border-box',
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        pointerEvents: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        width: 'fit-content',
                        maxWidth: 'min(520px, calc(100% - 8px))',
                        minWidth: 'min(280px, 100%)',
                        maxHeight: 'min(48vh, 420px)',
                        minHeight: 120,
                        flexShrink: 1,
                        ...vcLiquidGlassPanel,
                        borderRadius: 16,
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <CaseAddressesListPanel
                        placement="mapColumn"
                        isNarrow={isNarrow}
                        data={data}
                        actorId={actorId}
                        filtered={filtered}
                        locationsForListView={locationsForListView}
                        counts={counts}
                        filters={filters}
                        setFilters={setFilters}
                        selectedId={selectedId}
                        setSelectedId={setSelectedId}
                        listRowExpandedId={listRowExpandedId}
                        setListRowExpandedId={setListRowExpandedId}
                        addressesListFiltersOpen={addressesListFiltersOpen}
                        setAddressesListFiltersOpen={setAddressesListFiltersOpen}
                        setLocationDetailOpen={setLocationDetailOpen}
                        setListAddressNotesForId={setListAddressNotesForId}
                        setProbativeFlow={setProbativeFlow}
                        popCanvassResultIfFrontExistingId={popCanvassResultIfFrontExistingId}
                        focusLocationOnMap={focusLocationOnMap}
                        removeCaseLocation={removeCaseLocation}
                        updateLocation={updateLocation}
                        closeAddressesListViewFromOverlay={closeAddressesListViewFromOverlay}
                        mapLeftToolDockOpen={mapLeftToolDockOpen}
                        mapRef={mapRef}
                        closeMapToolsDock={closeMapToolsDock}
                        mapDockOutsideDismissSuppressMs={MAP_DOCK_OUTSIDE_DISMISS_CLICK_SUPPRESS_MS}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              {isNarrow && viewMode === 'map' && caseTab === 'addresses' && mapChromeLocation && locationDetailOpen ? (
                <div ref={caseMapDetailOverlayRef} style={mapSelectionPillWrapStyle}>
                  <MapAddressSelectionPill
                    pillLayout="hug"
                    pillChrome="webDock"
                    addressText={mapChromeLocation.addressText}
                    status={mapChromeLocation.status}
                    canDelete={canDeleteLocation(data, actorId, mapChromeLocation)}
                    onOpenNotes={() => setAddressMapModalOpen(true)}
                    onRemove={() => {
                      void removeCaseLocation(mapChromeLocation.id)
                      popCanvassResultIfFrontExistingId(mapChromeLocation.id)
                      setSelectedId(null)
                      setLocationDetailOpen(false)
                      setAddressMapModalOpen(false)
                    }}
                    onDismissSelection={() => {
                      popCanvassResultIfFrontExistingId(mapChromeLocation.id)
                      setSelectedId(null)
                      setLocationDetailOpen(false)
                      setAddressMapModalOpen(false)
                      setProbativeFlow(null)
                    }}
                  />
                </div>
              ) : null}
              <CaseMapTrackFloatingOverlays
                variant="narrow"
                data={data}
                actorId={actorId}
                isNarrow={isNarrow}
                viewMode={viewMode}
                caseTab={caseTab}
                selectedTrackPoint={selectedTrackPoint}
                selectedTrackPointStepIndex={selectedTrackPointStepIndex}
                selectedTrackLabel={selectedTrackLabel}
                resolvedTrackColors={resolvedTrackColors}
                trackMapPillShowFull={trackMapPillShowFull}
                caseMapDetailOverlayRef={caseMapDetailOverlayRef}
                mapSelectionPillWrapStyle={mapSelectionPillWrapStyle}
                mapSelectionPillWrapStyleWebInMapLayer={mapSelectionPillWrapStyleWebInMapLayer}
                mapSelectionPillWrapStyleWebInMapLayerInteractive={mapSelectionPillWrapStyleWebInMapLayerInteractive}
                setTrackMapPillShowFull={setTrackMapPillShowFull}
                setTrackMapModalOpen={setTrackMapModalOpen}
                setTrackMapTimeModalOpen={setTrackMapTimeModalOpen}
                setSelectedTrackPointId={setSelectedTrackPointId}
                setTrackStepUndoTargetId={setTrackStepUndoTargetId}
                removeCaseTrackPoint={(id) => void removeCaseTrackPoint(id)}
              />
            </div>
          </div>
        </div>
        </div>
      </WorkspaceShell>
      </Layout>

      <CaseExportModal
        open={caseExportOpen}
        onClose={() => {
          if (!caseExportBusy) setCaseExportOpen(false)
        }}
        busy={caseExportBusy}
        pdfPathChoices={pdfPathExportChoices}
        addressStatusOptions={addressExportStatusOptions}
        onExport={runCaseExport}
      />

      {undoSnack ? (
        <UndoSnackbar
          message={undoSnack.kind === 'location' ? 'Address removed from case.' : 'Track step removed.'}
          onUndo={() => {
            const u = undoSnack
            clearUndoSnackTimer()
            setUndoSnack(null)
            if (u.kind === 'location') void restoreDeletedLocation(actorId, u.snapshot)
            else void restoreDeletedTrackPoint(actorId, u.point)
          }}
          onDismiss={() => {
            clearUndoSnackTimer()
            setUndoSnack(null)
          }}
        />
      ) : null}

    <CanvassMapResultModal
      open={canvassMapResultQueue.length > 0}
      addressLine={recordResultModalAddressLine}
      queuedExtraCount={Math.max(0, canvassMapResultQueue.length - 1)}
      addressResolving={(() => {
        const s = canvassMapResultQueue[0]
        return s?.mode === 'new' && isProvisionalCanvassLabel(s.addressText)
      })()}
      saving={addLocationSaving}
      onClose={closeAddLocationModal}
      onPickStatus={(s) => {
        const k = canvassMapResultQueueRef.current[0]?.key
        if (!k) return
        void pickCanvassMapResultStatus(s, k)
      }}
    />

    <Modal
      title={addressModalLocation ? formatAddressLineForMapList(addressModalLocation.addressText) : 'Address'}
      open={addressMapModalOpen && !!addressModalLocation}
      onClose={() => setAddressMapModalOpen(false)}
    >
      {addressModalLocation ? (
        <LocationDrawer
          key={addressModalLocation.id}
          layout="stack"
          embedInModal
          location={addressModalLocation}
          buildingOutlineLoading={footprintLoadingIds.has(addressModalLocation.id)}
          buildingOutlineFailed={footprintFailedIds.has(addressModalLocation.id)}
          canEdit={canEditLocation(data, actorId, addressModalLocation)}
          canDelete={canDeleteLocation(data, actorId, addressModalLocation)}
          onClose={() => setAddressMapModalOpen(false)}
          onUpdate={(patch) => {
            if (patch.status != null && patch.status !== 'probativeFootage') {
              setProbativeFlow(null)
            }
            const targetId = addressModalLocation.id
            void updateLocation(actorId, targetId, patch).then(() => {
              if (patch.status != null) {
                popCanvassResultIfFrontExistingId(targetId)
              }
            })
          }}
          onProbativeRequest={() => {
            setAddressMapModalOpen(false)
            setProbativeFlow({
              step: 'accuracy',
              target: { kind: 'existing', locationId: addressModalLocation.id },
            })
          }}
          onDelete={() => {
            void removeCaseLocation(addressModalLocation.id)
            popCanvassResultIfFrontExistingId(addressModalLocation.id)
            setSelectedId(null)
            setLocationDetailOpen(false)
            setAddressMapModalOpen(false)
          }}
        />
      ) : null}
    </Modal>

    <Modal
      ariaLabel={
        selectedTrackPoint
          ? `${selectedTrackLabel ? `${selectedTrackLabel} · ` : ''}Step ${selectedTrackPointStepIndex}`
          : 'Step'
      }
      title={
        selectedTrackPoint ? (
          <MapTrackQuickPickChip
            size="modal"
            trackColor={
              resolvedTrackColors.get(selectedTrackPoint.trackId) ?? TRACK_DEFAULT_COLORS_FIRST_FOUR[0]
            }
            trackLabel={selectedTrackLabel}
            stepIndex={selectedTrackPointStepIndex}
          />
        ) : (
          'Step'
        )
      }
      open={trackMapModalOpen && !!selectedTrackPoint}
      onClose={() => setTrackMapModalOpen(false)}
    >
      {selectedTrackPoint ? (
        <TrackPointDrawer
          key={selectedTrackPoint.id}
          layout="stack"
          embedInModal
          point={selectedTrackPoint}
          trackLabel={selectedTrackLabel}
          stepIndex={selectedTrackPointStepIndex}
          canEdit={canEditTrackPoint(data, actorId, selectedTrackPoint)}
          canDelete={canDeleteTrackPoint(data, actorId, selectedTrackPoint)}
          onClose={() => setTrackMapModalOpen(false)}
          onUpdate={(patch) => void updateTrackPoint(actorId, selectedTrackPoint.id, patch)}
          onDelete={() => {
            void removeCaseTrackPoint(selectedTrackPoint.id)
            setSelectedTrackPointId(null)
            setTrackStepUndoTargetId(null)
            setTrackMapModalOpen(false)
            setTrackMapTimeModalOpen(false)
          }}
        />
      ) : null}
    </Modal>

    <Modal
      title="Time on Map"
      open={trackMapTimeModalOpen && !!selectedTrackPoint}
      onClose={() => setTrackMapTimeModalOpen(false)}
    >
      {selectedTrackPoint ? (
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <DvrSingleDateTimePicker
            legend="Subject time at this point"
            legendHint="Optional"
            value={timestampToDatetimeLocalValue(selectedTrackPoint.visitedAt)}
            onChange={(s) => {
              const v = parseDatetimeLocalToTimestamp(s)
              void updateTrackPoint(
                actorId,
                selectedTrackPoint.id,
                v == null ? { visitedAt: null, displayTimeOnMap: false } : { visitedAt: v },
              )
            }}
            isNarrow={isNarrow}
            clearable
          />
          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              cursor: canEditTrackPoint(data, actorId, selectedTrackPoint) ? 'pointer' : 'default',
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={selectedTrackPoint.displayTimeOnMap === true}
              disabled={!canEditTrackPoint(data, actorId, selectedTrackPoint) || selectedTrackPoint.visitedAt == null}
              onChange={(e) =>
                void updateTrackPoint(actorId, selectedTrackPoint.id, { displayTimeOnMap: e.target.checked })
              }
            />
            <span>Show Time on Map next to Pin</span>
          </label>
        </div>
      ) : null}
    </Modal>

    <Modal
      title="Manage Tracks"
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
              title="Auto colors pick the next free blue / red / green / purple, then a unique generated color — none match another path until you choose a duplicate here."
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
              title="Delete Track and its Steps"
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
                    {renderTrackDockNameField('subjectMapAdd')(t, canEditT, { ...field, flex: 1, minWidth: 0 })}
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
                  {renderTrackDockNameField('subjectMapAdd')(t, canEditT, field)}
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
      title="Add Route Marker?"
      open={postProbativeMarkerPhase != null}
      onClose={() => setPostProbativeMarkerPhase(null)}
      zBase={63000}
    >
      {postProbativeMarkerPhase === 'ask' ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
            Add a step on a subject track for where the subject was last seen on this probative footage?
          </p>
          {caseTracksForMapDockTracksTab.length > 0 ? (
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Track</span>
              <select
                value={postProbativeEffectiveTrackId}
                onChange={(e) => setPostProbativePickTrackId(e.target.value)}
                style={select}
              >
                {caseTracksForMapDockTracksTab.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {caseTracksForMapDockTracksTab.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: '#4b5563', lineHeight: 1.45 }}>
              {caseTracks.length > 0 ? (
                <>
                  You only have import-coordinate paths; they are not used for subject placement. Yes creates a new subject
                  track first.
                </>
              ) : (
                <>With no subject track yet, Yes creates one named “Track {caseTracks.length + 1}” first.</>
              )}
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
                if (caseTracksForMapDockTracksTab.length === 0) {
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

    <Modal title="Import Coordinates" open={trackImportModalOpen} onClose={() => setTrackImportModalOpen(false)}>
      <TrackImportPanel
        caseTracks={caseTracks}
        trackForMapAdd={trackForMapAdd}
        canImport={canAddCaseContentHere}
        isNarrow={isNarrow}
        modalChrome
        onClose={() => setTrackImportModalOpen(false)}
        onCreateTrack={handleTrackImportCreateTrack}
        onImportPoints={handleTrackImportPoints}
      />
    </Modal>

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
      title="Link DVR Result to Address"
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
                {statusLabel('notProbativeFootage')}
              </button>
              <button
                type="button"
                style={btnPrimary}
                disabled={dvrLinkSaving}
                onClick={() => void submitDvrLinkLocation(true)}
              >
                {dvrLinkSaving ? 'Saving…' : statusLabel('probativeFootage')}
              </button>
            </div>
          </div>
        ) : null}
        {!canAddCaseContentHere ? (
          <div style={{ color: '#b45309', fontSize: 13, fontWeight: 700 }}>
            {hasCaseAccess(data, props.caseId, actorId)
              ? 'View-only access — ask the case owner for editor access to add locations.'
              : "You don't have access to add locations here."}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" style={btn} disabled={dvrLinkSaving} onClick={() => clearDvrLinkLocationUi()}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>

    <Modal
      title="Add Photo"
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
                      Remove Photo
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
                      Add Photo
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
