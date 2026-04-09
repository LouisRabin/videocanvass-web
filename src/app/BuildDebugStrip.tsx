import type { ReactNode } from 'react'
import { vcBuildDebugSummary, vcDebugEnabled } from '../lib/buildDebug'

/** Fixed footer when `VITE_VC_DEBUG=true` (set at build time on Vercel preview, etc.). */
export function BuildDebugStrip(): ReactNode {
  if (!vcDebugEnabled()) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        fontSize: 11,
        fontFamily: 'ui-monospace, monospace',
        padding: '4px 8px',
        background: 'rgba(15,23,42,0.92)',
        color: '#e2e8f0',
        borderTop: '1px solid #334155',
        pointerEvents: 'none',
      }}
    >
      VC_DEBUG {vcBuildDebugSummary()}
    </div>
  )
}
