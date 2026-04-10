import type { CSSProperties } from 'react'
import { VC_TOUR } from '../tour/tourSteps'

/**
 * Primary workspace mode: video canvassing (addresses) vs subject tracking.
 * Rendered in wide map chrome and narrow bottom bar; see {@link CasePage} for layout context.
 */
export function CaseWorkspaceModeTabs(props: {
  caseTab: 'addresses' | 'tracking'
  onSetCaseTab: (t: 'addresses' | 'tracking') => void
  narrowMapBottom?: boolean
  modeBtn: (active: boolean) => CSSProperties
  modeBtnNarrowBottom: (active: boolean) => CSSProperties
}) {
  const narrowBottom = props.narrowMapBottom === true
  const modeBtn = narrowBottom ? props.modeBtnNarrowBottom : props.modeBtn
  return (
    <div
      data-vc-tour={VC_TOUR.caseWorkspaceTabs}
      style={
        narrowBottom
          ? {
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              alignItems: 'stretch',
              gap: 8,
              width: '100%',
              minWidth: 0,
              boxSizing: 'border-box',
              pointerEvents: 'auto',
            }
          : {
              display: 'grid',
              gridTemplateColumns: 'max-content max-content',
              gap: 6,
              flexShrink: 0,
              pointerEvents: 'auto',
            }
      }
    >
      <button
        type="button"
        style={{
          ...modeBtn(props.caseTab === 'addresses'),
          ...(narrowBottom ? { flex: '1 1 0', minWidth: 0 } : {}),
        }}
        onClick={() => props.onSetCaseTab('addresses')}
      >
        Video canvassing
      </button>
      <button
        type="button"
        style={{
          ...modeBtn(props.caseTab === 'tracking'),
          ...(narrowBottom ? { flex: '1 1 0', minWidth: 0 } : {}),
        }}
        onClick={() => props.onSetCaseTab('tracking')}
      >
        Subject tracking
      </button>
    </div>
  )
}
