import type { CSSProperties } from 'react'
import { Layout } from './Layout'
import {
  vcAuthMainCenterWrap,
  vcGlassFgDarkReadable,
  vcGlassFgSecondaryOnContent,
  vcLiquidGlassInnerSurface,
} from '../lib/vcLiquidGlass'

const card: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  boxSizing: 'border-box',
  ...vcLiquidGlassInnerSurface,
  borderRadius: 16,
  padding: '28px 24px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  color: vcGlassFgDarkReadable,
}

/**
 * Same chrome as {@link LoginPage}: fills the viewport below the header, centers a glass card,
 * shows a spinner — used for session bootstrap and lazy routes on all targets (desktop web, mobile, native).
 */
export function VcSessionLoadingShell(props: {
  message: string
  /** Shown under the app title in the header (optional). */
  subtitle?: string
}) {
  return (
    <Layout mainScroll="hidden" title="Camera Canvass" subtitle={props.subtitle}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ ...vcAuthMainCenterWrap, minHeight: 'min(100%, calc(100dvh - var(--vc-login-main-offset)))' }}>
          <div style={card} role="status" aria-live="polite" aria-busy="true">
            <div className="vc-app-bootstrap-spinner" aria-hidden />
            <div style={{ fontSize: 15, fontWeight: 700, textAlign: 'center', lineHeight: 1.35 }}>{props.message}</div>
            <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', color: vcGlassFgSecondaryOnContent }}>
              This may take a few seconds on first launch.
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
