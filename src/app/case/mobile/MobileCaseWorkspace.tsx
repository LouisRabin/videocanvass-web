import type { CSSProperties, ReactNode } from 'react'

type MobileCaseWorkspaceProps = {
  workspaceGridStyle: CSSProperties
  children: ReactNode
}

export function MobileCaseWorkspace(props: MobileCaseWorkspaceProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(2px, 0.6vw, 6px)',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingLeft: 'clamp(4px, 1.2vw, 12px)',
        paddingRight: 'clamp(4px, 1.2vw, 12px)',
        paddingBottom: 'clamp(6px, 1.2vw, 12px)',
        boxSizing: 'border-box',
      }}
    >
      <div className="case-workspace-shell" style={props.workspaceGridStyle}>
        {props.children}
      </div>
    </div>
  )
}
