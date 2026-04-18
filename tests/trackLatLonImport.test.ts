import { describe, expect, it } from 'vitest'
import {
  column1BasedToLetters,
  columnLettersTo1Based,
  groupOverlappingImportRows,
  pairToLatLon,
  parseGridPoints,
  parseLatLonPasteText,
  parseNumberCell,
  parseUserColumnRef1Based,
  textToMatrix,
} from '../src/lib/trackLatLonImport'

describe('parseNumberCell', () => {
  it('accepts decimal comma and spaces', () => {
    expect(parseNumberCell(' 40,7128 ')).toBe(40.7128)
    expect(parseNumberCell('-74.006')).toBe(-74.006)
  })

  it('accepts US thousands separator and accounting negatives', () => {
    expect(parseNumberCell('1,234.56')).toBe(1234.56)
    expect(parseNumberCell('(40.5)')).toBe(-40.5)
  })
})

describe('pairToLatLon', () => {
  it('keeps token order when both orders are plausible', () => {
    expect(pairToLatLon(40.7, -74.0)).toEqual({ lat: 40.7, lon: -74.0 })
    expect(pairToLatLon(-74.0, 40.7)).toEqual({ lat: -74.0, lon: 40.7 })
  })

  it('swaps when only the second token can be latitude', () => {
    expect(pairToLatLon(-175.0, 40.7)).toEqual({ lat: 40.7, lon: -175.0 })
  })

  it('returns null when neither order is valid lat/lon', () => {
    expect(pairToLatLon(200, 300)).toBeNull()
  })
})

describe('parseLatLonPasteText', () => {
  it('parses comma, tab, and multi-space separated pairs', () => {
    const r = parseLatLonPasteText('40.1,-73.1\n40.2\t-73.2\n40.3  -73.3')
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([
      { lat: 40.1, lon: -73.1 },
      { lat: 40.2, lon: -73.2 },
      { lat: 40.3, lon: -73.3 },
    ])
  })

  it('skips blanks and # comments', () => {
    const r = parseLatLonPasteText('\n# note\n  \n41 -71\n')
    expect(r.points).toEqual([{ lat: 41, lon: -71 }])
  })

  it('reports invalid lines', () => {
    const r = parseLatLonPasteText('only-one\n40 x\n200 300')
    expect(r.points.length).toBe(0)
    expect(r.errors.some((e) => e.includes('need two numbers'))).toBe(true)
    expect(r.errors.some((e) => e.includes('could not parse'))).toBe(true)
    expect(r.errors.some((e) => e.includes('out of range'))).toBe(true)
  })
})

describe('parseGridPoints auto', () => {
  it('detects Latitude/Longitude header row', () => {
    const m = textToMatrix('Name,Latitude,Longitude\nA,40.1,-73.1\nB,40.2,-73.2')
    const r = parseGridPoints(m, { mode: 'auto' })
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([
      { lat: 40.1, lon: -73.1 },
      { lat: 40.2, lon: -73.2 },
    ])
    expect(r.diagnostics?.reason).toBe('header')
    expect(r.rows?.map((x) => x.sourceRow1Based)).toEqual([2, 3])
  })

  it('detects End_Latitude and End_Longitude style headers', () => {
    const m = [
      ['ID', 'End_Latitude', 'End_Longitude'],
      ['1', '40.1', '-73.1'],
      ['2', '40.2', '-73.2'],
    ]
    const r = parseGridPoints(m, { mode: 'auto' })
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([
      { lat: 40.1, lon: -73.1 },
      { lat: 40.2, lon: -73.2 },
    ])
  })

  it('detects headers with BOM on first cell', () => {
    const m = textToMatrix('\ufeffEnd_Latitude,End_Longitude\n40.5,-74.5')
    const r = parseGridPoints(m, { mode: 'auto' })
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([{ lat: 40.5, lon: -74.5 }])
  })

  it('scores columns when no header (lon values outside lat range so columns separate)', () => {
    const m = [
      ['40.1', '-174.1'],
      ['40.2', '-174.2'],
    ]
    const r = parseGridPoints(m, { mode: 'auto' })
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([
      { lat: 40.1, lon: -174.1 },
      { lat: 40.2, lon: -174.2 },
    ])
    expect(r.diagnostics?.reason).toBe('scored')
  })

  it('detects DEC_LAT style headers via tokens', () => {
    const m = [
      ['id', 'DEC_LAT', 'DEC_LON'],
      ['1', '40.1', '-73.1'],
    ]
    const r = parseGridPoints(m, { mode: 'auto' })
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([{ lat: 40.1, lon: -73.1 }])
    expect(r.diagnostics?.reason).toBe('header')
  })
})

