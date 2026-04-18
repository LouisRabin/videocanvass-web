/**
 * Parse pasted coordinate lines and spreadsheet grids (CSV / Excel matrix) for track point import.
 * Indices in GridParseOpts use 1-based rows/columns as shown to users (column 1 = A).
 *
 * **Scope:** Import pipeline and `TrackImportPanel` preview only. Overlap grouping here does not
 * affect Video canvassing, address search, or `Location` selection (`casePageHelpers` / map tap).
 */

import { parseImportInstantCell } from './trackImportTimeParse'

export type LatLonPoint = { lat: number; lon: number; /** UTC ms from optional import time column */ visitedAt?: number }

export type LatLonImportRow = {
  lat: number
  lon: number
  /** Parsed observation time (UTC ms) when a time column was mapped */
  visitedAtMs?: number | null
  /** 1-based sheet row when from column-mode grid */
  sourceRow1Based?: number
  /** 1-based sheet column when from row-mode grid */
  sourceCol1Based?: number
  /** 1-based line in paste text */
  pasteLine1Based?: number
}

type GridAutoDiagnostics = {
  reason: 'header' | 'scored'
  latCol1Based: number
  lonCol1Based: number
  latColLetters: string
  lonColLetters: string
  /** Row where lat/lon headers were found (1-based), if reason === 'header' */
  headerRow1Based: number | null
  /** First data row (1-based) */
  dataStartRow1Based: number
}

export type GridParseOpts =
  | { mode: 'auto' }
  | {
      mode: 'columns'
      latCol: number
      lonCol: number
      /** 1-based optional time / timestamp column (ISO, Excel serial, or parseable date string). */
      timeCol?: number
      /** 1-based row containing headers (optional). */
      headerRow?: number
      /** 1-based first data row. If omitted and headerRow set, defaults to headerRow + 1. */
      dataStartRow?: number
    }
  | {
      mode: 'rows'
      latRow: number
      lonRow: number
      /** 1-based first data column (default 1). */
      dataStartCol?: number
    }

type GridParseResult = {
  points: LatLonPoint[]
  /** Parallel detail for each point (same order as `points`) when available */
  rows?: LatLonImportRow[]
  warnings: string[]
  errors: string[]
  /** Set when mode was auto and detection succeeded */
  diagnostics?: GridAutoDiagnostics
}

type OverlapGroup = {
  /** Rounded-coordinate key for debugging */
  key: string
  approxLat: number
  approxLon: number
  /** Indices into the `rows` / `points` array */
  indices: number[]
}

/**
 * Group import rows that share the same coordinates after rounding (default ~1.1 m).
 * For import UI / validation only — not used for canvass addresses or search dedup.
 */
export function groupOverlappingImportRows(rows: LatLonImportRow[], decimals = 5): OverlapGroup[] {
  const mult = 10 ** decimals
  const m = new Map<string, number[]>()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!
    const key = `${Math.round(r.lat * mult)},${Math.round(r.lon * mult)}`
    const arr = m.get(key) ?? []
    arr.push(i)
    m.set(key, arr)
  }
  const out: OverlapGroup[] = []
  for (const [key, indices] of m) {
    if (indices.length < 2) continue
    const first = rows[indices[0]!]!
    out.push({ key, approxLat: first.lat, approxLon: first.lon, indices })
  }
  return out
}

/** Convert Excel column letters to 1-based column index (A=1, Z=26, AA=27). */
export function columnLettersTo1Based(letters: string): number | null {
  const s = letters.trim().replace(/\$/g, '').toUpperCase()
  if (!s || !/^[A-Z]+$/.test(s)) return null
  let n = 0
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i)! - 64)
  }
  return n
}

/** 1-based column index to Excel letters. */
export function column1BasedToLetters(n: number): string {
  if (!Number.isFinite(n) || n < 1) return ''
  let s = ''
  let x = Math.floor(n)
  while (x > 0) {
    x--
    s = String.fromCharCode(65 + (x % 26)) + s
    x = Math.floor(x / 26)
  }
  return s
}

/**
 * Parse a user-entered column: `1`, `26`, `A`, `AA`, optional `$` on letters.
 * Returns null if invalid or empty.
 */
