import type { CanvassStatus, Location } from './types'

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function statusLabel(s: CanvassStatus): string {
  switch (s) {
    case 'noCameras':
      return 'noCameras'
    case 'camerasNoAnswer':
      return 'camerasNoAnswer'
    case 'notProbativeFootage':
      return 'notProbativeFootage'
    case 'probativeFootage':
      return 'probativeFootage'
    default:
      return String(s)
  }
}

function safeFileSlug(label: string): string {
  return (
    label
      .trim()
      .replace(/[^\w\-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'case'
  )
}

/** Download canvass locations as CSV (no server; UTF-8). */
export function downloadCaseLocationsCsv(caseLabel: string, locations: Location[]): void {
  const header = ['addressText', 'status', 'lat', 'lon', 'notes', 'updatedAt', 'id'] as const
  const lines = [header.join(',')]
  for (const l of locations) {
    lines.push(
      [
        csvEscape(l.addressText ?? ''),
        csvEscape(statusLabel(l.status)),
        csvEscape(String(l.lat)),
        csvEscape(String(l.lon)),
        csvEscape(l.notes ?? ''),
        csvEscape(String(l.updatedAt ?? l.createdAt)),
        csvEscape(l.id),
      ].join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `videocanvass-addresses-${safeFileSlug(caseLabel)}.csv`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}
