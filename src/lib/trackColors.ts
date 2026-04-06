import type { Track } from './types'

/** First four tracks (by creation order) get these colors when `routeColor` is empty. */
export const TRACK_DEFAULT_COLORS_FIRST_FOUR = ['#2563eb', '#dc2626', '#22c55e', '#9333ea'] as const

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

/** Normalize to lowercase `#rrggbb` or null. */
function normalizeHexColor(c: string): string | null {
  const t = c.trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase()
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const h = t.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return null
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const sf = s / 100
  const lf = l / 100
  const c = (1 - Math.abs(2 * lf - 1)) * sf
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lf - c / 2
  let rp = 0
  let gp = 0
  let bp = 0
  if (h < 60) {
    rp = c
    gp = x
  } else if (h < 120) {
    rp = x
    gp = c
  } else if (h < 180) {
    gp = c
    bp = x
  } else if (h < 240) {
    gp = x
    bp = c
  } else if (h < 300) {
    rp = x
    bp = c
  } else {
    rp = c
    bp = x
  }
  const r = Math.round((rp + m) * 255)
  const g = Math.round((gp + m) * 255)
  const b = Math.round((bp + m) * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Deterministic color not in `used` (for 5th+ track with empty `routeColor`).
 * User-chosen colors can duplicate; this only affects auto-assignment.
 */
function stableRandomColorNotIn(used: Set<string>, seed: string): string {
  let h = hashString(seed)
  for (let attempt = 0; attempt < 120; attempt++) {
    const hue = (h + attempt * 47) % 360
    const sat = 68 + (attempt % 4) * 4
    const light = 44 + (attempt % 3) * 3
    const c = hslToHex(hue, sat, light)
    if (!used.has(c)) return c
    h = (h * 1664525 + 1013904223) >>> 0
  }
  for (let k = 0; k < 0x1000000; k += 9973) {
    const c = `#${(((hashString(seed) + k) >>> 0) % 0xffffff).toString(16).padStart(6, '0')}`
    if (!used.has(c)) return c
  }
  return '#808080'
}

/**
 * Oldest-first: index 0..3 use default quartet; 4+ use stable random avoiding colors
 * already taken by earlier tracks (explicit `routeColor` or computed defaults).
 */
export function buildResolvedTrackColorMap(tracks: Track[]): Map<string, string> {
  const sorted = [...tracks].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  const out = new Map<string, string>()
  const used = new Set<string>()
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]!
    let c = normalizeHexColor(t.routeColor ?? '')
    if (!c) {
      c = i < 4 ? TRACK_DEFAULT_COLORS_FIRST_FOUR[i]! : stableRandomColorNotIn(used, t.id)
    }
    out.set(t.id, c)
    used.add(c)
  }
  return out
}

/** Color for a new track before it exists (n = current count in case). */
export function pickRouteColorForNewTrack(existingInCase: Track[], newTrackId: string): string {
  const sorted = [...existingInCase].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  const n = sorted.length
  if (n < 4) return TRACK_DEFAULT_COLORS_FIRST_FOUR[n]!
  const used = new Set(buildResolvedTrackColorMap(sorted).values())
  return stableRandomColorNotIn(used, newTrackId)
}
