import { useEffect, useState } from 'react'
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
  const { enabled = true, debounceMs = 280, minChars = 3, bias = null, mapCenterFallback } = opts
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setResults([])
      setLoading(false)
      return
    }
    let alive = true
    const ctrl = new AbortController()
    const q = query.trim()
    if (q.length < minChars) {
      setResults([])
      setLoading(false)
      return
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
    setQuery('')
    setResults([])
    setLoading(false)
  }

  return {
    query,
    setQuery,
    results,
    setResults,
    loading,
    setLoading,
    clear,
  }
}
