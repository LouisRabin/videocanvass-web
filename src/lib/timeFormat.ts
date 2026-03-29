/** 24-hour (military) clock for all user-visible timestamps in the app. */
const DISPLAY: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

export function formatAppDateTime(ts: number | Date): string {
  return new Date(ts).toLocaleString(undefined, DISPLAY)
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Value for `<input type="datetime-local" step="1" />` — always includes seconds (default :00).
 */
export function dateToDatetimeLocalValue(d: Date): string {
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
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  const cal = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  return `${clock}, ${cal}`
}
