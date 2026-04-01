import type { AppData, CaseFile } from './types'
import { hasCaseAccess } from './casePermissions'

export function casesAccessibleToUser(data: AppData, userId: string): CaseFile[] {
  return data.cases.filter((c) => hasCaseAccess(data, c.id, userId))
}

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

/** Latest edit time across case row and its child entities (ms). */
export function caseLastActivityMs(data: AppData, caseId: string): number {
  const c = data.cases.find((x) => x.id === caseId)
  let m = c ? Math.max(c.createdAt, c.updatedAt) : 0
  for (const l of data.locations) {
    if (l.caseId !== caseId) continue
    m = Math.max(m, l.createdAt, l.updatedAt ?? l.createdAt)
  }
  for (const a of data.caseAttachments) {
    if (a.caseId !== caseId) continue
    m = Math.max(m, a.createdAt, a.updatedAt)
  }
  for (const t of data.tracks) {
    if (t.caseId !== caseId) continue
    m = Math.max(m, t.createdAt, t.updatedAt ?? t.createdAt)
  }
  for (const p of data.trackPoints) {
    if (p.caseId !== caseId) continue
    m = Math.max(m, p.createdAt, p.updatedAt ?? p.createdAt)
  }
  return m
}
