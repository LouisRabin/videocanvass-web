import type { CanvassStatus } from '../../lib/types'
import { statusColor, statusLabel } from '../../lib/types'
import { Modal } from '../Modal'
import { btn } from './CasePageChrome'

const STATUS_ORDER = ['noCameras', 'camerasNoAnswer', 'notProbativeFootage', 'probativeFootage'] as const satisfies readonly CanvassStatus[]

export function CanvassMapResultModal(props: {
  open: boolean
  title?: string
  addressLine: string
  /** Extra “N more queued” when multiple map taps are pending. */
  queuedExtraCount: number
  addressResolving?: boolean
  saving: boolean
  onClose: () => void
  onPickStatus: (status: CanvassStatus) => void
}) {
  const {
    open,
    title = 'Record result',
    addressLine,
    queuedExtraCount,
    addressResolving,
    saving,
    onClose,
    onPickStatus,
  } = props

  return (
    <Modal title={title} open={open} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>
          Selected address
          {queuedExtraCount > 0 ? (
            <span style={{ fontWeight: 600, color: '#6b7280' }}> · {queuedExtraCount} more queued</span>
          ) : null}
        </div>
        <div style={{ fontWeight: 900, lineHeight: 1.2 }}>{addressLine}</div>
        {addressResolving ? (
          <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600 }}>Looking up street address…</div>
        ) : null}
        <div style={{ color: '#374151', fontSize: 12, fontWeight: 800 }}>What was the result of canvassing this address?</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPickStatus(s)}
              disabled={saving}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 999,
                padding: '8px 10px',
                cursor: saving ? 'default' : 'pointer',
                fontWeight: 900,
                fontSize: 12,
                borderColor: statusColor(s),
                background: saving ? 'rgba(241, 245, 249, 0.92)' : `${statusColor(s)}22`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: statusColor(s),
                  display: 'inline-block',
                }}
              />
              {statusLabel(s)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" style={btn} onClick={onClose} disabled={saving} title={saving ? 'Saving…' : 'Close'}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