export function parseUserColumnRef1Based(raw: string): { value: number; usedLetters: boolean } | null {
  const t = raw.trim().replace(/\$/g, '')
  if (!t) return null
  if (/^\d+$/.test(t)) {
    const v = parseInt(t, 10)
    if (v < 1) return null
    return { value: v, usedLetters: false }
  }
  const cv = columnLettersTo1Based(t)
  if (cv == null) return null
  return { value: cv, usedLetters: true }
}

const LAT_SYNONYMS = /^(lat|latitude|y\s*coord|ycoord)$/i
const LON_SYNONYMS = /^(lon|lng|long|longitude|x\s*coord|xcoord)$/i
const LAT_ALT = /^(northing)$/i
const LON_ALT = /^(easting)$/i

function normalizeNumericToken(raw: string): string {
  let t = raw.trim().replace(/^\uFEFF/, '').replace(/\s/g, '')
  if (!t) return ''
  if (/^\(.*\)$/.test(t)) {
    const inner = t.slice(1, -1).replace(/\s/g, '')
    t = inner ? `-${inner}` : ''
  }
  if (!t) return ''
  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t) || /^-?\d{1,3}(?:,\d{3})+$/.test(t)) {
    t = t.replace(/,/g, '')
  } else {
    t = t.replace(',', '.')
  }
  return t
}

