import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { LatLonPoint } from '../../../lib/trackLatLonImport'
import type { UnifiedCaseMapHandle } from '../../AddressesMapLibre'

type CreateTrackFn = (input: {
  caseId: string
  createdByUserId: string
  label: string
  kind: 'person' | 'vehicle' | 'other'
}) => Promise<string>

type CreateTrackPointsBulkFn = (input: {
  caseId: string
  createdByUserId: string
  trackId: string
  points: { lat: number; lon: number; visitedAt?: number | null }[]
}) => Promise<unknown>

export function useCaseTrackImport(params: {
  caseId: string
  actorId: string
  canAddCaseContent: boolean
  caseTracksLength: number
  createTrack: CreateTrackFn
  createTrackPointsBulk: CreateTrackPointsBulkFn
  mapRef: MutableRefObject<UnifiedCaseMapHandle | null>
  setAutoContinuationTrackId: (id: string | null) => void
  setVisibleTrackIds: Dispatch<SetStateAction<Record<string, boolean>>>
  setWorkspaceCaseTab: (tab: 'addresses' | 'tracking') => void
}) {
  const [trackImportModalOpen, setTrackImportModalOpen] = useState(false)

  const handleTrackImportCreateTrack = useCallback(
    async (label: string) => {
      if (!params.canAddCaseContent) return null
      try {
        const id = await params.createTrack({
          caseId: params.caseId,
          createdByUserId: params.actorId,
          label: label.trim() || `Track ${params.caseTracksLength + 1}`,
          kind: 'person',
        })
        params.setAutoContinuationTrackId(id)
        params.setVisibleTrackIds((prev) => ({ ...prev, [id]: true }))
        return id
      } catch {
        return null
      }
    },
    [
      params.actorId,
      params.canAddCaseContent,
      params.caseId,
      params.caseTracksLength,
      params.createTrack,
      params.setAutoContinuationTrackId,
      params.setVisibleTrackIds,
    ],
  )

  const handleTrackImportPoints = useCallback(
    async (trackId: string, points: LatLonPoint[]) => {
      if (!params.canAddCaseContent || !points.length) return
      await params.createTrackPointsBulk({
        caseId: params.caseId,
        createdByUserId: params.actorId,
        trackId,
        points: points.map((p) => {
          const row: { lat: number; lon: number; visitedAt?: number | null } = { lat: p.lat, lon: p.lon }
          if (p.visitedAt != null && Number.isFinite(p.visitedAt)) row.visitedAt = p.visitedAt
          return row
        }),
      })
      params.setWorkspaceCaseTab('tracking')
      params.mapRef.current?.fitToCoordinates(points)
    },
    [
      params.actorId,
      params.canAddCaseContent,
      params.caseId,
      params.createTrackPointsBulk,
      params.mapRef,
      params.setWorkspaceCaseTab,
    ],
  )

  return {
    trackImportModalOpen,
    setTrackImportModalOpen,
    handleTrackImportCreateTrack,
    handleTrackImportPoints,
  }
}
