import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from './useMediaQuery'

export type TargetMode = 'web' | 'mobile'
export const TARGET_MODE_BREAKPOINT_PX = 768

/**
 * Current target split:
 * - web: desktop browser
 * - mobile: iOS/Android app + mobile browser
 */
export function resolveTargetMode(isNarrowLayout: boolean): TargetMode {
  return isNarrowLayout ? 'mobile' : 'web'
}

export function resolveTargetModeFromWidth(viewportWidthPx: number): TargetMode {
  return viewportWidthPx <= TARGET_MODE_BREAKPOINT_PX ? 'mobile' : 'web'
}

export function useTargetMode(): TargetMode {
  useMediaQuery(MOBILE_BREAKPOINT_QUERY)
  // Temporary unification: run a single browser-first experience on all web viewports.
  return 'web'
}
