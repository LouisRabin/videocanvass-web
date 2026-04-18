import type { Location } from './types'
import { statusLabel } from './types'
import { csvEscape, safeFileSlug } from './exportCsvUtils'

const ADDRESS_EXPORT_HEADER = ['addressText', 'status', 'lat', 'lon', 'notes', 'updatedAt', 'id'] as const

/** Rows for CSV / Excel (header + one row per location). */
export function buildCaseLocationsExportRows(locations: Location[]): string[][] {
  const rows: string[][] = [ADDRESS_EXPORT_HEADER.slice() as string[]]
  for (const l of locations) {
    rows.push([
      l.addressText ?? '',
      statusLabel(l.status),
      String(l.lat),
      String(l.lon),
      l.notes ?? '',
      String(l.updatedAt ?? l.createdAt),
      l.id,
    ])
  }
  return rows
}

/** Download canvass locations as CSV (no server; UTF-8). */
export function downloadCaseLocationsCsv(caseLabel: string, locations: Location[]): void {
  const lines = buildCaseLocationsExportRows(locations).map((row) => row.map(csvEscape).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `camera-canvass-addresses-${safeFileSlug(caseLabel)}.csv`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}
