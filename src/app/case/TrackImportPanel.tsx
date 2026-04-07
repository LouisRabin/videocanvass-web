import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Track } from '../../lib/types'
import { btn, btnPrimary, field, label } from './CasePageChrome'
import { getMobileOS, nativeMobileTextareaProps } from '../../lib/mobilePlatform'
import {
  column1BasedToLetters,
  excelBufferToMatrix,
  groupOverlappingImportRows,
  parseGridPoints,
  parseLatLonPasteText,
  parseUserColumnRef1Based,
  textToMatrix,
  type GridParseOpts,
  type LatLonImportRow,
  type LatLonPoint,
} from '../../lib/trackLatLonImport'
import {
  formatInstantInTimeZone,
  getBrowserIanaTimeZone,
  isValidIanaTimeZone,
  listIanaTimeZones,
} from '../../lib/trackTimeDisplay'

export const TRACK_IMPORT_NEW_TRACK_VALUE = '__vc_import_new_track__'

const PREVIEW_ERROR_CAP = 50
const PREVIEW_WARNING_CAP = 50

function formatImportRowRef(r: LatLonImportRow, stepIndex1Based: number): string {
  if (r.sourceRow1Based != null) return `row ${r.sourceRow1Based}`
  if (r.sourceCol1Based != null) return `col ${column1BasedToLetters(r.sourceCol1Based)}`
  if (r.pasteLine1Based != null) return `line ${r.pasteLine1Based}`
  return `point ${stepIndex1Based}`
}

function parseOptionalPositiveInt(s: string): number | undefined {
  const t = s.trim()
  if (!t) return undefined
  const n = parseInt(t, 10)
  if (!Number.isFinite(n) || n < 1) return undefined
  return n
}

function buildGridOpts(
  orientation: 'columns' | 'rows',
  latColStr: string,
  lonColStr: string,
  timeColStr: string,
  headerRowStr: string,
  dataStartRowStr: string,
  latRowStr: string,
  lonRowStr: string,
  dataStartColStr: string,
): { opts: GridParseOpts; setupError: string | null } {
  if (orientation === 'rows') {
    const latRow = parseOptionalPositiveInt(latRowStr)
    const lonRow = parseOptionalPositiveInt(lonRowStr)
    if (latRow != null && lonRow != null) {
      const dscRef = parseUserColumnRef1Based(dataStartColStr.trim() || '1')
      if (!dscRef) {
        return {
          opts: { mode: 'auto' },
          setupError: 'First data column must be a positive number or letters (e.g. A or 1).',
        }
      }
      return {
        opts: { mode: 'rows', latRow, lonRow, dataStartCol: dscRef.value },
        setupError: null,
      }
    }
    if (latRowStr.trim() === '' && lonRowStr.trim() === '') {
      return { opts: { mode: 'auto' }, setupError: null }
    }
    return {
      opts: { mode: 'auto' },
      setupError:
        'Enter both latitude row and longitude row (1-based), or switch to “Lat / lon in columns” for auto-detect.',
    }
  }

  const latColRef = parseUserColumnRef1Based(latColStr)
  const lonColRef = parseUserColumnRef1Based(lonColStr)
  const timeColRef = timeColStr.trim() ? parseUserColumnRef1Based(timeColStr) : null
  const headerRow = parseOptionalPositiveInt(headerRowStr)
  const dataStartRow = parseOptionalPositiveInt(dataStartRowStr)

  if (latColRef != null && lonColRef != null) {
    if (timeColStr.trim() && !timeColRef) {
      return {
        opts: { mode: 'auto' },
        setupError:
          'Time column must be a positive number or letters (e.g. D or 4), or leave blank for lat/lon only.',
      }
    }
    return {
      opts: {
        mode: 'columns',
        latCol: latColRef.value,
        lonCol: lonColRef.value,
        ...(timeColRef ? { timeCol: timeColRef.value } : {}),
        ...(headerRow != null ? { headerRow } : {}),
        ...(dataStartRow != null ? { dataStartRow } : {}),
      },
      setupError: null,
    }
  }
  if ([latColStr, lonColStr, timeColStr, headerRowStr, dataStartRowStr].some((x) => x.trim() !== '')) {
    return {
      opts: { mode: 'auto' },
      setupError:
        'Enter both latitude and longitude columns (1-based number or letters like A, B, AA), or clear manual fields for auto-detect.',
    }
  }
  return { opts: { mode: 'auto' }, setupError: null }
}

