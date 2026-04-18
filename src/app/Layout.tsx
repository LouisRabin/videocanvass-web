import React, { useMemo, useState } from 'react'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { useSyncStatus } from '../lib/syncStatus'
import { relationalBackendEnabled } from '../lib/backendMode'
import { getNativeCapabilities } from '../lib/nativeCapabilities'
import { useTargetMode } from '../lib/targetMode'
import { vcGlassFgMutedOnPanel, vcGlassFgOnPanel, vcLiquidGlassAppHeader } from '../lib/vcLiquidGlass'
import { vcBuildDebugSummary } from '../lib/buildDebug'
import { SHARED_WORKSPACE_ID } from '../lib/supabase'
import { Modal } from './Modal'

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
  /**
   * `auto` (default): `<main>` scrolls (standard pages).
   * `hidden`: page owns vertical scrolling (e.g. cases list body, login centering).
   */
  mainScroll?: 'auto' | 'hidden'
}) {
  const dense = props.dense === true
  const mainScroll = props.mainScroll ?? 'auto'
  const narrow = useMediaQuery(MOBILE_BREAKPOINT_QUERY)
  const headerPad = dense
    ? 'var(--vc-pad-header-dense-y) var(--vc-pad-header-dense-x)'
    : 'var(--vc-pad-header-y) var(--vc-pad-header-x)'
  const mainPad = dense
    ? 'var(--vc-pad-main-dense-y) var(--vc-pad-main-dense-x)'
    : 'var(--vc-pad-main-y) var(--vc-pad-main-x)'
  const sync = useSyncStatus()
  const [syncDiagOpen, setSyncDiagOpen] = useState(false)
  const targetMode = useTargetMode()
  const showSyncStatusPill = getNativeCapabilities(targetMode).platform !== 'ios'

  const syncLabel = sync.mode === 'supabase_ok' ? 'Sync: OK' : sync.mode === 'local_fallback' ? 'Sync: issue' : 'Sync: starting'
  const syncTitleDetail = sync.message.trim() ? ` — ${sync.message}` : ''
  const syncButtonTitle = `${syncLabel}${syncTitleDetail} — click for diagnostics`

  const syncDotColor =
    sync.mode === 'supabase_ok' ? '#16a34a' : sync.mode === 'local_fallback' ? '#d97706' : '#6b7280'

  const diagnosticsText = useMemo(() => {
    const relational = relationalBackendEnabled()
    return JSON.stringify(
      {
        mode: sync.mode,
        message: sync.message.trim() || null,
        lastError: sync.lastError,
        pendingRemoteSaves: sync.pendingRemoteSaves,
        relationalBackend: relational,
        updatedAtIso: new Date(sync.updatedAt).toISOString(),
        sharedWorkspaceId: SHARED_WORKSPACE_ID,
        build: vcBuildDebugSummary(),
        debugLog: sync.debugLines,
      },
      null,
      2,
    )
  }, [sync])

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
      {showSyncStatusPill ? (
        <>
          <button
            type="button"
            title={syncButtonTitle}
            aria-label={`${syncLabel}. ${sync.message.trim() || 'No status message.'} Open sync diagnostics.`}
            aria-expanded={syncDiagOpen}
            onClick={() => setSyncDiagOpen(true)}
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
              cursor: 'pointer',
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
          <Modal
            title="Sync diagnostics"
            ariaLabel="Sync diagnostics"
            open={syncDiagOpen}
            onClose={() => setSyncDiagOpen(false)}
            wide
          >
            <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.45, opacity: 0.92 }}>
              Copy this block when reporting sync or database issues. It does not include API keys.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(diagnosticsText)}
                style={{
                  border: '1px solid rgba(255,255,255,0.35)',
                  borderRadius: 10,
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.12)',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                Copy to clipboard
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 10,
                background: 'rgba(15,23,42,0.55)',
                border: '1px solid rgba(255,255,255,0.12)',
                fontSize: 11,
                lineHeight: 1.4,
                overflow: 'auto',
                maxHeight: 'min(52vh, 420px)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {diagnosticsText}
            </pre>
          </Modal>
        </>
      ) : null}
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
    <div className="vc-app-shell">
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
          overflowY: mainScroll === 'hidden' ? 'hidden' : 'auto',
          WebkitOverflowScrolling: mainScroll === 'hidden' ? undefined : 'touch',
          boxSizing: 'border-box',
        }}
      >
        {props.children}
      </main>
    </div>
  )
}
