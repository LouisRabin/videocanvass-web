import type { TrackPoint } from './types'

/** Subject-tracking steps (map taps / location-linked adds). */
export function isMapPlacedTrackPoint(p: Pick<TrackPoint, 'placementSource'>): boolean {
  return (p.placementSource ?? 'map') === 'map'
}

/** Spreadsheet / paste coordinate imports. */
export function isImportedCoordinatePoint(p: Pick<TrackPoint, 'placementSource'>): boolean {
  return (p.placementSource ?? 'map') === 'import'
}

/**
 * Tracks map tab lists paths used for subject tracking: empty (new) or with at least one map-placed step.
 * Import-only paths belong in Import coordinates only.
 */
export function trackBelongsInTracksMapTab(
  track: { id: string },
  trackPoints: Pick<TrackPoint, 'trackId' | 'placementSource'>[],
): boolean {
  const pts = trackPoints.filter((p) => p.trackId === track.id)
  if (pts.length === 0) return true
  return pts.some((p) => isMapPlacedTrackPoint(p))
}
