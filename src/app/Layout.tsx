import React from 'react'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from '../lib/useMediaQuery'
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
