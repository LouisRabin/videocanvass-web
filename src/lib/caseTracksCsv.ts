import type { Track, TrackPoint } from './types'
import { csvEscape, safeFileSlug } from './exportCsvUtils'

export function sortTrackPointsForExportCsv(points: TrackPoint[]): TrackPoint[] {
  return points.slice().sort((a, b) => {
    const ta = a.trackId.localeCompare(b.trackId)
    if (ta !== 0) return ta
    const ds = a.sequence - b.sequence
    if (ds !== 0) return ds
    return a.id.localeCompare(b.id)
  })
}

const TRACK_EXPORT_HEADER = [
  'trackLabel',
  'trackId',
  'sequence',
  'lat',
  'lon',
  'addressText',
  'visitedAt',
  'notes',
  'placementSource',
  'showOnMap',
  'pointId',
] as const

/** Rows for CSV / Excel (header + one row per track point). */
export function buildCaseTracksExportRows(tracks: Track[], trackPoints: TrackPoint[]): string[][] {
  const trackLabelById = new Map(tracks.map((t) => [t.id, t.label]))
  const rows: string[][] = [TRACK_EXPORT_HEADER.slice() as string[]]
  for (const p of sortTrackPointsForExportCsv(trackPoints)) {
    rows.push([
      trackLabelById.get(p.trackId) ?? '',
      p.trackId,
      String(p.sequence),
      String(p.lat),
      String(p.lon),
      p.addressText ?? '',
      p.visitedAt != null ? String(p.visitedAt) : '',
      p.notes ?? '',
      p.placementSource ?? 'map',
      String(p.showOnMap),
      p.id,
    ])
  }
  return rows
}

/** CSV text (header + rows) for tests and downloads. */
export function buildCaseTracksCsvContent(tracks: Track[], trackPoints: TrackPoint[]): string {
  return buildCaseTracksExportRows(tracks, trackPoints)
    .map((row) => row.map(csvEscape).join(','))
    .join('\n')
}

/** Download track points for a case as CSV (no server; UTF-8). */
export function downloadCaseTracksCsv(caseLabel: string, tracks: Track[], trackPoints: TrackPoint[]): void {
  const blob = new Blob([buildCaseTracksCsvContent(tracks, trackPoints)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `camera-canvass-tracks-${safeFileSlug(caseLabel)}.csv`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}
