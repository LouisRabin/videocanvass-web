/** IANA time zone helpers for track dwell / playback (DST via `Intl`). */

const STORAGE_KEY = 'vc.trackDisplayTimeZone'

export function getBrowserIanaTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function loadStoredTrackDisplayTimeZone(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim()
    return v || null
  } catch {
    return null
  }
}

export function saveTrackDisplayTimeZone(zone: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, zone)
  } catch {
    /* ignore */
  }
}

export function isValidIanaTimeZone(zone: string): boolean {
  const z = zone.trim()
  if (!z) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z }).format(0)
    return true
  } catch {
    return false
  }
}

export function listIanaTimeZones(): string[] {
  try {
    const v = Intl.supportedValuesOf('timeZone')
    return v.length ? v.slice() : fallbackZones()
  } catch {
    return fallbackZones()
  }
}

function fallbackZones(): string[] {
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'Europe/London',
    'Europe/Paris',
    'Asia/Tokyo',
    'Australia/Sydney',
  ]
}

export function formatInstantInTimeZone(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(ms)
  } catch {
    return new Date(ms).toISOString()
  }
}

/** Short clock for compact dwell strings (same calendar day assumed OK for label). */
export function formatTimeOnlyInZone(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(ms)
  } catch {
    return new Date(ms).toISOString().slice(11, 19)
  }
}

export function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h < 48) return rm > 0 ? `${h}h ${rm}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

export function formatDwellSegmentLabel(
  startStep: number,
  endStep: number,
  startMs: number | null,
  endMs: number | null,
  timeZone: string,
): string {
  const stepPart =
    startStep === endStep ? `Step ${startStep}` : `Steps ${startStep}–${endStep}`
  if (startMs == null || endMs == null) {
    return `${stepPart} · time unknown`
  }
  const t0 = formatTimeOnlyInZone(startMs, timeZone)
  const t1 = formatTimeOnlyInZone(endMs, timeZone)
  const dur = formatDurationShort(endMs - startMs)
  return `${stepPart} · ${t0} – ${t1} · ${dur}`
}
