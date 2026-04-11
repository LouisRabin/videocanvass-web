import type { jsPDF } from 'jspdf'
import type { CaseFile, Location, Track, TrackPoint } from './types'
import type { CaseExportSelections } from './caseExportOptions'

export type CaseExportPdfMapImages = {
  full: string | null
  addresses: string | null
  /** One PDF map page per entry when “Fit paths” is selected (title + snapshot). */
  pathMaps: Array<{ title: string; dataUrl: string | null }>
}

export async function buildCaseExportPdf(params: {
  caseFile: CaseFile
  locations: Location[]
  tracks: Track[]
  trackPoints: TrackPoint[]
  selections: CaseExportSelections
  mapImages: CaseExportPdfMapImages
  exportedAtMs: number
}): Promise<jsPDF> {
  const { buildCaseExportPdf: build } = await import('./caseExportPdfCore')
  return build(params)
}

export async function downloadCaseExportPdf(doc: jsPDF, caseLabel: string): Promise<void> {
  const { downloadCaseExportPdf: download } = await import('./caseExportPdfCore')
  download(doc, caseLabel)
}
