import type { AppData } from './types'

export function caseQuickCounts(data: AppData, caseId: string): {
  locations: number
  attachments: number
  tracks: number
} {
  return {
    locations: data.locations.filter((l) => l.caseId === caseId).length,
    attachments: data.caseAttachments.filter((a) => a.caseId === caseId).length,
    tracks: data.tracks.filter((t) => t.caseId === caseId).length,
  }
}
