import React from 'react'

export function Layout(props: { title?: string; subtitle?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
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
        <div style={{ maxWidth: 1560, margin: '0 auto', padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 3 }}>
            <div style={{ fontWeight: 800 }}>{props.title ?? 'VideoCanvass'}</div>
            {props.subtitle ? <div style={{ fontSize: 12, color: '#4b5563' }}>{props.subtitle}</div> : null}
          </div>
          <div style={{ flex: 1 }} />
          {props.right}
        </div>
      </header>
      <main style={{ maxWidth: 1560, width: '100%', margin: '0 auto', padding: '12px 16px', flex: 1, overflow: 'hidden' }}>
        {props.children}
      </main>
    </div>
  )
}

