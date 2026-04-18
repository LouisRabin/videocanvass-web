import type { Location, Track, TrackPoint } from './types'
import { buildCaseLocationsExportRows } from './caseLocationsCsv'
import { buildCaseTracksExportRows } from './caseTracksCsv'
import { safeFileSlug } from './exportCsvUtils'

/**
 * One Excel workbook with two sheets — **Addresses** and **Tracking** — when both CSV options are chosen.
 * (Plain CSV cannot hold multiple sheets; this uses `.xlsx`.)
 * Loads the `xlsx` library on first use only.
 */
export async function downloadCaseAddressesTracksWorkbook(
  caseLabel: string,
  locations: Location[],
  tracks: Track[],
  trackPoints: TrackPoint[],
): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildCaseLocationsExportRows(locations)), 'Addresses')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildCaseTracksExportRows(tracks, trackPoints)), 'Tracking')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `camera-canvass-case-${safeFileSlug(caseLabel)}.xlsx`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}
