import type { CSSProperties, RefObject } from 'react'
import type { AppData, TrackPoint } from '../../lib/types'
import { TRACK_DEFAULT_COLORS_FIRST_FOUR } from '../../lib/trackColors'
import { canDeleteTrackPoint } from '../../lib/casePermissions'
import { isMapPlacedTrackPoint } from '../../lib/trackPointPlacement'
import { MapTrackSelectionPill } from './MapSelectionGlassPills'

type TrackColorMap = Map<string, string>

/**
 * Floating map selection chrome for the subject-tracking workspace (wide web + narrow).
 * Parent supplies computed layout styles because they depend on map insets and bottom chrome height.
 */
export function CaseMapTrackFloatingOverlays(props: {
  /** Wide map layer vs narrow bottom pill stack (inserted in different places in {@link CasePage}). */
  variant: 'web' | 'narrow'
  data: AppData
  actorId: string
  isNarrow: boolean
  viewMode: 'map' | 'list'
  caseTab: 'addresses' | 'tracking'
  selectedTrackPoint: TrackPoint | null
  selectedTrackPointStepIndex: number
  selectedTrackLabel: string
  resolvedTrackColors: TrackColorMap
  trackMapPillShowFull: boolean
  caseMapDetailOverlayRef: RefObject<HTMLDivElement | null>
  mapSelectionPillWrapStyle: CSSProperties
  mapSelectionPillWrapStyleWebInMapLayer: CSSProperties
  mapSelectionPillWrapStyleWebInMapLayerInteractive: CSSProperties
  setTrackMapPillShowFull: (v: boolean) => void
  setTrackMapModalOpen: (v: boolean) => void
  setTrackMapTimeModalOpen: (v: boolean) => void
  setSelectedTrackPointId: (v: string | null) => void
  setTrackStepUndoTargetId: (v: string | null) => void
  removeCaseTrackPoint: (id: string) => void
}) {
  const {
    variant,
    data,
    actorId,
    isNarrow,
    viewMode,
    caseTab,
    selectedTrackPoint,
    selectedTrackPointStepIndex,
    selectedTrackLabel,
    resolvedTrackColors,
    trackMapPillShowFull,
    caseMapDetailOverlayRef,
    mapSelectionPillWrapStyle,
    mapSelectionPillWrapStyleWebInMapLayer,
    mapSelectionPillWrapStyleWebInMapLayerInteractive,
    setTrackMapPillShowFull,
    setTrackMapModalOpen,
    setTrackMapTimeModalOpen,
    setSelectedTrackPointId,
    setTrackStepUndoTargetId,
    removeCaseTrackPoint,
  } = props

  const webShow =
    variant === 'web' &&
    !isNarrow &&
    viewMode === 'map' &&
    caseTab === 'tracking' &&
    !!selectedTrackPoint &&
    isMapPlacedTrackPoint(selectedTrackPoint)

  const narrowShow =
    variant === 'narrow' &&
    isNarrow &&
    viewMode === 'map' &&
    caseTab === 'tracking' &&
    !!selectedTrackPoint &&
    isMapPlacedTrackPoint(selectedTrackPoint)

  return (
    <>
      {webShow ? (
        <div style={mapSelectionPillWrapStyleWebInMapLayer}>
          <div ref={caseMapDetailOverlayRef} style={mapSelectionPillWrapStyleWebInMapLayerInteractive}>
            <MapTrackSelectionPill
              pillChrome="webDock"
              trackLabel={selectedTrackLabel}
              stepIndex={selectedTrackPointStepIndex}
              trackColor={
                resolvedTrackColors.get(selectedTrackPoint.trackId) ?? TRACK_DEFAULT_COLORS_FIRST_FOUR[0]
              }
              canDelete={canDeleteTrackPoint(data, actorId, selectedTrackPoint)}
              condensed={false}
              onOpenDetail={() => {
                setTrackMapModalOpen(true)
              }}
              onRemove={() => {
                void removeCaseTrackPoint(selectedTrackPoint.id)
                setSelectedTrackPointId(null)
                setTrackStepUndoTargetId(null)
                setTrackMapPillShowFull(false)
                setTrackMapModalOpen(false)
                setTrackMapTimeModalOpen(false)
              }}
              onDismissSelection={() => {
                setSelectedTrackPointId(null)
                setTrackMapPillShowFull(false)
                setTrackMapModalOpen(false)
                setTrackMapTimeModalOpen(false)
              }}
            />
          </div>
        </div>
      ) : null}
      {narrowShow ? (
        <div ref={caseMapDetailOverlayRef} style={mapSelectionPillWrapStyle}>
          <MapTrackSelectionPill
            pillLayout="hug"
            pillChrome="webDock"
            trackLabel={selectedTrackLabel}
            stepIndex={selectedTrackPointStepIndex}
            trackColor={
              resolvedTrackColors.get(selectedTrackPoint.trackId) ?? TRACK_DEFAULT_COLORS_FIRST_FOUR[0]
            }
            canDelete={canDeleteTrackPoint(data, actorId, selectedTrackPoint)}
            condensed={!trackMapPillShowFull}
            onOpenDetail={() => {
              setTrackMapPillShowFull(true)
              setTrackMapModalOpen(true)
            }}
            onRemove={() => {
              void removeCaseTrackPoint(selectedTrackPoint.id)
              setSelectedTrackPointId(null)
              setTrackStepUndoTargetId(null)
              setTrackMapPillShowFull(false)
              setTrackMapModalOpen(false)
              setTrackMapTimeModalOpen(false)
            }}
            onDismissSelection={() => {
              setSelectedTrackPointId(null)
              setTrackMapPillShowFull(false)
              setTrackMapModalOpen(false)
              setTrackMapTimeModalOpen(false)
            }}
          />
        </div>
      ) : null}
    </>
  )
}