/** Parse a single cell to finite number or null. */
export function parseNumberCell(s: string): number | null {
  const t = normalizeNumericToken(s.trim())
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function isPlausibleLat(n: number): boolean {
  return n >= -90 && n <= 90
}

function isPlausibleLon(n: number): boolean {
  return n >= -180 && n <= 180
}

/** Interpret (a,b) as lat/lon, swapping if needed. */
export function pairToLatLon(a: number, b: number): { lat: number; lon: number } | null {
  const aLat = isPlausibleLat(a) && isPlausibleLon(b)
  const bLat = isPlausibleLat(b) && isPlausibleLon(a)
  if (aLat && !bLat) return { lat: a, lon: b }
  if (bLat && !aLat) return { lat: b, lon: a }
  if (aLat && bLat) return { lat: a, lon: b }
  return null
}

type TextParseResult = GridParseResult

/** Parse pasted lines: two numbers per line (comma, tab, or spaces). */
export function parseLatLonPasteText(text: string): TextParseResult {
  const warnings: string[] = []
  const errors: string[] = []
  const rows: LatLonImportRow[] = []
  const lines = text.split(/\r?\n/)
  let lineNum = 0
  for (const line of lines) {
    lineNum++
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split(/[\t,]+|\s{2,}|\s+(?=-?\d)/).filter((p) => p.trim() !== '')
    const tokens = parts.length >= 2 ? [parts[0]!, parts[1]!] : trimmed.split(/\s+/).filter(Boolean)
    if (tokens.length < 2) {
      errors.push(`Line ${lineNum}: need two numbers (lat and lon).`)
      continue
    }
    const a = parseNumberCell(tokens[0]!)
    const b = parseNumberCell(tokens[1]!)
    if (a == null || b == null) {
      errors.push(`Line ${lineNum}: could not parse numbers.`)
      continue
    }
    const pair = pairToLatLon(a, b)
    if (!pair) {
      errors.push(`Line ${lineNum}: values out of range for latitude/longitude.`)
      continue
    }
    if (pair.lat === b && pair.lon === a && isPlausibleLat(a) && isPlausibleLon(b)) {
      warnings.push(`Line ${lineNum}: interpreted as lat ${pair.lat}, lon ${pair.lon} (swapped).`)
    }
    rows.push({ lat: pair.lat, lon: pair.lon, pasteLine1Based: lineNum })
  }
  const points = rows.map((r) => ({ lat: r.lat, lon: r.lon }))
  return { points, rows, warnings, errors }
}

/** Minimal CSV line split (handles quoted fields). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      inQ = !inQ
      continue
    }
    if (!inQ && ch === ',') {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

export function textToMatrix(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  return lines.map((line) => splitCsvLine(line).map((c) => c.replace(/^"|"$/g, '').trim()))
}

function headerTokens(s: string): string[] {
  return s
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0)
}

const HEADER_LAT_TOKENS = new Set([
  'lat',
  'latitude',
  'northing',
  'ycoord',
  'declat',
  'latdd',
  'decimallatitude',
])
const HEADER_LON_TOKENS = new Set([
  'lon',
  'lng',
  'longitude',
  'long',
  'easting',
  'xcoord',
  'declon',
  'londd',
  'decimallongitude',
])

const HEADER_TIME_TOKENS = new Set([
  'time',
  'timestamp',
  'datetime',
  'visited',
  'visitedat',
  'subjecttime',
  'observed',
  'observedat',
])

function cellTimeHeaderMatch(s: string): boolean {
  const t = s.trim().replace(/^\uFEFF/, '')
  if (!t) return false
  if (/^(time|timestamp|datetime|date\s*time|visited(\s*at)?|observed(\s*at)?)$/i.test(t)) return true
  const tokens = headerTokens(t)
  for (const w of tokens) {
    if (HEADER_TIME_TOKENS.has(w)) return true
  }
  return false
}

/** Find a time column on the same header row, excluding lat/lon columns. */
function findTimeColumnInHeaderRow(matrix: string[][], headerRow0: number, exclude: Set<number>): number | null {
  const row = matrix[headerRow0] ?? []
  const width = row.length
  for (let c = 0; c < width; c++) {
    if (exclude.has(c)) continue
    if (cellTimeHeaderMatch(row[c] ?? '')) return c
  }
  return null
}

function cellHeaderMatch(s: string): 'lat' | 'lon' | null {
  const t = s.trim().replace(/^\uFEFF/, '')
  if (!t) return null
  if (LAT_SYNONYMS.test(t) || LAT_ALT.test(t)) return 'lat'
  if (LON_SYNONYMS.test(t) || LON_ALT.test(t)) return 'lon'
  if (/^y$/i.test(t)) return 'lat'
  if (/^x$/i.test(t)) return 'lon'

  const tl = t.toLowerCase().replace(/_/g, '')
  if (/declat|latdd|decimallat/.test(tl) && !/lon|lng|long/.test(tl)) return 'lat'
  if (/declon|londd|decimallon/.test(tl) && !/lat/.test(tl)) return 'lon'

  const tokens = headerTokens(t)
  let latHit = false
  let lonHit = false
  for (const w of tokens) {
    if (HEADER_LAT_TOKENS.has(w)) latHit = true
    if (HEADER_LON_TOKENS.has(w)) lonHit = true
  }
  if (latHit && !lonHit) return 'lat'
  if (lonHit && !latHit) return 'lon'
  return null
}

function scoreColumnAsLat(matrix: string[][], col: number): number {
  let score = 0
  for (let r = 0; r < matrix.length; r++) {
    const n = parseNumberCell(matrix[r]?.[col] ?? '')
    if (n != null && isPlausibleLat(n) && !isPlausibleLon(n)) score += 2
    else if (n != null && isPlausibleLat(n)) score += 1
  }
  return score
}

function scoreColumnAsLon(matrix: string[][], col: number): number {
  let score = 0
  for (let r = 0; r < matrix.length; r++) {
    const n = parseNumberCell(matrix[r]?.[col] ?? '')
    if (n != null && isPlausibleLon(n) && !isPlausibleLat(n)) score += 2
    else if (n != null && isPlausibleLon(n)) score += 1
  }
  return score
}

function findHeaderRowAndColumns(matrix: string[][]): { latCol: number; lonCol: number; dataStartRow0: number } | null {
  const maxScan = Math.min(25, matrix.length)
  const width = Math.max(0, ...matrix.map((r) => r.length))
  if (width < 2) return null

  for (let r = 0; r < maxScan; r++) {
    const row = matrix[r] ?? []
    let latCol = -1
    let lonCol = -1
    for (let c = 0; c < width; c++) {
      const kind = cellHeaderMatch(row[c] ?? '')
      if (kind === 'lat' && latCol < 0) latCol = c
      if (kind === 'lon' && lonCol < 0) lonCol = c
    }
    if (latCol >= 0 && lonCol >= 0 && latCol !== lonCol) {
      return { latCol, lonCol, dataStartRow0: r + 1 }
    }
  }
  return null
}

function autoDetectColumns(matrix: string[][]): {
  latCol: number
  lonCol: number
  dataStartRow0: number
  reason: 'header' | 'scored'
} | null {
  const header = findHeaderRowAndColumns(matrix)
  if (header) return { ...header, reason: 'header' }

  const width = Math.max(0, ...matrix.map((r) => r.length))
  if (width < 2) return null

  let bestLat = -1
  let bestLatScore = -1
  let bestLon = -1
  let bestLonScore = -1
  for (let c = 0; c < width; c++) {
    const ls = scoreColumnAsLat(matrix, c)
    const os = scoreColumnAsLon(matrix, c)
    if (ls > bestLatScore) {
      bestLatScore = ls
      bestLat = c
    }
    if (os > bestLonScore) {
      bestLonScore = os
      bestLon = c
    }
  }
  if (bestLat < 0 || bestLon < 0 || bestLat === bestLon) return null
  if (bestLatScore < 1 || bestLonScore < 1) return null
  return { latCol: bestLat, lonCol: bestLon, dataStartRow0: 0, reason: 'scored' }
}

function extractColumnMode(
  matrix: string[][],
  latCol0: number,
  lonCol0: number,
  dataStartRow0: number,
  timeCol0: number | null,
  importTimeZone: string,
): { rows: LatLonImportRow[]; errors: string[] } {
  const errors: string[] = []
  const rows: LatLonImportRow[] = []
  const w = Math.max(0, ...matrix.map((r) => r.length))
  if (latCol0 < 0 || lonCol0 < 0 || latCol0 >= w || lonCol0 >= w) {
    errors.push('Column index out of range for this sheet.')
    return { rows, errors }
  }
  if (timeCol0 != null && (timeCol0 < 0 || timeCol0 >= w)) {
    errors.push('Time column index out of range for this sheet.')
    return { rows, errors }
  }
  for (let r = dataStartRow0; r < matrix.length; r++) {
    const a = parseNumberCell(matrix[r]?.[latCol0] ?? '')
    const b = parseNumberCell(matrix[r]?.[lonCol0] ?? '')
    if (a == null && b == null) continue
    if (a == null || b == null) {
      errors.push(`Row ${r + 1}: missing lat or lon value.`)
      continue
    }
    const pair = pairToLatLon(a, b)
    if (!pair) {
      errors.push(`Row ${r + 1}: invalid lat/lon.`)
      continue
    }
    let visitedAtMs: number | null | undefined
    if (timeCol0 != null) {
      const rawT = matrix[r]?.[timeCol0] ?? ''
      visitedAtMs = parseImportInstantCell(String(rawT), importTimeZone)
    }
    rows.push({
      lat: pair.lat,
      lon: pair.lon,
      ...(timeCol0 != null ? { visitedAtMs: visitedAtMs ?? null } : {}),
      sourceRow1Based: r + 1,
    })
  }
  return { rows, errors }
}

function extractRowMode(
  matrix: string[][],
  latRow0: number,
  lonRow0: number,
  dataStartCol0: number,
): { rows: LatLonImportRow[]; errors: string[] } {
  const errors: string[] = []
  const rows: LatLonImportRow[] = []
  if (latRow0 < 0 || lonRow0 < 0 || latRow0 >= matrix.length || lonRow0 >= matrix.length) {
    errors.push('Row index out of range for this sheet.')
    return { rows, errors }
  }
  const width = Math.max(0, ...matrix.map((r) => r.length))
  for (let c = dataStartCol0; c < width; c++) {
    const a = parseNumberCell(matrix[latRow0]?.[c] ?? '')
    const b = parseNumberCell(matrix[lonRow0]?.[c] ?? '')
    if (a == null && b == null) continue
    if (a == null || b == null) {
      errors.push(`Column ${c + 1}: missing lat or lon value.`)
      continue
    }
    const pair = pairToLatLon(a, b)
    if (!pair) {
      errors.push(`Column ${c + 1}: invalid lat/lon.`)
      continue
    }
    rows.push({ lat: pair.lat, lon: pair.lon, sourceCol1Based: c + 1 })
  }
  return { rows, errors }
}

function buildDiagnosticsFromDetection(det: {
  latCol: number
  lonCol: number
  dataStartRow0: number
  reason: 'header' | 'scored'
}): GridAutoDiagnostics {
  const latCol1Based = det.latCol + 1
  const lonCol1Based = det.lonCol + 1
  return {
    reason: det.reason,
    latCol1Based,
    lonCol1Based,
    latColLetters: column1BasedToLetters(latCol1Based),
    lonColLetters: column1BasedToLetters(lonCol1Based),
    headerRow1Based: det.reason === 'header' ? det.dataStartRow0 : null,
    dataStartRow1Based: det.dataStartRow0 + 1,
  }
}

export function parseGridPoints(matrix: string[][], opts: GridParseOpts, importTimeZone = 'UTC'): GridParseResult {
  const warnings: string[] = []
  const errors: string[] = []
  if (!matrix.length) {
    return { points: [], warnings, errors: ['No data rows found.'] }
  }

  if (opts.mode === 'columns') {
    const { latCol, lonCol, timeCol, headerRow, dataStartRow } = opts
    if (latCol < 1 || lonCol < 1) {
      return { points: [], warnings, errors: ['Column numbers must be 1 or greater.'] }
    }
    if (timeCol != null && timeCol < 1) {
      return { points: [], warnings, errors: ['Time column must be 1 or greater if set.'] }
    }
    if (headerRow != null && headerRow < 1) {
      return { points: [], warnings, errors: ['Header row must be 1 or greater.'] }
    }
    if (dataStartRow != null && dataStartRow < 1) {
      return { points: [], warnings, errors: ['First data row must be 1 or greater.'] }
    }
    const lat0 = latCol - 1
    const lon0 = lonCol - 1
    const time0 = timeCol != null ? timeCol - 1 : null
    let start0: number
    if (dataStartRow != null) start0 = dataStartRow - 1
    else if (headerRow != null) start0 = headerRow
    else start0 = 0
    const { rows, errors: e } = extractColumnMode(matrix, lat0, lon0, start0, time0, importTimeZone)
    errors.push(...e)
    const points = rows.map((r) => {
      const pt: LatLonPoint = { lat: r.lat, lon: r.lon }
      if (r.visitedAtMs != null && Number.isFinite(r.visitedAtMs)) pt.visitedAt = r.visitedAtMs
      return pt
    })
    return { points, rows, warnings, errors }
  }

  if (opts.mode === 'rows') {
    const { latRow, lonRow, dataStartCol } = opts
    if (latRow < 1 || lonRow < 1) {
      return { points: [], warnings, errors: ['Row numbers must be 1 or greater.'] }
    }
    const dc = dataStartCol ?? 1
    if (dc < 1) {
      return { points: [], warnings, errors: ['First data column must be 1 or greater.'] }
    }
    const { rows, errors: e } = extractRowMode(matrix, latRow - 1, lonRow - 1, dc - 1)
    errors.push(...e)
    const points = rows.map((r) => {
      const pt: LatLonPoint = { lat: r.lat, lon: r.lon }
      if (r.visitedAtMs != null && Number.isFinite(r.visitedAtMs)) pt.visitedAt = r.visitedAtMs
      return pt
    })
    return { points, rows, warnings, errors }
  }

  const det = autoDetectColumns(matrix)
  if (!det) {
    return {
      points: [],
      warnings,
      errors: [
        'Could not detect latitude/longitude columns. Use manual column or row indices, or paste coordinates as text.',
      ],
    }
  }
  const headerRow0 = det.reason === 'header' ? det.dataStartRow0 - 1 : -1
  const timeCol0 =
    det.reason === 'header' && headerRow0 >= 0
      ? findTimeColumnInHeaderRow(matrix, headerRow0, new Set([det.latCol, det.lonCol]))
      : null
  const { rows, errors: e } = extractColumnMode(
    matrix,
    det.latCol,
    det.lonCol,
    det.dataStartRow0,
    timeCol0,
    importTimeZone,
  )
  errors.push(...e)
  const points = rows.map((r) => {
    const pt: LatLonPoint = { lat: r.lat, lon: r.lon }
    if (r.visitedAtMs != null && Number.isFinite(r.visitedAtMs)) pt.visitedAt = r.visitedAtMs
    return pt
  })
  const diagnostics = buildDiagnosticsFromDetection(det)
  if (timeCol0 != null && rows.some((r) => r.visitedAtMs != null)) {
    warnings.push('Auto-detected a time column from the header row; parsed as ISO / Excel serial / date string where possible.')
  }
  return { points, rows, warnings, errors, diagnostics }
}

export async function excelBufferToMatrix(buffer: ArrayBuffer): Promise<string[][] | null> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  const name = wb.SheetNames[0]
  if (!name) return null
  const sheet = wb.Sheets[name]
  if (!sheet) return null
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null | undefined)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  })
  return rows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => {
      if (cell == null || cell === '') return ''
      if (typeof cell === 'number') {
        return Number.isFinite(cell) ? String(cell) : ''
      }
      if (typeof cell === 'boolean') return cell ? 'TRUE' : 'FALSE'
      return String(cell).trim()
    }),
  )
}
