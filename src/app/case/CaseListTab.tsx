import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { AppData, CanvassStatus, Location } from '../../lib/types'
import type { PendingAddItem } from '../casePageHelpers'
import { statusColor, statusLabel } from '../../lib/types'
import { formatAppDateTime } from '../../lib/timeFormat'
import { canDeleteLocation, canEditLocation } from '../../lib/casePermissions'
import { formatAddressLineForMapList } from '../casePageHelpers'
import {
  LegendChip,
  UniformFilterChipGrid,
  RowStatusButton,
  btn,
  listHeaderRow,
  listRow,
  listRowMainBtn,
  statusBadge,
} from './CasePageChrome'
import {
  vcGlassFgDarkReadable,
  vcGlassFgMutedOnPanel,
  vcGlassFgOnPanel,
  vcLiquidGlassInnerSurface,
  vcLiquidGlassPanelDense,
} from '../../lib/vcLiquidGlass'

const listAddressFilterUniformGridChipRoot: CSSProperties = {
  width: '100%',
  maxWidth: 'none',
}

type CaseAddressesListFilters = Record<CanvassStatus, boolean>

type CaseAddressesListCounts = Record<CanvassStatus, number>

type CaseProbativeFlowState =
  | null
  | {
      step: 'accuracy' | 'calc'
      target:
        | { kind: 'existing'; locationId: string }
        | { kind: 'new'; pending: PendingAddItem }
        | { kind: 'dvr_only' }
    }

type CaseAddressesListPanelProps = {
  placement: 'mapColumn' | 'controlColumn'
  isNarrow: boolean
  data: AppData
  actorId: string
  filtered: Location[]
  locationsForListView: Location[]
  counts: CaseAddressesListCounts
  filters: CaseAddressesListFilters
  setFilters: Dispatch<SetStateAction<CaseAddressesListFilters>>
  selectedId: string | null
  setSelectedId: Dispatch<SetStateAction<string | null>>
  listRowExpandedId: string | null
  setListRowExpandedId: Dispatch<SetStateAction<string | null>>
  addressesListFiltersOpen: boolean
  setAddressesListFiltersOpen: Dispatch<SetStateAction<boolean>>
  setLocationDetailOpen: Dispatch<SetStateAction<boolean>>
  setListAddressNotesForId: Dispatch<SetStateAction<string | null>>
  setProbativeFlow: Dispatch<SetStateAction<CaseProbativeFlowState>>
  popCanvassResultIfFrontExistingId: (locationId: string) => void
  focusLocationOnMap: (loc: Location) => void
  removeCaseLocation: (id: string) => void
  updateLocation: (
    actorUserId: string,
    locationId: string,
    patch: Partial<Pick<Location, 'addressText' | 'lat' | 'lon' | 'status' | 'notes' | 'lastVisitedAt' | 'footprint'>>,
  ) => Promise<void>
  closeAddressesListViewFromOverlay: () => void
  mapLeftToolDockOpen: boolean
  mapRef: { current: { clearPendingMapTap: () => void } | null }
  closeMapToolsDock: (opts?: { suppressMapFollowupMs?: number }) => void
  mapDockOutsideDismissSuppressMs: number
}

/**
 * Scrollable locations list for the case workspace (bottom sheet on narrow map, or control column on wide web).
 * Wired by {@link CasePage}; keeps canvass status filters and row expand actions in one place.
 */
