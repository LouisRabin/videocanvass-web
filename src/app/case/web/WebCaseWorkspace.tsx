import type { CSSProperties, ReactNode } from 'react'

type WebCaseWorkspaceProps = {
  caseShellMaxH?: number
  workspaceGridStyle: CSSProperties
  children: ReactNode
}

export function WebCaseWorkspace(props: WebCaseWorkspaceProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(4px, 0.9vw, 10px)',
        flex: 1,
        minHeight: 0,
        maxHeight: props.caseShellMaxH,
        overflow: 'hidden',
        paddingLeft: 'clamp(4px, 1.2vw, 12px)',
        paddingRight: 'clamp(4px, 1.2vw, 12px)',
        boxSizing: 'border-box',
      }}
    >
      <div className="case-workspace-shell" style={props.workspaceGridStyle}>
        {props.children}
      </div>
    </div>
  )
}
