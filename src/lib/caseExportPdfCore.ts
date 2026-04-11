import autoTable from 'jspdf-autotable'
import { jsPDF } from 'jspdf'
import type { CaseFile, Location, Track, TrackPoint } from './types'
import { statusLabel } from './types'
import { formatAppDateTime } from './timeFormat'
import type { CaseExportSelections } from './caseExportOptions'
import { safeFileSlug } from './exportCsvUtils'

/** Mirrors `CaseExportPdfMapImages` in `caseExportPdf.ts` (kept local to avoid circular imports). */
type CaseExportPdfMapImages = {
  full: string | null
  addresses: string | null
  pathMaps: Array<{ title: string; dataUrl: string | null }>
}

function sortTrackPointsForPdf(points: TrackPoint[]): TrackPoint[] {
  return points.slice().sort((a, b) => {
    const ta = a.trackId.localeCompare(b.trackId)
    if (ta !== 0) return ta
    const ds = a.sequence - b.sequence
    if (ds !== 0) return ds
    return a.id.localeCompare(b.id)
  })
}

function drawMapSection(
  doc: jsPDF,
  opts: { addPageFirst: boolean; title: string; dataUrl: string | null; pageW: number; margin: number },
): void {
  if (opts.addPageFirst) doc.addPage()
  doc.setFontSize(12)
  doc.text(opts.title, opts.margin, opts.margin + 4)
  if (!opts.dataUrl) {
    doc.setFontSize(10)
    doc.text('Map snapshot unavailable (tiles may block export or map not ready).', opts.margin, opts.margin + 16)
    return
  }
  const maxW = opts.pageW - opts.margin * 2
  const maxH = 250
  let w = maxW
  let h = maxW * 0.62
  try {
    const ip = doc.getImageProperties(opts.dataUrl)
    const iw = ip.width || 1
    const ih = ip.height || 1
    const aspect = iw / ih
    h = maxW / aspect
    w = maxW
    if (h > maxH) {
      h = maxH
      w = maxH * aspect
    }
  } catch {
    if (h > maxH) {
      h = maxH
      w = maxH / 0.62
    }
  }
  const yImg = opts.margin + 12
  try {
    doc.addImage(opts.dataUrl, opts.margin, yImg, w, h, undefined, 'FAST')
  } catch {
    doc.setFontSize(10)
    doc.text('Map snapshot could not be embedded.', opts.margin, opts.margin + 16)
  }
}

/**
 * Build a case export PDF. Caller supplies PNG data URLs (or null) for map sections.
 * @param exportedAtMs wall time for footer
 */
export function buildCaseExportPdf(params: {
  caseFile: CaseFile
  locations: Location[]
  tracks: Track[]
  trackPoints: TrackPoint[]
  selections: CaseExportSelections
  mapImages: CaseExportPdfMapImages
  exportedAtMs: number
}): jsPDF {
  const { caseFile, locations, tracks, trackPoints, selections, mapImages, exportedAtMs } = params
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = margin

  type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } }
  const afterTableY = (): number => (doc as DocWithAutoTable).lastAutoTable?.finalY ?? y

  const trackLabelById = new Map(tracks.map((t) => [t.id, t.label]))
  const sortedPoints = sortTrackPointsForPdf(trackPoints)

  const addHeading = (text: string) => {
    if (y > 260) {
      doc.addPage()
      y = margin
    }
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text(text, margin, y)
    doc.setFont('helvetica', 'normal')
    y += 8
  }

  if (selections.pdfSummary) {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Case export', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 10
    doc.setFontSize(10)
    const lines = [
      `Case: ${caseFile.caseNumber} — ${caseFile.title}`,
      `Exported: ${formatAppDateTime(exportedAtMs)}`,
    ]
    if (caseFile.description?.trim()) {
      const desc = caseFile.description.trim()
      lines.push(`Description: ${desc.length > 500 ? `${desc.slice(0, 497)}…` : desc}`)
    }
    for (const line of lines) {
      const split = doc.splitTextToSize(line, pageW - margin * 2)
      doc.text(split, margin, y)
      y += split.length * 5 + 2
    }
    y += 4
  }

  if (selections.pdfAddressesTable && locations.length) {
    addHeading('Addresses')
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Address', 'Result', 'Notes']],
      body: locations.map((l) => [l.addressText, statusLabel(l.status), (l.notes ?? '').slice(0, 2000)]),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 41, 59] },
    })
    y = afterTableY() + 10
  } else if (selections.pdfAddressesTable) {
    addHeading('Addresses')
    doc.setFontSize(10)
    doc.text('No addresses on this case.', margin, y)
    y += 8
  }

  if (selections.pdfTracksTable && sortedPoints.length) {
    addHeading('Tracking')
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Track', 'Seq', 'Lat', 'Lon', 'Address', 'Visited', 'Notes']],
      body: sortedPoints.map((p) => [
        trackLabelById.get(p.trackId) ?? p.trackId,
        String(p.sequence),
        String(p.lat),
        String(p.lon),
        p.addressText,
        p.visitedAt != null ? formatAppDateTime(p.visitedAt) : '',
        (p.notes ?? '').slice(0, 1500),
      ]),
      styles: { fontSize: 7, cellPadding: 1.2 },
      headStyles: { fillColor: [30, 41, 59] },
    })
    y = afterTableY() + 10
  } else if (selections.pdfTracksTable) {
    addHeading('Tracking')
    doc.setFontSize(10)
    doc.text('No track points on this case.', margin, y)
    y += 8
  }

  const anyBlockBeforeMaps =
    selections.pdfSummary ||
    selections.pdfAddressesTable ||
    selections.pdfTracksTable
  const mapSections: { on: boolean; title: string; data: string | null }[] = [
    { on: selections.pdfMapFull, title: 'Map — Fit all', data: mapImages.full },
    { on: selections.pdfMapAddresses, title: 'Map — Fit canvass', data: mapImages.addresses },
    ...(selections.pdfMapTracks
      ? mapImages.pathMaps.map((pm) => ({ on: true as const, title: pm.title, data: pm.dataUrl }))
      : []),
  ]
  let firstMap = true
  for (const sec of mapSections) {
    if (!sec.on) continue
    const addPageFirst = firstMap ? anyBlockBeforeMaps : true
    firstMap = false
    drawMapSection(doc, { addPageFirst, title: sec.title, dataUrl: sec.data, pageW, margin })
  }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text(
      `VideoCanvass · ${caseFile.caseNumber} · page ${i}/${pageCount}`,
      margin,
      doc.internal.pageSize.getHeight() - 8,
    )
    doc.setTextColor(0, 0, 0)
  }

  return doc
}

export function downloadCaseExportPdf(doc: jsPDF, caseLabel: string): void {
  doc.save(`videocanvass-export-${safeFileSlug(caseLabel)}.pdf`)
}
