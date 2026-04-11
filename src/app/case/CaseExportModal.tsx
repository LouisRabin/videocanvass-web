import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { CanvassStatus } from '../../lib/types'
import type { CaseExportSelections } from '../../lib/caseExportOptions'
import {
  EXPORT_ADDRESS_STATUS_ORDER,
  validateCaseExportSelections,
} from '../../lib/caseExportOptions'
import { Modal } from '../Modal'

type CaseExportPdfPathChoice = {
  trackId: string
  /** User-defined path name. */
  label: string
}

type CaseExportAddressStatusOption = {
  status: CanvassStatus
  label: string
}

const chkLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 14,
  cursor: 'pointer',
  color: '#0f172a',
}

const nestedChk: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  cursor: 'pointer',
  color: '#0f172a',
  marginLeft: 26,
}

const toolbarBtn: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '6px 12px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
}

const tabBtn = (active: boolean): CSSProperties => ({
  border: 'none',
  borderBottom: active ? '2px solid #1d4ed8' : '2px solid transparent',
  marginBottom: -1,
  background: 'transparent',
  padding: '10px 14px',
  fontWeight: 800,
  fontSize: 14,
  color: active ? '#1d4ed8' : '#64748b',
  cursor: 'pointer',
  borderRadius: '8px 8px 0 0',
})

