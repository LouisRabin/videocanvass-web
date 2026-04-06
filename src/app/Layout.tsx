import React from 'react'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { dismissRemoteMergeNotice, useSyncStatus } from '../lib/syncStatus'
import { relationalBackendEnabled } from '../lib/backendMode'
import { vcGlassFgMutedOnPanel, vcGlassFgOnPanel, vcLiquidGlassAppHeader } from '../lib/vcLiquidGlass'

export function Layout(props: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  /** When set, header uses a back / centered title / actions row (e.g. case screen). */
  left?: React.ReactNode
  /** With `left`, aligns the title block (default `start`). */
  titleAlign?: 'start' | 'center'
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

  const titleAlign = props.titleAlign ?? 'start'
  const centerTitle = titleAlign === 'center'
  const headerChrome = (
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
          border: '1px solid rgba(255,255,255,0.28)',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
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
  )

  const titleBlock = (
    <div
      style={{
        display: 'grid',
        gap: 'var(--vc-space-2xs)',
        flex: 1,
        minWidth: 0,
        maxWidth: '100%',
        ...(centerTitle
          ? { justifyItems: 'center', textAlign: 'center' as const }
          : { justifyItems: 'stretch', textAlign: 'start' as const }),
      }}
    >
      <div
        style={{
          fontWeight: 800,
          minWidth: 0,
          width: '100%',
          overflowWrap: 'anywhere',
          color: vcGlassFgOnPanel,
          ...(centerTitle ? { textAlign: 'center' as const } : { textAlign: 'start' as const }),
        }}
      >
        {props.title ?? 'VideoCanvass'}
      </div>
      {props.subtitle ? (
        <div
          style={{
            fontSize: 'var(--vc-fs-sm)',
            color: vcGlassFgMutedOnPanel,
            minWidth: 0,
            width: '100%',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            ...(centerTitle ? { textAlign: 'center' as const } : { textAlign: 'start' as const }),
          }}
        >
          {props.subtitle}
        </div>
      ) : null}
    </div>
  )

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          ...vcLiquidGlassAppHeader,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 'min(1560px, 100%)',
            margin: '0 auto',
            padding: headerPad,
            display: props.left != null ? 'grid' : 'flex',
            gap: narrow ? 'var(--vc-space-sm)' : dense ? 'var(--vc-space-md)' : 'var(--vc-space-lg)',
            alignItems: 'start',
            minWidth: 0,
            flexWrap: props.left != null ? undefined : narrow ? 'wrap' : undefined,
            boxSizing: 'border-box',
            ...(props.left != null
              ? {
                  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                  gridTemplateAreas: '"back title actions"',
                }
              : {}),
          }}
        >
          {props.left != null ? (
            <>
              <div style={{ gridArea: 'back', justifySelf: 'start', minWidth: 0 }}>{props.left}</div>
              <div
                style={{
                  gridArea: 'title',
                  minWidth: 0,
                  width: '100%',
                  display: 'flex',
                  justifyContent: centerTitle ? 'center' : 'flex-start',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: centerTitle ? 'min(720px, 100%)' : '100%',
                  }}
                >
                  {titleBlock}
                </div>
              </div>
              <div style={{ gridArea: 'actions', justifySelf: 'end', minWidth: 0 }}>{headerChrome}</div>
            </>
          ) : (
            <>
              {titleBlock}
              {headerChrome}
            </>
          )}
        </div>
      </header>
      {sync.pendingRemoteSaves > 0 && relationalBackendEnabled() ? (
        <div
          role="status"
          style={{
            width: '100%',
            maxWidth: 'min(1560px, 100%)',
            margin: '0 auto',
            padding: '8px 12px',
            boxSizing: 'border-box',
            background: '#eff6ff',
            borderBottom: '1px solid #bfdbfe',
            color: '#1e3a8a',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Saving to cloud… ({sync.pendingRemoteSaves} pending)
        </div>
      ) : null}
      {sync.remoteMergeNotice ? (
        <div
          role="status"
          style={{
            width: '100%',
            maxWidth: 'min(1560px, 100%)',
            margin: '0 auto',
            padding: '8px 12px',
            boxSizing: 'border-box',
            background: '#fffbeb',
            borderBottom: '1px solid #fde68a',
            color: '#78350f',
            fontSize: 13,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ flex: '1 1 200px', minWidth: 0 }}>{sync.remoteMergeNotice}</span>
          <button
            type="button"
            onClick={() => dismissRemoteMergeNotice()}
            style={{
              border: '1px solid #d97706',
              borderRadius: 8,
              padding: '4px 10px',
              background: 'white',
              cursor: 'pointer',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
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

