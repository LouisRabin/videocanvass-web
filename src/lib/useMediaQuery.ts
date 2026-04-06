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