export type TrackImportPanelProps = {
  caseTracks: Track[]
  /** Default selected track id for import target */
  trackForMapAdd: string | null
  canImport: boolean
  isNarrow: boolean
  onCreateTrack: (label: string) => Promise<string | null>
  onImportPoints: (trackId: string, points: LatLonPoint[]) => Promise<void>
  /** Light panel styling for `Modal` (map dock glass uses dark-on-blue when false and wide). */
  modalChrome?: boolean
  /** Optional Done (e.g. close modal without importing). */
  onClose?: () => void
}

export function TrackImportPanel(props: TrackImportPanelProps) {
  const mobileOS = getMobileOS()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pasteText, setPasteText] = useState('')
  const [fileMatrix, setFileMatrix] = useState<string[][] | null>(null)
  const [fileLabel, setFileLabel] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [layoutOrientation, setLayoutOrientation] = useState<'columns' | 'rows'>('columns')
  const [latColStr, setLatColStr] = useState('')
  const [lonColStr, setLonColStr] = useState('')
  const [headerRowStr, setHeaderRowStr] = useState('')
  const [dataStartRowStr, setDataStartRowStr] = useState('')
  const [latRowStr, setLatRowStr] = useState('')
  const [lonRowStr, setLonRowStr] = useState('')
  const [dataStartColStr, setDataStartColStr] = useState('1')
  const [timeColStr, setTimeColStr] = useState('')
  const [importTimeZoneInput, setImportTimeZoneInput] = useState(() => getBrowserIanaTimeZone())
  const ianaZoneList = useMemo(() => listIanaTimeZones().slice().sort((a, b) => a.localeCompare(b)), [])
  const effectiveImportTz = isValidIanaTimeZone(importTimeZoneInput) ? importTimeZoneInput.trim() : 'UTC'
  const [targetTrackId, setTargetTrackId] = useState<string>(() => {
    const tracks = props.caseTracks
    if (!tracks.length) return TRACK_IMPORT_NEW_TRACK_VALUE
    const id = props.trackForMapAdd
    if (id && tracks.some((t) => t.id === id)) return id
    return tracks[0]!.id
  })
  const [importing, setImporting] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [expandedOverlapKey, setExpandedOverlapKey] = useState<string | null>(null)

  useEffect(() => {
    const tracks = props.caseTracks
    if (!tracks.length) {
      setTargetTrackId(TRACK_IMPORT_NEW_TRACK_VALUE)
      return
    }
    setTargetTrackId((cur) => {
      if (cur === TRACK_IMPORT_NEW_TRACK_VALUE) return cur
      if (tracks.some((t) => t.id === cur)) return cur
      const pref = props.trackForMapAdd
      if (pref && tracks.some((t) => t.id === pref)) return pref
      return tracks[0]!.id
    })
  }, [props.caseTracks, props.trackForMapAdd])

  const { opts: gridOpts, setupError } = useMemo(
    () =>
      buildGridOpts(
        layoutOrientation,
        latColStr,
        lonColStr,
        timeColStr,
        headerRowStr,
        dataStartRowStr,
        latRowStr,
        lonRowStr,
        dataStartColStr,
      ),
    [
      layoutOrientation,
      latColStr,
      lonColStr,
      timeColStr,
      headerRowStr,
      dataStartRowStr,
      latRowStr,
      lonRowStr,
      dataStartColStr,
    ],
  )

  const pasteResult = useMemo(() => parseLatLonPasteText(pasteText), [pasteText])

  const gridResult = useMemo(() => {
    if (!fileMatrix?.length) {
      return { points: [] as LatLonPoint[], warnings: [] as string[], errors: [] as string[] }
    }
    if (setupError) {
      return { points: [] as LatLonPoint[], warnings: [] as string[], errors: [setupError] }
    }
    return parseGridPoints(fileMatrix, gridOpts, effectiveImportTz)
  }, [fileMatrix, gridOpts, setupError, effectiveImportTz])

  const usePaste = pasteText.trim().length > 0
  const activeResult = usePaste ? pasteResult : gridResult
  const previewPoints = activeResult.points
  const previewSlice = previewPoints.slice(0, 5)

  const importRowsForOverlap: LatLonImportRow[] = useMemo(() => {
    if (activeResult.rows?.length === previewPoints.length) return activeResult.rows
    return previewPoints.map((p) => ({ lat: p.lat, lon: p.lon }))
  }, [activeResult.rows, previewPoints])

  const overlapGroups = useMemo(
    () => groupOverlappingImportRows(importRowsForOverlap, 5),
    [importRowsForOverlap],
  )

  const overlapParticipantCount = useMemo(() => {
    const s = new Set<number>()
    for (const g of overlapGroups) for (const i of g.indices) s.add(i)
    return s.size
  }, [overlapGroups])

  const latColResolved = useMemo(() => parseUserColumnRef1Based(latColStr), [latColStr])
  const lonColResolved = useMemo(() => parseUserColumnRef1Based(lonColStr), [lonColStr])

  const cappedErrors = useMemo(() => {
    const e = activeResult.errors
    if (e.length <= PREVIEW_ERROR_CAP) return { list: e, overflow: 0 }
    return { list: e.slice(0, PREVIEW_ERROR_CAP), overflow: e.length - PREVIEW_ERROR_CAP }
  }, [activeResult.errors])

  const cappedWarnings = useMemo(() => {
    const w = activeResult.warnings
    if (w.length <= PREVIEW_WARNING_CAP) return { list: w, overflow: 0 }
    return { list: w.slice(0, PREVIEW_WARNING_CAP), overflow: w.length - PREVIEW_WARNING_CAP }
  }, [activeResult.warnings])

  const glassMap = !props.modalChrome && !props.isNarrow

  const muted: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: glassMap ? '#94a3b8' : '#6b7280',
    lineHeight: 1.35,
  }

  const segBtn = (active: boolean): CSSProperties =>
    glassMap
      ? {
          ...btn,
          flex: 1,
          minWidth: 0,
          fontSize: 11,
          padding: '6px 8px',
          borderColor: active ? 'rgba(255,255,255,0.45)' : 'rgba(148, 163, 184, 0.45)',
          background: active ? 'rgba(30, 41, 59, 0.55)' : 'transparent',
          color: active ? '#f8fafc' : '#cbd5e1',
        }
      : {
          ...btn,
          flex: 1,
          minWidth: 0,
          fontSize: 11,
          padding: '6px 8px',
          borderColor: active ? '#111827' : 'rgba(148, 163, 184, 0.55)',
          background: active ? 'rgba(15, 23, 42, 0.08)' : 'transparent',
          color: '#111827',
        }

  const onPickFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    setFileError(null)
    setFileMatrix(null)
    setFileLabel(null)
    if (!f) return
    const name = f.name.toLowerCase()
    try {
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = await f.arrayBuffer()
        const matrix = await excelBufferToMatrix(buf)
        if (!matrix?.length) {
          setFileError('Could not read spreadsheet (empty?).')
          return
        }
        setFileMatrix(matrix)
        setFileLabel(f.name)
        return
      }
      const text = await f.text()
      const matrix = textToMatrix(text)
      if (!matrix.length) {
        setFileError('No rows found in file.')
        return
      }
      setFileMatrix(matrix)
      setFileLabel(f.name)
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to read file.')
    }
  }, [])

  const onImport = useCallback(async () => {
    if (!props.canImport || importing) return
    const points = activeResult.points
    if (!points.length) return

    setImporting(true)
    setStatusMsg(null)
    try {
      let trackId = targetTrackId
      if (trackId === TRACK_IMPORT_NEW_TRACK_VALUE || !trackId) {
        const suggested = `Track ${props.caseTracks.length + 1}`
        const label = window.prompt('Name for the new track', suggested)?.trim()
        if (!label) {
          setImporting(false)
          return
        }
        const id = await props.onCreateTrack(label)
        if (!id) {
          setStatusMsg('Could not create track.')
          setImporting(false)
          return
        }
        trackId = id
        setTargetTrackId(id)
      }

      await props.onImportPoints(trackId, points)
      setStatusMsg(`Imported ${points.length} point${points.length === 1 ? '' : 's'}.`)
      setPasteText('')
      setFileMatrix(null)
      setFileLabel(null)
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }, [props, activeResult.points, targetTrackId, importing])

  const importDisabled =
    !props.canImport ||
    importing ||
    previewPoints.length === 0 ||
    (!usePaste && !fileMatrix?.length && pasteText.trim() === '')

  const smallField: CSSProperties = {
    ...field,
    padding: '6px 8px',
    fontSize: 13,
    width: '100%',
    minWidth: 0,
  }

  const labelColor = glassMap ? '#e2e8f0' : '#374151'

  return (
    <div style={{ display: 'grid', gap: 10, width: '100%', minWidth: 0 }}>
      <div>
        <div style={{ ...label, color: labelColor }}>Attach imported points to path</div>
        <select
          value={targetTrackId}
          onChange={(e) => setTargetTrackId(e.target.value)}
          disabled={!props.canImport}
          style={{
            ...field,
            fontSize: 13,
            padding: '8px 10px',
            cursor: props.canImport ? 'pointer' : 'not-allowed',
            color: '#111827',
            background: glassMap ? 'rgba(248,250,252,0.95)' : '#fff',
          }}
        >
          {props.caseTracks.length === 0 ? (
            <option value={TRACK_IMPORT_NEW_TRACK_VALUE}>+ New track…</option>
          ) : (
            <>
              {props.caseTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label || 'Track'}
                </option>
              ))}
              <option value={TRACK_IMPORT_NEW_TRACK_VALUE}>+ New track…</option>
            </>
          )}
        </select>
      </div>

      <div>
        <div style={{ ...label, color: labelColor }}>Spreadsheet file</div>
        <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" style={{ display: 'none' }} onChange={onPickFile} />
        <button
          type="button"
          style={{ ...btn, width: '100%', boxSizing: 'border-box', fontSize: 12 }}
          disabled={!props.canImport}
          onClick={() => fileInputRef.current?.click()}
        >
          {fileLabel ? `Loaded: ${fileLabel}` : 'Choose CSV or Excel…'}
        </button>
        {fileError ? <div style={{ ...muted, color: '#b91c1c', marginTop: 4 }}>{fileError}</div> : null}
        <div style={{ ...muted, marginTop: 4 }}>Excel: first sheet only. Pair lat/lon columns or set manual layout below.</div>
      </div>

      <div>
        <div style={{ ...label, color: labelColor }}>Paste coordinates</div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          disabled={!props.canImport}
          placeholder={'One pair per line, e.g.\n40.7128, -74.0060\n40.7589 -73.9851'}
          rows={4}
          {...(props.isNarrow ? nativeMobileTextareaProps(mobileOS) : { autoCorrect: 'off' as const, spellCheck: true })}
          style={{
            ...field,
            fontSize: props.isNarrow ? 16 : 14,
            minHeight: 88,
            resize: 'vertical',
            lineHeight: 1.35,
          }}
        />
        <div style={{ ...muted, marginTop: 4 }}>If this box has text, paste is used instead of the file.</div>
      </div>

      {!usePaste ? (
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              style={segBtn(layoutOrientation === 'columns')}
              onClick={() => setLayoutOrientation('columns')}
            >
              Lat / lon in columns
            </button>
            <button type="button" style={segBtn(layoutOrientation === 'rows')} onClick={() => setLayoutOrientation('rows')}>
              Lat / lon in rows
            </button>
          </div>

          {layoutOrientation === 'columns' ? (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', minWidth: 0 }}>
              <div>
                <div style={muted}>Latitude column (number or A, B, AA…)</div>
                <input
                  value={latColStr}
                  onChange={(e) => setLatColStr(e.target.value)}
                  placeholder="auto"
                  style={smallField}
                  autoCapitalize="characters"
                />
                {latColResolved?.usedLetters ? (
                  <div style={{ ...muted, marginTop: 2 }}>→ column {latColResolved.value}</div>
                ) : null}
              </div>
              <div>
                <div style={muted}>Longitude column</div>
                <input
                  value={lonColStr}
                  onChange={(e) => setLonColStr(e.target.value)}
                  placeholder="auto"
                  style={smallField}
                  autoCapitalize="characters"
                />
                {lonColResolved?.usedLetters ? (
                  <div style={{ ...muted, marginTop: 2 }}>→ column {lonColResolved.value}</div>
                ) : null}
              </div>
              <div>
                <div style={muted}>Header row (optional)</div>
                <input
                  value={headerRowStr}
                  onChange={(e) => setHeaderRowStr(e.target.value)}
                  inputMode="numeric"
                  placeholder="—"
                  style={smallField}
                />
              </div>
              <div>
                <div style={muted}>First data row (optional)</div>
                <input
                  value={dataStartRowStr}
                  onChange={(e) => setDataStartRowStr(e.target.value)}
                  inputMode="numeric"
                  placeholder="auto"
                  style={smallField}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={muted}>Time column (optional; ISO, Excel serial, or date string)</div>
                <input
                  value={timeColStr}
                  onChange={(e) => setTimeColStr(e.target.value)}
                  placeholder="auto when header names a time column"
                  style={smallField}
                  autoCapitalize="characters"
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={muted}>Interpret ambiguous dates in zone</div>
                <input
                  list="vc-import-tz-datalist"
                  value={importTimeZoneInput}
                  onChange={(e) => setImportTimeZoneInput(e.target.value)}
                  onBlur={() => {
                    if (!isValidIanaTimeZone(importTimeZoneInput)) setImportTimeZoneInput(getBrowserIanaTimeZone())
                  }}
                  style={smallField}
                  autoCorrect="off"
                  spellCheck={false}
                />
                <datalist id="vc-import-tz-datalist">
                  {ianaZoneList.map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
                {!isValidIanaTimeZone(importTimeZoneInput) ? (
                  <div style={{ ...muted, color: '#b91c1c', marginTop: 2 }}>Invalid zone; using UTC until fixed.</div>
                ) : (
                  <div style={{ ...muted, marginTop: 2 }}>Using {effectiveImportTz} for loose date strings.</div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', minWidth: 0 }}>
              <div>
                <div style={muted}>Latitude row</div>
                <input
                  value={latRowStr}
                  onChange={(e) => setLatRowStr(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 2"
                  style={smallField}
                />
              </div>
              <div>
                <div style={muted}>Longitude row</div>
                <input
                  value={lonRowStr}
                  onChange={(e) => setLonRowStr(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 3"
                  style={smallField}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={muted}>First data column (1 or A; default 1)</div>
                <input
                  value={dataStartColStr}
                  onChange={(e) => setDataStartColStr(e.target.value)}
                  placeholder="1"
                  style={smallField}
                  autoCapitalize="characters"
                />
              </div>
            </div>
          )}
        </>
      ) : null}

      <div
        style={{
          borderRadius: 10,
          padding: 8,
          background: glassMap ? 'rgba(255,255,255,0.08)' : 'rgba(241,245,249,0.9)',
          border: glassMap ? '1px solid rgba(255,255,255,0.15)' : '1px solid #e2e8f0',
          minWidth: 0,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: glassMap ? '#f1f5f9' : '#111827', marginBottom: 6 }}>
          Preview: {previewPoints.length} point{previewPoints.length === 1 ? '' : 's'}
        </div>
        {previewSlice.length ? (
          <div style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: glassMap ? '#e2e8f0' : '#334155' }}>
            {previewSlice.map((p, i) => (
              <div key={i}>
                {p.lat.toFixed(5)}, {p.lon.toFixed(5)}
                {p.visitedAt != null && Number.isFinite(p.visitedAt)
                  ? ` · ${formatInstantInTimeZone(p.visitedAt, effectiveImportTz)}`
                  : ''}
              </div>
            ))}
            {previewPoints.length > 5 ? <div style={muted}>…</div> : null}
          </div>
        ) : (
          <div style={muted}>No valid coordinates yet.</div>
        )}
        {!usePaste && activeResult.diagnostics ? (
          <div style={{ ...muted, marginTop: 4, color: glassMap ? '#cbd5e1' : '#475569' }}>
            Columns {activeResult.diagnostics.latColLetters} (lat) and {activeResult.diagnostics.lonColLetters} (lon); first
            data row {activeResult.diagnostics.dataStartRow1Based}
            {activeResult.diagnostics.reason === 'header' && activeResult.diagnostics.headerRow1Based != null
              ? ` (header row ${activeResult.diagnostics.headerRow1Based})`
              : ''}
            .
          </div>
        ) : null}
        {overlapGroups.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: glassMap ? '#fbbf24' : '#b45309' }}>
              {overlapParticipantCount} point{overlapParticipantCount === 1 ? '' : 's'} in {overlapGroups.length} stacked
              location{overlapGroups.length === 1 ? '' : 's'} (same coords to 5 decimals)
            </div>
            {overlapGroups.map((g) => (
              <div key={g.key} style={{ marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setExpandedOverlapKey((k) => (k === g.key ? null : g.key))}
                  style={{
                    ...btn,
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: 11,
                    textAlign: 'left',
                    padding: '6px 8px',
                  }}
                >
                  {g.indices.length} at {g.approxLat.toFixed(5)}, {g.approxLon.toFixed(5)}{' '}
                  {expandedOverlapKey === g.key ? '▼' : '▶'}
                </button>
                {expandedOverlapKey === g.key ? (
                  <div
                    style={{
                      fontSize: 10,
                      fontFamily: 'ui-monospace, monospace',
                      marginTop: 4,
                      paddingLeft: 6,
                      color: glassMap ? '#e2e8f0' : '#334155',
                    }}
                  >
                    {g.indices.map((idx) => {
                      const r = importRowsForOverlap[idx]!
                      const step = idx + 1
                      return (
                        <div key={`${g.key}-${idx}`}>
                          Step {step}: {formatImportRowRef(r, step)}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {cappedWarnings.list.map((w, i) => (
          <div key={`w-${i}`} style={{ ...muted, marginTop: 4, color: '#ca8a04' }}>
            {w}
          </div>
        ))}
        {cappedWarnings.overflow > 0 ? (
          <div style={{ ...muted, marginTop: 4, color: '#ca8a04' }}>…and {cappedWarnings.overflow} more warnings.</div>
        ) : null}
        {cappedErrors.list.map((er, i) => (
          <div key={`e-${i}`} style={{ ...muted, marginTop: 4, color: '#b91c1c' }}>
            {er}
          </div>
        ))}
        {cappedErrors.overflow > 0 ? (
          <div style={{ ...muted, marginTop: 4, color: '#b91c1c' }}>…and {cappedErrors.overflow} more errors.</div>
        ) : null}
      </div>

      {statusMsg ? (
        <div style={{ fontSize: 12, fontWeight: 700, color: statusMsg.includes('fail') ? '#b91c1c' : '#15803d' }}>{statusMsg}</div>
      ) : null}

      <button
        type="button"
        style={{ ...btnPrimary, width: '100%', boxSizing: 'border-box', fontSize: 12, opacity: importDisabled ? 0.55 : 1 }}
        disabled={importDisabled}
        onClick={() => void onImport()}
      >
        {importing ? 'Importing…' : `Import ${previewPoints.length || '…'} point${previewPoints.length === 1 ? '' : 's'}`}
      </button>
      {props.onClose ? (
        <button type="button" style={{ ...btn, width: '100%', boxSizing: 'border-box', fontSize: 12 }} onClick={props.onClose}>
          Done
        </button>
      ) : null}
    </div>
  )
}
