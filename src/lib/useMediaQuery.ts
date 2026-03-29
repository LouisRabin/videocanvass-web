import { useEffect, useState } from 'react'

/** Match viewports treated as phone / narrow WebView (Case page stacks map above controls). */
export const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)'

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
