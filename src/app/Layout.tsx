import React from 'react'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { useSyncStatus } from '../lib/syncStatus'

export function Layout(props: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
  /** Tighter chrome padding (e.g. case map screen). */
  dense?: boolean
}) {
  const dense = props.dense === true
  const narrow = useMediaQuery(MOBILE_BREAKPOINT_QUERY)
  const headerPad = dense
    ? 'var(--vc-pad-header-dense-y) var(--vc-pad-header-dense-x)'
    : 'var(--vc-pad-header-y) var(--vc-pad-header-x)'
  const mainPad = dense
    ? 'var(--vc-pad-main-dense-y) var(--vc-pad-main-dense-x)'
    : 'var(--vc-pad-main-y) var(--vc-pad-main-x)'
  const sync = useSyncStatus()

  const syncLabel = sync.mode === 'supabase_ok' ? 'Sync: Supabase' : sync.mode === 'local_fallback' ? 'Sync: Local fallback' : 'Sync: checking'

  const syncDotColor =
    sync.mode === 'supabase_ok' ? '#16a34a' : sync.mode === 'local_fallback' ? '#d97706' : '#6b7280'

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 'min(1560px, 100%)',
            margin: '0 auto',
            padding: headerPad,
            display: 'flex',
            gap: narrow ? 'var(--vc-space-sm)' : dense ? 'var(--vc-space-md)' : 'var(--vc-space-lg)',
            alignItems: 'start',
            minWidth: 0,
            flexWrap: narrow ? 'wrap' : undefined,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'grid', gap: 'var(--vc-space-2xs)', flex: 1, minWidth: 0, maxWidth: '100%' }}>
            <div style={{ fontWeight: 800, minWidth: 0, overflowWrap: 'anywhere' }}>{props.title ?? 'VideoCanvass'}</div>
            {props.subtitle ? (
              <div
                style={{
                  fontSize: 'var(--vc-fs-sm)',
                  color: '#4b5563',
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
              >
                {props.subtitle}
              </div>
            ) : null}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--vc-space-sm)',
              flexShrink: 0,
              flexWrap: 'wrap',
              justifyContent: narrow ? 'flex-end' : undefined,
            }}
          >
            {props.right}
            <button
              type="button"
              title={`${syncLabel} — ${sync.message}`}
              aria-label={`${syncLabel}. ${sync.message}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 'clamp(22px, 5.5vw, 26px)',
                height: 'clamp(22px, 5.5vw, 26px)',
                padding: 0,
                border: '1px solid #e5e7eb',
                borderRadius: 999,
                background: '#fafafa',
                cursor: 'default',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: syncDotColor,
                  boxShadow: `0 0 0 2px ${syncDotColor}33`,
                }}
              />
            </button>
          </div>
        </div>
      </header>
      <main
        style={{
          width: '100%',
          maxWidth: 'min(1560px, 100%)',
          margin: '0 auto',
          padding: mainPad,
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowX: 'hidden',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          boxSizing: 'border-box',
        }}
      >
        {props.children}
      </main>
    </div>
  )
}

