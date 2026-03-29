/** DVR displayed time minus real time (ms). Negative ⇒ DVR shows an earlier clock (slow / behind). */
export type DvrDriftMs = number

export function driftFromClocks(realMs: number, dvrMs: number): DvrDriftMs {
  return dvrMs - realMs
}

export function composeManualOffset(
  parts: { years: number; months: number; days: number; hours: number; minutes: number },
  direction: 'slow' | 'fast',
): DvrDriftMs {
  const y = Math.max(0, Math.floor(parts.years || 0))
  const mo = Math.max(0, Math.floor(parts.months || 0))
  const d = Math.max(0, Math.floor(parts.days || 0))
  const h = Math.max(0, Math.floor(parts.hours || 0))
  const mi = Math.max(0, Math.floor(parts.minutes || 0))
  const pos =
    mi * 60_000 +
    h * 3_600_000 +
    d * 86_400_000 +
    mo * 30 * 86_400_000 +
    y * 365 * 86_400_000
  return direction === 'slow' ? -pos : pos
}

export function manualOffsetHasInput(parts: {
  years: number
  months: number
  days: number
  hours: number
  minutes: number
}): boolean {
  return [parts.years, parts.months, parts.days, parts.hours, parts.minutes].some((v) => Math.abs(Number(v) || 0) > 0)
}

/** Approximate decomposition for display (fixed month/day lengths). */
export function decomposeAbsMs(msAbs: number): { y: number; m: number; d: number; h: number; min: number } {
  const MIN = 60_000
  const H = 60 * MIN
  const D = 24 * H
  const MO = 30 * D
  const Y = 365 * D
  let r = Math.max(0, Math.round(msAbs))
  const y = Math.floor(r / Y)
  r %= Y
  const m = Math.floor(r / MO)
  r %= MO
  const d = Math.floor(r / D)
  r %= D
  const h = Math.floor(r / H)
  r %= H
  const min = Math.round(r / MIN)
  return { y, m, d, h, min }
}

/**
 * Non-zero parts only, coarse → fine: years, months, days, hours, minutes.
 */
export function formatDriftBreakdown(p: { y: number; m: number; d: number; h: number; min: number }): string {
  const segments: string[] = []
  const push = (n: number, singular: string, plural: string) => {
    if (n === 0) return
    segments.push(`${n} ${n === 1 ? singular : plural}`)
  }
  push(p.y, 'year', 'years')
  push(p.m, 'month', 'months')
  push(p.d, 'day', 'days')
  push(p.h, 'hour', 'hours')
  push(p.min, 'minute', 'minutes')
  if (segments.length === 0) return '0 minutes'
  return segments.join(', ')
}

export function driftDirectionLabel(driftMs: DvrDriftMs): { kind: 'slow' | 'fast' | 'none'; summary: string } {
  if (driftMs === 0) return { kind: 'none', summary: 'No difference between device time and DVR time.' }
  const abs = Math.abs(driftMs)
  const parts = decomposeAbsMs(abs)
  const breakdown = formatDriftBreakdown(parts)
  if (driftMs < 0) {
    return {
      kind: 'slow',
      summary: `The DVR clock is ${breakdown} slower than real time (it shows an earlier time).`,
    }
  }
  return {
    kind: 'fast',
    summary: `The DVR clock is ${breakdown} faster than real time (it shows a later time).`,
  }
}

/** Real-world incident → timestamp to search on DVR (linear drift). */
export function incidentRealToDvrDisplay(incidentRealMs: number, driftMs: DvrDriftMs): Date {
  return new Date(incidentRealMs + driftMs)
}

export { dateToDatetimeLocalValue as formatDateTimeLocal, parseDatetimeLocalToTimestamp as parseDateTimeLocal } from '../lib/timeFormat'
