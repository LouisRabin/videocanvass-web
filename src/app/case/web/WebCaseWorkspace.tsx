import type { CSSProperties, ReactNode } from 'react'

type WebCaseWorkspaceProps = {
  caseShellMaxH?: number
  workspaceGridStyle: CSSProperties
  children: ReactNode
  /** Mobile layout: skip extra bottom inset (full web mirrors side padding at bottom). */
  isNarrow?: boolean
}

const workspacePad = 'clamp(0px, 0.6vw, 6px)'

export function WebCaseWorkspace(props: WebCaseWorkspaceProps) {
  const narrow = props.isNarrow === true
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
        paddingLeft: narrow ? 0 : workspacePad,
        paddingRight: narrow ? 0 : workspacePad,
        paddingBottom: narrow ? 0 : workspacePad,
        boxSizing: 'border-box',
      }}
    >
      <div className="case-workspace-shell" style={props.workspaceGridStyle}>
        {props.children}
      </div>
    </div>
  )
}