describe('spreadsheet column refs', () => {
  it('converts letters and parses user input', () => {
    expect(columnLettersTo1Based('A')).toBe(1)
    expect(columnLettersTo1Based('Z')).toBe(26)
    expect(columnLettersTo1Based('AA')).toBe(27)
    expect(column1BasedToLetters(1)).toBe('A')
    expect(column1BasedToLetters(27)).toBe('AA')
    expect(parseUserColumnRef1Based('B')).toEqual({ value: 2, usedLetters: true })
    expect(parseUserColumnRef1Based('3')).toEqual({ value: 3, usedLetters: false })
    expect(parseUserColumnRef1Based('$aa')).toEqual({ value: 27, usedLetters: true })
  })
})

describe('groupOverlappingImportRows', () => {
  it('groups same rounded coordinates', () => {
    const rows = [
      { lat: 40.123451, lon: -73.987651 },
      { lat: 40.123452, lon: -73.987652 },
      { lat: 41, lon: -74 },
    ]
    const g = groupOverlappingImportRows(rows, 5)
    expect(g.length).toBe(1)
    expect(g[0]!.indices).toEqual([0, 1])
  })
})

describe('parseGridPoints manual columns', () => {
  it('uses 1-based columns and header row default for data start', () => {
    const m = [
      ['x', 'y', 'z'],
      ['a', '40.5', '-74.5'],
    ]
    const r = parseGridPoints(m, { mode: 'columns', latCol: 2, lonCol: 3, headerRow: 1 })
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([{ lat: 40.5, lon: -74.5 }])
  })

  it('accepts high 1-based column indices (e.g. column AA = 27)', () => {
    const row: string[] = Array.from({ length: 28 }, () => '')
    row[26] = '40.5'
    row[27] = '-74.5'
    const m = [row]
    const r = parseGridPoints(m, { mode: 'columns', latCol: 27, lonCol: 28 })
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([{ lat: 40.5, lon: -74.5 }])
    expect(r.rows?.[0]?.sourceRow1Based).toBe(1)
  })

  it('respects explicit first data row', () => {
    const m = [
      ['Latitude', 'Longitude'],
      ['skip', 'skip'],
      ['40', '-74'],
    ]
    const r = parseGridPoints(m, {
      mode: 'columns',
      latCol: 1,
      lonCol: 2,
      headerRow: 1,
      dataStartRow: 3,
    })
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([{ lat: 40, lon: -74 }])
  })

  it('maps optional time column to visitedAt (UTC ms)', () => {
    const m = [
      ['lat', 'lon', 't'],
      ['40.1', '-73.1', '2024-06-01T12:00:00Z'],
    ]
    const r = parseGridPoints(m, { mode: 'columns', latCol: 1, lonCol: 2, timeCol: 3, headerRow: 1 }, 'UTC')
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([{ lat: 40.1, lon: -73.1, visitedAt: Date.parse('2024-06-01T12:00:00Z') }])
    expect(r.rows?.[0]?.visitedAtMs).toBe(Date.parse('2024-06-01T12:00:00Z'))
  })

  it('rejects invalid column indices', () => {
    const m = [['40', '-74']]
    const r = parseGridPoints(m, { mode: 'columns', latCol: 0, lonCol: 1 })
    expect(r.points).toEqual([])
    expect(r.errors[0]).toMatch(/1 or greater/)
  })

  it('errors when column index out of range', () => {
    const m = [['40', '-74']]
    const r = parseGridPoints(m, { mode: 'columns', latCol: 5, lonCol: 6 })
    expect(r.points).toEqual([])
    expect(r.errors.some((e) => e.includes('out of range'))).toBe(true)
  })
})

describe('parseGridPoints manual rows', () => {
  it('reads paired values along columns', () => {
    const m = [
      ['', 'p1', 'p2'],
      ['Latitude', '41', '42'],
      ['Longitude', '-71', '-72'],
    ]
    const r = parseGridPoints(m, { mode: 'rows', latRow: 2, lonRow: 3, dataStartCol: 2 })
    expect(r.errors).toEqual([])
    expect(r.points).toEqual([
      { lat: 41, lon: -71 },
      { lat: 42, lon: -72 },
    ])
  })

  it('errors when row index out of range', () => {
    const m = [['40', '-74']]
    const r = parseGridPoints(m, { mode: 'rows', latRow: 5, lonRow: 6, dataStartCol: 1 })
    expect(r.points).toEqual([])
    expect(r.errors.some((e) => e.includes('out of range'))).toBe(true)
  })
})

describe('textToMatrix', () => {
  it('parses simple CSV rows', () => {
    const m = textToMatrix('a,b\n40,-74')
    expect(m).toEqual([
      ['a', 'b'],
      ['40', '-74'],
    ])
  })
})
