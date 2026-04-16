import { useEffect, useState } from 'react'

/** Match viewports treated as phone / narrow WebView (Case page stacks map above controls). */
export const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)'

/** Wide map top row: stack mode+search above track pills so mid-width browsers do not crowd one line. */
export const COMPACT_WEB_MAP_TOP_BREAKPOINT_QUERY = '(max-width: 1100px)'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * iPhone / Android UA, iPad (any UA), and iPadOS “desktop” Safari (Macintosh + touch points).
 * Used so map UI does not rely only on {@link MOBILE_BREAKPOINT_QUERY} (iPad landscape is often &gt; 768px).
 */
export function shouldHideMaplibreAttributionForTouchUi(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iphone|ipod|ipad|android/i.test(ua)) return true
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}
