import type { FeatureCollection, Position } from 'geojson'
import type { Track, TrackPoint } from './types'

function sortTrackPointsStable(a: TrackPoint, b: TrackPoint): number {
  const ds = a.sequence - b.sequence
  if (ds !== 0) return ds
  const dt = (a.visitedAt ?? a.createdAt) - (b.visitedAt ?? b.createdAt)
  if (dt !== 0) return dt
  return a.id.localeCompare(b.id)
}

function segmentIsCoordinateSolid(a: TrackPoint, b: TrackPoint): boolean {
  const sa = a.placementSource ?? 'map'
  const sb = b.placementSource ?? 'map'
  return sa === 'import' || sb === 'import'
}

export function buildTracksData(
  tracks: Track[],
  trackPoints: TrackPoint[],
  visibleTrackIds: Record<string, boolean>,
  getRouteColor: (trackId: string) => string,
): { lines: FeatureCollection } {
  const lineFeatures: FeatureCollection['features'] = []

  const byTrack = new Map<string, TrackPoint[]>()
  for (const p of trackPoints) {
    const arr = byTrack.get(p.trackId) ?? []
    arr.push(p)
    byTrack.set(p.trackId, arr)
  }

  for (const t of tracks) {
    if (visibleTrackIds[t.id] === false) continue
    const pts = (byTrack.get(t.id) ?? [])
      .slice()
      .sort(sortTrackPointsStable)
      .filter((p) => p.showOnMap !== false)
    if (pts.length < 2) continue
    const color = getRouteColor(t.id)

    let segmentStart = 0
    for (let i = 1; i < pts.length; i++) {
      const edgeSolid = segmentIsCoordinateSolid(pts[i - 1]!, pts[i]!)
      const hasNext = i + 1 < pts.length
      const nextSolid = hasNext ? segmentIsCoordinateSolid(pts[i]!, pts[i + 1]!) : null
      if (hasNext && edgeSolid !== nextSolid) {
        const slice = pts.slice(segmentStart, i + 1)
        if (slice.length >= 2) {
          lineFeatures.push({
            type: 'Feature',
            properties: { color, lineKind: edgeSolid ? 'coordinate' : 'subject' },
            geometry: {
              type: 'LineString',
              coordinates: slice.map((p) => [p.lon, p.lat] as Position),
            },
          })
        }
        segmentStart = i
      }
    }
    const tail = pts.slice(segmentStart)
    if (tail.length >= 2) {
      const lastSolid = segmentIsCoordinateSolid(tail[tail.length - 2]!, tail[tail.length - 1]!)
      lineFeatures.push({
        type: 'Feature',
        properties: { color, lineKind: lastSolid ? 'coordinate' : 'subject' },
        geometry: {
          type: 'LineString',
          coordinates: tail.map((p) => [p.lon, p.lat] as Position),
        },
      })
    }
  }

  return {
    lines: { type: 'FeatureCollection', features: lineFeatures },
  }
}