export function CaseAddressesListPanel(props: CaseAddressesListPanelProps) {
  const {
    placement,
    isNarrow,
    data,
    actorId,
    filtered,
    locationsForListView,
    counts,
    filters,
    setFilters,
    selectedId,
    setSelectedId,
    listRowExpandedId,
    setListRowExpandedId,
    addressesListFiltersOpen,
    setAddressesListFiltersOpen,
    setLocationDetailOpen,
    setListAddressNotesForId,
    setProbativeFlow,
    popCanvassResultIfFrontExistingId,
    focusLocationOnMap,
    removeCaseLocation,
    updateLocation,
    closeAddressesListViewFromOverlay,
    mapLeftToolDockOpen,
    mapRef,
    closeMapToolsDock,
    mapDockOutsideDismissSuppressMs,
  } = props

  const sheetGlass = placement === 'mapColumn'
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
          borderTop: '1px solid rgba(148, 163, 184, 0.45)',
          marginTop: 0,
          paddingTop: 8,
          ...vcLiquidGlassInnerSurface,
          borderRadius: 0,
          borderLeft: 'none',
          borderRight: 'none',
          borderBottom: 'none',
          boxShadow: 'none',
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

  const listCloseIconBtn: CSSProperties = {
    ...vcLiquidGlassPanelDense,
    width: 36,
    minWidth: 36,
    height: 36,
    padding: 0,
    margin: 0,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: vcGlassFgOnPanel,
    cursor: 'pointer',
    flexShrink: 0,
    WebkitTapHighlightColor: 'transparent',
  }

  const listFiltersToggleBtn: CSSProperties = sheetGlass
    ? {
        ...vcLiquidGlassPanelDense,
        height: 36,
        minHeight: 36,
        padding: '0 12px',
        borderRadius: 10,
        border: 'none',
        fontSize: 12,
        fontWeight: 800,
        cursor: 'pointer',
        flexShrink: 0,
        WebkitTapHighlightColor: 'transparent',
        background: addressesListFiltersOpen ? 'rgba(226, 232, 240, 0.9)' : 'rgba(255,255,255,0.14)',
        color: addressesListFiltersOpen ? vcGlassFgDarkReadable : vcGlassFgOnPanel,
      }
    : {
        ...btn,
        fontSize: 12,
        fontWeight: 800,
        padding: '6px 12px',
        flexShrink: 0,
      }

  return (
    <div style={outerStyle}>
      <div
        style={{
          ...listHeaderRow,
          flexShrink: 0,
          borderBottom: sheetGlass ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(148, 163, 184, 0.4)',
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
            width: '100%',
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontWeight: 900,
              fontSize: 13,
              color: sheetGlass ? vcGlassFgOnPanel : vcGlassFgDarkReadable,
              minWidth: 0,
              flex: placement === 'mapColumn' ? '1 1 auto' : undefined,
            }}
          >
            Locations ({filtered.length})
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              marginLeft: placement === 'controlColumn' ? 'auto' : undefined,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              aria-expanded={addressesListFiltersOpen}
              aria-controls="vc-addresses-list-status-filters"
              style={listFiltersToggleBtn}
              onClick={() => setAddressesListFiltersOpen((v) => !v)}
            >
              Filters
            </button>
            {placement === 'mapColumn' ? (
              <button
                type="button"
                aria-label="Close list view"
                title="Close"
                style={listCloseIconBtn}
                onClick={() => closeAddressesListViewFromOverlay()}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
        {addressesListFiltersOpen ? (
          <UniformFilterChipGrid
            id="vc-addresses-list-status-filters"
            columnCount={2}
            measureKey={`${counts.noCameras}-${counts.camerasNoAnswer}-${counts.notProbativeFootage}-${counts.probativeFootage}`}
            role="group"
            aria-label="Filter locations by result"
          >
            <LegendChip
              dense
              dockCompact
              rootStyle={listAddressFilterUniformGridChipRoot}
              label={statusLabel('noCameras')}
              count={counts.noCameras}
              color={statusColor('noCameras')}
              on={filters.noCameras}
              onToggle={() => setFilters((f) => ({ ...f, noCameras: !f.noCameras }))}
            />
            <LegendChip
              dense
              dockCompact
              rootStyle={listAddressFilterUniformGridChipRoot}
              label={statusLabel('camerasNoAnswer')}
              count={counts.camerasNoAnswer}
              color={statusColor('camerasNoAnswer')}
              on={filters.camerasNoAnswer}
              onToggle={() => setFilters((f) => ({ ...f, camerasNoAnswer: !f.camerasNoAnswer }))}
            />
            <LegendChip
              dense
              dockCompact
              rootStyle={listAddressFilterUniformGridChipRoot}
              label={statusLabel('notProbativeFootage')}
              count={counts.notProbativeFootage}
              color={statusColor('notProbativeFootage')}
              on={filters.notProbativeFootage}
              onToggle={() => setFilters((f) => ({ ...f, notProbativeFootage: !f.notProbativeFootage }))}
            />
            <LegendChip
              dense
              dockCompact
              rootStyle={listAddressFilterUniformGridChipRoot}
              label={statusLabel('probativeFootage')}
              count={counts.probativeFootage}
              color={statusColor('probativeFootage')}
              on={filters.probativeFootage}
              onToggle={() => setFilters((f) => ({ ...f, probativeFootage: !f.probativeFootage }))}
            />
          </UniformFilterChipGrid>
        ) : null}
      </div>
      {filtered.length > 0 ? (
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
                  borderBottom: sheetGlass ? '1px solid rgba(255,255,255,0.1)' : listRow.borderBottom,
                  background: sheetGlass
                    ? isListSelected
                      ? 'rgba(226, 232, 240, 0.28)'
                      : dimListRow
                        ? 'rgba(15, 23, 42, 0.28)'
                        : 'rgba(255,255,255, 0.1)'
                    : isListSelected
                      ? 'rgba(241, 245, 249, 0.95)'
                      : dimListRow
                        ? 'rgba(203, 213, 225, 0.55)'
                        : 'rgba(226, 232, 240, 0.42)',
                  opacity: dimListRow ? 0.72 : 1,
                  boxShadow: isListSelected
                    ? sheetGlass
                      ? 'inset 3px 0 0 rgba(248, 250, 252, 0.85)'
                      : 'inset 3px 0 0 #111827'
                    : undefined,
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
                      popCanvassResultIfFrontExistingId(l.id)
                    } else {
                      setListRowExpandedId(l.id)
                      setSelectedId(l.id)
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setLocationDetailOpen(false)
                    setListRowExpandedId(l.id)
                    setSelectedId(l.id)
                    setListAddressNotesForId(l.id)
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
                      color: sheetGlass ? vcGlassFgOnPanel : undefined,
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
                    <span
                      style={{
                        color: sheetGlass ? vcGlassFgMutedOnPanel : '#6b7280',
                        fontSize: 10,
                        fontWeight: 600,
                        lineHeight: 1.2,
                      }}
                    >
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
                    if (!window.confirm('Delete this address? You can undo for a few seconds.')) return
                    void removeCaseLocation(l.id)
                    popCanvassResultIfFrontExistingId(l.id)
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
                        label={statusLabel('noCameras')}
                        color={statusColor('noCameras')}
                        active={l.status === 'noCameras'}
                        disabled={!canEditL}
                        stretch
                        onClick={() => {
                          setProbativeFlow(null)
                          void updateLocation(actorId, l.id, { status: 'noCameras' }).then(() => {
                            popCanvassResultIfFrontExistingId(l.id)
                          })
                        }}
                      />
                      <RowStatusButton
                        label={statusLabel('camerasNoAnswer')}
                        color={statusColor('camerasNoAnswer')}
                        active={l.status === 'camerasNoAnswer'}
                        disabled={!canEditL}
                        stretch
                        onClick={() => {
                          setProbativeFlow(null)
                          void updateLocation(actorId, l.id, { status: 'camerasNoAnswer' }).then(() => {
                            popCanvassResultIfFrontExistingId(l.id)
                          })
                        }}
                      />
                      <RowStatusButton
                        label={statusLabel('notProbativeFootage')}
                        color={statusColor('notProbativeFootage')}
                        active={l.status === 'notProbativeFootage'}
                        disabled={!canEditL}
                        stretch
                        onClick={() => {
                          setProbativeFlow(null)
                          void updateLocation(actorId, l.id, { status: 'notProbativeFootage' }).then(() => {
                            popCanvassResultIfFrontExistingId(l.id)
                          })
                        }}
                      />
                      <RowStatusButton
                        label={statusLabel('probativeFootage')}
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
                          void updateLocation(actorId, l.id, { status: 'probativeFootage' }).then(() => {
                            popCanvassResultIfFrontExistingId(l.id)
                          })
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
        <div
          style={{
            padding: 12,
            color: sheetGlass ? vcGlassFgMutedOnPanel : '#374151',
            flex: placement === 'mapColumn' ? 1 : undefined,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
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
            mapRef.current?.clearPendingMapTap()
            closeMapToolsDock({ suppressMapFollowupMs: mapDockOutsideDismissSuppressMs })
          }}
        />
      ) : null}
    </div>
  )
}