export function CaseExportModal(props: {
  open: boolean
  onClose: () => void
  busy: boolean
  /** Tracks that have at least one visible map point (sorted by label). */
  pdfPathChoices: CaseExportPdfPathChoice[]
  /** Result types for PDF addresses table and PDF Fit canvass map only. */
  addressStatusOptions: CaseExportAddressStatusOption[]
  onExport: (selections: CaseExportSelections) => void | Promise<void>
}) {
  const [tab, setTab] = useState<'pdf' | 'csv'>('pdf')
  const [s, setS] = useState<CaseExportSelections>(() => ({
    csvAddresses: true,
    csvTracks: false,
    pdf: false,
    pdfSummary: true,
    pdfAddressesTable: true,
    pdfTracksTable: true,
    pdfMapFull: true,
    pdfMapAddresses: false,
    pdfMapTracks: false,
    pdfMapPathTrackIds: [],
    exportAddressStatuses: [...EXPORT_ADDRESS_STATUS_ORDER],
  }))
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (props.open) setTab('pdf')
  }, [props.open])

  const toggle = useCallback(
    (key: keyof CaseExportSelections) => {
      setS((prev) => {
        if (key === 'pdfMapTracks') {
          const on = !prev.pdfMapTracks
          return {
            ...prev,
            pdfMapTracks: on,
            ...(on
              ? { pdfMapPathTrackIds: props.pdfPathChoices.map((c) => c.trackId) }
              : { pdfMapPathTrackIds: [] }),
          }
        }
        if (key === 'pdfAddressesTable' || key === 'pdfMapAddresses') {
          const on = !prev[key]
          const fillStatuses =
            on && prev.exportAddressStatuses.length === 0 ? [...EXPORT_ADDRESS_STATUS_ORDER] : prev.exportAddressStatuses
          return { ...prev, [key]: on, exportAddressStatuses: fillStatuses }
        }
        return { ...prev, [key]: !prev[key] }
      })
      setLocalError(null)
    },
    [props.pdfPathChoices],
  )

  const togglePdfPathTrack = useCallback(
    (trackId: string) => {
      setS((prev) => {
        const selected = new Set(prev.pdfMapPathTrackIds)
        if (selected.has(trackId)) selected.delete(trackId)
        else selected.add(trackId)
        const ordered = props.pdfPathChoices.filter((c) => selected.has(c.trackId)).map((c) => c.trackId)
        return { ...prev, pdfMapPathTrackIds: ordered }
      })
      setLocalError(null)
    },
    [props.pdfPathChoices],
  )

  const toggleExportAddressStatus = useCallback(
    (status: CanvassStatus) => {
      setS((prev) => {
        const selected = new Set(prev.exportAddressStatuses)
        if (selected.has(status)) selected.delete(status)
        else selected.add(status)
        const ordered = props.addressStatusOptions.filter((o) => selected.has(o.status)).map((o) => o.status)
        return { ...prev, exportAddressStatuses: ordered }
      })
      setLocalError(null)
    },
    [props.addressStatusOptions],
  )

  const selectAllPdf = useCallback(() => {
    setS((prev) => ({
      ...prev,
      pdf: true,
      pdfSummary: true,
      pdfAddressesTable: true,
      pdfTracksTable: true,
      pdfMapFull: true,
      pdfMapAddresses: true,
      pdfMapTracks: true,
      pdfMapPathTrackIds: props.pdfPathChoices.map((c) => c.trackId),
      exportAddressStatuses:
        prev.exportAddressStatuses.length > 0 ? [...prev.exportAddressStatuses] : [...EXPORT_ADDRESS_STATUS_ORDER],
    }))
    setLocalError(null)
  }, [props.pdfPathChoices])

  const clearPdf = useCallback(() => {
    setS((prev) => ({
      ...prev,
      pdf: false,
      pdfSummary: false,
      pdfAddressesTable: false,
      pdfTracksTable: false,
      pdfMapFull: false,
      pdfMapAddresses: false,
      pdfMapTracks: false,
      pdfMapPathTrackIds: [],
      exportAddressStatuses: [...EXPORT_ADDRESS_STATUS_ORDER],
    }))
    setLocalError(null)
  }, [])

  const selectAllCsv = useCallback(() => {
    setS((prev) => ({ ...prev, csvAddresses: true, csvTracks: true }))
    setLocalError(null)
  }, [])

  const clearCsv = useCallback(() => {
    setS((prev) => ({ ...prev, csvAddresses: false, csvTracks: false }))
    setLocalError(null)
  }, [])

  const onExportClick = useCallback(() => {
    const effectiveSel: CaseExportSelections =
      tab === 'pdf'
        ? { ...s, csvAddresses: false, csvTracks: false }
        : {
            ...s,
            pdf: false,
            pdfSummary: false,
            pdfAddressesTable: false,
            pdfTracksTable: false,
            pdfMapFull: false,
            pdfMapAddresses: false,
            pdfMapTracks: false,
            pdfMapPathTrackIds: [],
          }
    const err = validateCaseExportSelections(effectiveSel, { pdfPathChoiceCount: props.pdfPathChoices.length })
    if (err) {
      setLocalError(err)
      return
    }
    setLocalError(null)
    void props.onExport(effectiveSel)
  }, [props, s, tab])

  const renderPdfCanvassResultSubbranch = () => (
    <div style={{ marginLeft: 26, display: 'grid', gap: 4, marginTop: 2, marginBottom: 4 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        Canvass results
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          columnGap: 14,
          rowGap: 6,
        }}
      >
        {props.addressStatusOptions.map((o) => (
          <label key={o.status} style={{ ...nestedChk, marginLeft: 0 }}>
            <input
              type="checkbox"
              checked={s.exportAddressStatuses.includes(o.status)}
              disabled={props.busy}
              onChange={() => toggleExportAddressStatus(o.status)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  )

  const tabToolbar = (kind: 'pdf' | 'csv') => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      <button
        type="button"
        disabled={props.busy}
        onClick={kind === 'pdf' ? selectAllPdf : selectAllCsv}
        style={{ ...toolbarBtn, background: '#f8fafc', cursor: props.busy ? 'not-allowed' : 'pointer' }}
      >
        Select all
      </button>
      <button
        type="button"
        disabled={props.busy}
        onClick={kind === 'pdf' ? clearPdf : clearCsv}
        style={{ ...toolbarBtn, background: '#fff', cursor: props.busy ? 'not-allowed' : 'pointer' }}
      >
        Clear
      </button>
    </div>
  )

  return (
    <Modal title="Export Case" open={props.open} onClose={props.onClose} wide zBase={61000}>
      <div
        role="tablist"
        aria-label="Export format"
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 16,
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pdf'}
          disabled={props.busy}
          onClick={() => setTab('pdf')}
          style={tabBtn(tab === 'pdf')}
        >
          PDF
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'csv'}
          disabled={props.busy}
          onClick={() => setTab('csv')}
          style={tabBtn(tab === 'csv')}
        >
          CSV (Excel)
        </button>
      </div>

      {tab === 'pdf' ? (
        <div>
          {tabToolbar('pdf')}
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={chkLabel}>
              <input type="checkbox" checked={s.pdf} disabled={props.busy} onChange={() => toggle('pdf')} />
              Include PDF report
            </label>
            {s.pdf ? (
              <div style={{ marginLeft: 22, display: 'grid', gap: 6, marginTop: 6 }}>
                <label style={chkLabel}>
                  <input type="checkbox" checked={s.pdfSummary} disabled={props.busy} onChange={() => toggle('pdfSummary')} />
                  Case summary (title, number, description)
                </label>
                <div>
                  <label style={chkLabel}>
                    <input
                      type="checkbox"
                      checked={s.pdfAddressesTable}
                      disabled={props.busy}
                      onChange={() => toggle('pdfAddressesTable')}
                    />
                    Addresses table (results + notes)
                  </label>
                  {s.pdf && s.pdfAddressesTable ? renderPdfCanvassResultSubbranch() : null}
                </div>
                <label style={chkLabel}>
                  <input
                    type="checkbox"
                    checked={s.pdfTracksTable}
                    disabled={props.busy}
                    onChange={() => toggle('pdfTracksTable')}
                  />
                  Tracking table (coordinates + notes)
                </label>
                <label style={chkLabel}>
                  <input type="checkbox" checked={s.pdfMapFull} disabled={props.busy} onChange={() => toggle('pdfMapFull')} />
                  Map — Fit all (same zoom as toolbar)
                </label>
                <div>
                  <label style={chkLabel}>
                    <input
                      type="checkbox"
                      checked={s.pdfMapAddresses}
                      disabled={props.busy}
                      onChange={() => toggle('pdfMapAddresses')}
                    />
                    Map — Fit canvass
                  </label>
                  {s.pdf && s.pdfMapAddresses ? renderPdfCanvassResultSubbranch() : null}
                </div>
                <div>
                  <label style={chkLabel}>
                    <input
                      type="checkbox"
                      checked={s.pdfMapTracks}
                      disabled={props.busy}
                      onChange={() => toggle('pdfMapTracks')}
                    />
                    Map — Fit paths
                  </label>
                  {s.pdfMapTracks && props.pdfPathChoices.length > 0 ? (
                    <div style={{ marginLeft: 26, marginTop: 2, marginBottom: 4 }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                          columnGap: 14,
                          rowGap: 6,
                        }}
                      >
                        {props.pdfPathChoices.map((c) => (
                          <label key={c.trackId} style={{ ...nestedChk, marginLeft: 0 }}>
                            <input
                              type="checkbox"
                              checked={s.pdfMapPathTrackIds.includes(c.trackId)}
                              disabled={props.busy}
                              onChange={() => togglePdfPathTrack(c.trackId)}
                            />
                            {c.label.trim() || 'Untitled path'}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div>
          {tabToolbar('csv')}
          <div style={{ display: 'grid', gap: 6 }}>
            <label style={chkLabel}>
              <input type="checkbox" checked={s.csvAddresses} disabled={props.busy} onChange={() => toggle('csvAddresses')} />
              Addresses (canvass list)
            </label>
            <label style={chkLabel}>
              <input type="checkbox" checked={s.csvTracks} disabled={props.busy} onChange={() => toggle('csvTracks')} />
              Tracking (all track points)
            </label>
            {s.csvAddresses && s.csvTracks ? (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>
                With both checked, one Excel file (<code style={{ fontSize: 11 }}>.xlsx</code>) is downloaded with{' '}
                <strong>Addresses</strong> and <strong>Tracking</strong> sheets.
              </p>
            ) : null}
          </div>
        </div>
      )}

      {localError ? (
        <p style={{ margin: '12px 0 0', color: '#b45309', fontSize: 13, fontWeight: 600 }}>{localError}</p>
      ) : null}

      <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={props.busy}
          onClick={props.onClose}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            padding: '10px 16px',
            background: '#fff',
            fontWeight: 700,
            cursor: props.busy ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={props.busy}
          onClick={onExportClick}
          style={{
            border: 'none',
            borderRadius: 10,
            padding: '10px 18px',
            background: props.busy ? '#94a3b8' : '#1d4ed8',
            color: '#fff',
            fontWeight: 800,
            cursor: props.busy ? 'not-allowed' : 'pointer',
          }}
        >
          {props.busy ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </Modal>
  )
}
