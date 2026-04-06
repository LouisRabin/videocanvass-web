import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from './useMediaQuery'

export type TargetMode = 'web' | 'mobile'

/**
 * Current target split:
 * - web: desktop browser
 * - mobile: iOS/Android app + mobile browser
 */
function resolveTargetMode(isNarrowLayout: boolean): TargetMode {
  return isNarrowLayout ? 'mobile' : 'web'
}

export function useTargetMode(): TargetMode {
  const isNarrowLayout = useMediaQuery(MOBILE_BREAKPOINT_QUERY)
  return resolveTargetMode(isNarrowLayout)
}
