import { relationalBackendEnabled } from '../../lib/backendMode'
import { useSyncStatus } from '../../lib/syncStatus'

/**
 * Case workspace: readable sync line (Layout header still has the compact dot + global banners).
 */
export function CaseInlineSyncBar() {
  const sync = useSyncStatus()
  const relational = relationalBackendEnabled()

  const dot =
    sync.mode === 'supabase_ok' ? '#16a34a' : sync.mode === 'local_fallback' ? '#d97706' : '#6b7280'

  const pending =
    relational && sync.pendingRemoteSaves > 0 ? (
      <span style={{ fontWeight: 800, color: '#1d4ed8' }}>
        {' '}
        · Saving {sync.pendingRemoteSaves}…
      </span>
    ) : null

  return (
    <div
      role="status"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 10,
        background: 'rgba(241, 245, 249, 0.95)',
        border: '1px solid #e2e8f0',
        fontSize: 12,
        color: '#334155',
        minWidth: 0,
      }}
      title={sync.message}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: dot,
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {sync.mode === 'supabase_ok'
          ? 'Cloud sync OK'
          : sync.mode === 'local_fallback'
            ? 'Working locally'
            : 'Checking sync…'}
        {pending}
        <span style={{ fontWeight: 500, color: '#64748b' }}> — {sync.message}</span>
      </span>
    </div>
  )
}
