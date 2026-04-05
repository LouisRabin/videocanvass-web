import type { TargetMode } from '../../lib/targetMode'

export type TourScope = 'cases' | 'case'

export type TourStepDef = {
  id: string
  title: string
  body: string
  /** `data-vc-tour` value; omit or null = centered card only */
  target?: string | null
  /** Where to prefer the tooltip relative to the highlight */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** Which layout variants include this step */
  variants: Array<'web' | 'mobile' | 'both'>
}

/** Stable hook IDs for anchors in CasesPage / CasePage */
export const VC_TOUR = {
  casesActions: 'cases-actions',
  casesTabsSearch: 'cases-tabs-search',
  casesList: 'cases-list',
  caseBack: 'case-back',
  caseHeaderMeta: 'case-header-meta',
  caseWorkspaceTabs: 'case-workspace-tabs',
  caseMapToolsMobile: 'case-map-tools-mobile',
  caseMapToolsWide: 'case-map-tools-wide',
  caseMapCanvas: 'case-map-canvas',
  caseFloatingSearch: 'case-floating-search',
  caseControlPane: 'case-control-pane',
  caseListViewBtn: 'case-list-view-btn',
} as const

const CASES_STEPS: TourStepDef[] = [
  {
    id: 'cases-welcome',
    title: 'Cases overview',
    body: 'This is your case list. Each case holds canvass addresses, photos, subject tracks, and DVR tools in one workspace.',
    variants: ['both'],
  },
  {
    id: 'cases-actions',
    title: 'Toolbar actions',
    body: 'Create a new case, open global results (if available), adjust security / 2FA, or sign out from the top-right.',
    target: VC_TOUR.casesActions,
    placement: 'bottom',
    variants: ['both'],
  },
  {
    id: 'cases-tabs',
    title: 'Filter and search',
    body: 'Use My cases, Team member, or All accessible to narrow the list. Search filters by case name or description.',
    target: VC_TOUR.casesTabsSearch,
    placement: 'bottom',
    variants: ['both'],
  },
  {
    id: 'cases-open',
    title: 'Open a case',
    body: 'Tap or click a case row to open the map workspace. You can start this tour again from “Tour” anytime.',
    target: VC_TOUR.casesList,
    placement: 'top',
    variants: ['both'],
  },
]

const CASE_STEPS_SHARED: TourStepDef[] = [
  {
    id: 'case-welcome',
    title: 'Inside a case',
    body: 'You are viewing one case. Use Case List to return here. Edit the title or description if you have permission.',
    target: VC_TOUR.caseHeaderMeta,
    placement: 'bottom',
    variants: ['both'],
  },
  {
    id: 'case-back',
    title: 'Back to all cases',
    body: 'Case List returns to the case picker without losing data.',
    target: VC_TOUR.caseBack,
    placement: 'bottom',
    variants: ['both'],
  },
  {
    id: 'case-tabs',
    title: 'Video canvassing vs Subject tracking',
    body: 'Video canvassing focuses on addresses and probative visits. Subject tracking is for route steps on movement tracks. Long-press on the map can switch modes when hints apply.',
    target: VC_TOUR.caseWorkspaceTabs,
    placement: 'bottom',
    variants: ['both'],
  },
]

const CASE_STEPS_WEB: TourStepDef[] = [
  {
    id: 'case-wide-tools',
    title: 'Map tools on the map',
    body: 'On a wide screen, Views, Filters, Tracks, Photos, and DVR calculator sit on the map as a vertical strip. Tap an icon to open that tool in a panel below the strip.',
    target: VC_TOUR.caseMapToolsWide,
    placement: 'right',
    variants: ['web'],
  },
  {
    id: 'case-list-view',
    title: 'Map and list',
    body: 'In Video canvassing, open Views on the map toolbar, then use List view to show addresses in a scrollable list (at the bottom of the map on a wide screen).',
    target: VC_TOUR.caseListViewBtn,
    placement: 'right',
    variants: ['web'],
  },
  {
    id: 'case-map-web',
    title: 'The map',
    body: 'Tap pins to select canvass locations. On Subject tracking, tap route steps to select them; use map tools for fit, filters, and photos.',
    target: VC_TOUR.caseMapCanvas,
    placement: 'left',
    variants: ['web'],
  },
]

const CASE_STEPS_MOBILE: TourStepDef[] = [
  {
    id: 'case-mobile-menu',
    title: 'Map tools menu',
    body: 'Tap the menu (☰) to open Views, Filters, Tracks, Photos, and DVR calculator over the map.',
    target: VC_TOUR.caseMapToolsMobile,
    placement: 'left',
    variants: ['mobile'],
  },
  {
    id: 'case-mobile-search',
    title: 'Address search',
    body: 'Search for an address from the bar on the map. Dismiss search before tapping the map to add or pick locations.',
    target: VC_TOUR.caseFloatingSearch,
    placement: 'bottom',
    variants: ['mobile'],
  },
  {
    id: 'case-map-mobile',
    title: 'The map',
    body: 'Tap canvass pins or route steps to select them. On narrow layouts the map stacks with lists and drawers.',
    target: VC_TOUR.caseMapCanvas,
    placement: 'top',
    variants: ['mobile'],
  },
]

function stepMatchesVariant(step: TourStepDef, mode: TargetMode): boolean {
  return step.variants.some((v) => v === 'both' || v === mode)
}

export function getTourSteps(scope: TourScope, mode: TargetMode): TourStepDef[] {
  if (scope === 'cases') {
    return CASES_STEPS.filter((s) => stepMatchesVariant(s, mode))
  }
  return [
    ...CASE_STEPS_SHARED.filter((s) => stepMatchesVariant(s, mode)),
    ...(mode === 'web' ? CASE_STEPS_WEB.filter((s) => stepMatchesVariant(s, mode)) : CASE_STEPS_MOBILE.filter((s) => stepMatchesVariant(s, mode))),
  ]
}

export function resolveTourElement(target: string | null | undefined): Element | null {
  if (!target || typeof document === 'undefined') return null
  return document.querySelector(`[data-vc-tour="${target}"]`)
}
