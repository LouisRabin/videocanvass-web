import type { Track } from './types'

/** Preferred palette for auto-assigned path colors (first free slot not already in use). */
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
 * Deterministic color not in `used` (after default quartet is exhausted or fully taken).
 * User-chosen `routeColor` may duplicate; this only affects auto-assignment.
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
 * Oldest-first: empty `routeColor` picks the first default-quartet color not already used by any
 * track (explicit or auto). Duplicates are allowed only when the user sets `routeColor` explicitly.
 * After the quartet is exhausted, uses stable random distinct colors.
 */
export function buildResolvedTrackColorMap(tracks: Track[]): Map<string, string> {
  const sorted = [...tracks].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  const out = new Map<string, string>()
  const used = new Set<string>()
  for (const t of sorted) {
    const explicit = normalizeHexColor(t.routeColor ?? '')
    if (explicit) {
      out.set(t.id, explicit)
      used.add(explicit)
      continue
    }
    let c: string | null = null
    for (const d of TRACK_DEFAULT_COLORS_FIRST_FOUR) {
      if (!used.has(d)) {
        c = d
        break
      }
    }
    if (!c) c = stableRandomColorNotIn(used, t.id)
    out.set(t.id, c)
    used.add(c)
  }
  return out
}

/** Colors already taken by other paths in the case (resolved from stored `routeColor` + auto palette rules). */
export function collectUsedResolvedRouteColors(tracks: Track[]): Set<string> {
  const m = buildResolvedTrackColorMap(tracks)
  return new Set(m.values())
}

/** Color stored on a new track: first free default, else distinct random vs all existing resolved colors. */
export function pickRouteColorForNewTrack(existingInCase: Track[], newTrackId: string): string {
  const sorted = [...existingInCase].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  const used = collectUsedResolvedRouteColors(sorted)
  for (const d of TRACK_DEFAULT_COLORS_FIRST_FOUR) {
    if (!used.has(d)) return d
  }
  return stableRandomColorNotIn(used, newTrackId)
}
