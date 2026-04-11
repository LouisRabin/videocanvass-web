import type { CanvassStatus } from './types'

/** Display / export order for PDF canvass result filters (addresses table + Fit canvass map only). */
export const EXPORT_ADDRESS_STATUS_ORDER: readonly CanvassStatus[] = [
  'probativeFootage',
  'camerasNoAnswer',
  'notProbativeFootage',
  'noCameras',
] as const

/** User selections in the case export modal. */
export type CaseExportSelections = {
  csvAddresses: boolean
  csvTracks: boolean
  pdf: boolean
  pdfSummary: boolean
  pdfAddressesTable: boolean
  pdfTracksTable: boolean
  pdfMapFull: boolean
  pdfMapAddresses: boolean
  pdfMapTracks: boolean
  /**
   * When `pdfMapTracks` is on: track ids to include as separate map pages (order = export order).
   * Ignored when there are no paths with map points; use `validateCaseExportSelections(..., { pdfPathChoiceCount })`.
   */
  pdfMapPathTrackIds: string[]
  /**
   * Canvass statuses for the PDF addresses table and PDF map — Fit canvass only (CSV is always all rows).
   * Default: all statuses selected.
   */
  exportAddressStatuses: CanvassStatus[]
}

const DEFAULT_EXPORT_SELECTIONS: CaseExportSelections = {
  csvAddresses: false,
  csvTracks: false,
  pdf: false,
  pdfSummary: true,
  pdfAddressesTable: true,
  pdfTracksTable: true,
  pdfMapFull: true,
  pdfMapAddresses: false,
  pdfMapTracks: false,
  pdfMapPathTrackIds: [],
  exportAddressStatuses: [...EXPORT_ADDRESS_STATUS_ORDER],
}

export function selectAllExportSelections(): CaseExportSelections {
  return {
    csvAddresses: true,
    csvTracks: true,
    pdf: true,
    pdfSummary: true,
    pdfAddressesTable: true,
    pdfTracksTable: true,
    pdfMapFull: true,
    pdfMapAddresses: true,
    pdfMapTracks: true,
    pdfMapPathTrackIds: [],
    exportAddressStatuses: [...EXPORT_ADDRESS_STATUS_ORDER],
  }
}

export function clearExportSelections(): CaseExportSelections {
  return { ...DEFAULT_EXPORT_SELECTIONS, pdfSummary: false, pdfAddressesTable: false, pdfTracksTable: false, pdfMapFull: false }
}

type ValidateCaseExportOpts = {
  /** When > 0 and Fit paths is on, at least one path id must be selected. */
  pdfPathChoiceCount?: number
}

/** Returns a user-facing error or null if OK. */
export function validateCaseExportSelections(
  s: CaseExportSelections,
  opts?: ValidateCaseExportOpts,
): string | null {
  const anyCsv = s.csvAddresses || s.csvTracks
  const anyPdfContent =
    s.pdf &&
    (s.pdfSummary ||
      s.pdfAddressesTable ||
      s.pdfTracksTable ||
      s.pdfMapFull ||
      s.pdfMapAddresses ||
      s.pdfMapTracks)
  if (!anyCsv && !s.pdf) return 'Choose at least one export format (CSV and/or PDF).'
  if (s.pdf && !anyPdfContent) return 'PDF is selected: choose at least one PDF section (summary, tables, or maps).'
  const pathCount = opts?.pdfPathChoiceCount ?? 0
  if (s.pdf && s.pdfMapTracks && pathCount > 0 && s.pdfMapPathTrackIds.length === 0) {
    return 'PDF: choose at least one path for the map (Fit paths).'
  }
  const anyPdfAddressSection = s.pdf && (s.pdfAddressesTable || s.pdfMapAddresses)
  if (anyPdfAddressSection && s.exportAddressStatuses.length === 0) {
    return 'PDF: choose at least one canvass result for the addresses table and/or Fit canvass map.'
  }
  return null
}
