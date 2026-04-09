import { btn } from './CasePageChrome'

export function UndoSnackbar(props: { message: string; onUndo: () => void; onDismiss: () => void }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        transform: 'translateX(-50%)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 'min(520px, calc(100% - 24px))',
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(17, 24, 39, 0.94)',
        color: '#f9fafb',
        boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      <span style={{ flex: '1 1 140px', minWidth: 0 }}>{props.message}</span>
      <button type="button" style={{ ...btn, background: '#e0e7ff', color: '#1e1b4b', fontWeight: 800 }} onClick={props.onUndo}>
        Undo
      </button>
      <button
        type="button"
        style={{ ...btn, background: 'transparent', color: '#cbd5e1', border: '1px solid #475569' }}
        onClick={props.onDismiss}
      >
        Dismiss
      </button>
    </div>
  )
}
