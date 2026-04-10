import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type PlaceSuggestion } from '../../../lib/geocode'

type UseCaseGeocodeSearchOptions = {
  enabled?: boolean
  debounceMs?: number
  minChars?: number
  bias?: { lat: number; lon: number } | null
  /** When `bias` is null, called at search time (map viewport center for Photon). */
  mapCenterFallback?: () => { lat: number; lon: number } | null
}

export function useCaseGeocodeSearch(initialQuery = '', opts: UseCaseGeocodeSearchOptions = {}) {
  /** Slightly tighter than generic form search so address autocomplete feels snappier. */
  const { enabled = true, debounceMs = 120, minChars = 3, bias = null, mapCenterFallback } = opts
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  /** Last query that successfully returned remote results; used to avoid showing a stale list after paste/replace. */
  const lastFetchedQueryRef = useRef('')

  useEffect(() => {
    if (!enabled) {
      lastFetchedQueryRef.current = ''
      setResults([])
      setLoading(false)
      return
    }
    let alive = true
    const ctrl = new AbortController()
    const q = query.trim()
    if (q.length < minChars) {
      lastFetchedQueryRef.current = ''
      setResults([])
      setLoading(false)
      return
    }
    const last = lastFetchedQueryRef.current
    if (
      last.length >= minChars &&
      q !== last &&
      !q.startsWith(last) &&
      !last.startsWith(q)
    ) {
      setResults([])
    }
    const t = window.setTimeout(() => {
      setLoading(true)
      ;(async () => {
        const fromLocate = bias
        const fromMap = !fromLocate ? mapCenterFallback?.() ?? null : null
        const effective =
          fromLocate ??
          (fromMap &&
          Number.isFinite(fromMap.lat) &&
          Number.isFinite(fromMap.lon)
            ? { lat: fromMap.lat, lon: fromMap.lon }
            : null)
        const res = await searchPlaces(q, {
          signal: ctrl.signal,
          bias: effective ?? undefined,
        })
        if (!alive) return
        lastFetchedQueryRef.current = q
        setResults(res)
        setLoading(false)
      })().catch(() => {
        if (!alive) return
        setResults([])
        setLoading(false)
      })
    }, debounceMs)
    return () => {
      alive = false
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [bias, debounceMs, enabled, mapCenterFallback, minChars, query])

  const clear = () => {
    lastFetchedQueryRef.current = ''
    setQuery('')
    setResults([])
    setLoading(false)
  }

  const isRefreshing = loading && results.length > 0

  return {
    query,
    setQuery,
    results,
    setResults,
    loading,
    setLoading,
    isRefreshing,
    clear,
  }
}
