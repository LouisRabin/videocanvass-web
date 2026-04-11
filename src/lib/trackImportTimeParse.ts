/**
 * Parse spreadsheet / pasted time cells into UTC epoch ms for `visitedAt`.
 * Prefer ISO-8601 with offset or Z. Excel serial days supported. Ambiguous local strings fall back to `Date.parse`.
 */

/** Excel serial date (days since 1899-12-30 UTC, fraction = time of day) → UTC ms. */
function excelSerialToUtcMs(serial: number): number {
  const MS_PER_DAY = 86400000
  // 25569 = days from Excel epoch to Unix epoch (accounting for Excel’s 1900 leap bug in practice)
  return Math.round((serial - 25569) * MS_PER_DAY)
}

/**
 * @param defaultIanaZone reserved for future wall-time parsing without offset; currently unused for `Date.parse` paths.
 */
export function parseImportInstantCell(raw: string, defaultIanaZone: string): number | null {
  void defaultIanaZone
  const s = raw.trim().replace(/^\uFEFF/, '')
  if (!s) return null

  const isoTry = Date.parse(s)
  if (Number.isFinite(isoTry)) return isoTry

  const num = Number(s.replace(/,/g, ''))
  if (Number.isFinite(num) && num > 20000 && num < 100000) {
    const ms = excelSerialToUtcMs(num)
    if (Number.isFinite(ms) && ms > 0 && ms < 4102444800000) return ms
  }

  const normalized = s.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/, (_, a, b, y) => `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`)
  const t2 = Date.parse(normalized)
  if (Number.isFinite(t2)) return t2

  return null
}
