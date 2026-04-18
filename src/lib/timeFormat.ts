/** Fixed locale for the calendar portion only (no `Intl` time fields — clock is always manual 00–23). */
const APP_DISPLAY_LOCALE = 'en-US'

const padClock = (n: number) => String(n).padStart(2, '0')

/**
 * Calendar date + **24-hour (military) clock** built from numeric components so UI never depends on OS/AM–PM.
 */
export function formatAppDateTime(ts: number | Date): string {
  const d = new Date(ts)
  const cal = d.toLocaleDateString(APP_DISPLAY_LOCALE, { year: 'numeric', month: 'short', day: 'numeric' })
  const clock = `${padClock(d.getHours())}:${padClock(d.getMinutes())}:${padClock(d.getSeconds())}`
  return `${cal}, ${clock}`
}

/** Same as {@link formatAppDateTime} but clock is `HH:mm` only (DVR calculator). */
export function formatAppDateTimeNoSeconds(ts: number | Date): string {
  const d = new Date(ts)
  const cal = d.toLocaleDateString(APP_DISPLAY_LOCALE, { year: 'numeric', month: 'short', day: 'numeric' })
  const clock = `${padClock(d.getHours())}:${padClock(d.getMinutes())}`
  return `${cal}, ${clock}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Value for `<input type="datetime-local" step="1" />` — always includes seconds (default :00).
 */
function dateToDatetimeLocalValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function timestampToDatetimeLocalValue(ts: number | null): string {
  if (ts == null) return ''
  return dateToDatetimeLocalValue(new Date(ts))
}

/**
 * Parse `datetime-local` strings; accepts `YYYY-MM-DDTHH:mm` and normalizes to `:00` seconds.
 */
export function parseDatetimeLocalToTimestamp(s: string): number | null {
  if (!s.trim()) return null
  let t = s.trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) t = `${t}:00`
  const ms = new Date(t).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** 24-hour time first, then calendar date (for DVR incident display). */
export function formatTimeThenDate(ts: number | Date): string {
  const d = new Date(ts)
  const clock = `${padClock(d.getHours())}:${padClock(d.getMinutes())}:${padClock(d.getSeconds())}`
  const cal = d.toLocaleDateString(APP_DISPLAY_LOCALE, { year: 'numeric', month: 'short', day: 'numeric' })
  return `${clock}, ${cal}`
}

/** Same as {@link formatTimeThenDate} but clock is `HH:mm` only (DVR calculator). */
export function formatTimeThenDateNoSeconds(ts: number | Date): string {
  const d = new Date(ts)
  const clock = `${padClock(d.getHours())}:${padClock(d.getMinutes())}`
  const cal = d.toLocaleDateString(APP_DISPLAY_LOCALE, { year: 'numeric', month: 'short', day: 'numeric' })
  return `${clock}, ${cal}`
}
