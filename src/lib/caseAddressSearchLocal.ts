import type { Location } from './types'
import type { PlaceSuggestion } from './geocode'

/** Case addresses whose saved text contains the query (case-insensitive), for instant “on this case” autocomplete. */
export function localCaseAddressSuggestions(
  locations: Location[],
  caseId: string,
  query: string,
  limit: number,
): PlaceSuggestion[] {
  const q = query.trim().toLowerCase()
  if (q.length < 3) return []
  const out: PlaceSuggestion[] = []
  for (const loc of locations) {
    if (loc.caseId !== caseId) continue
    const addr = loc.addressText?.trim() ?? ''
    if (!addr.toLowerCase().includes(q)) continue
    out.push({
      label: addr,
      lat: loc.lat,
      lon: loc.lon,
      bounds: loc.bounds ?? null,
    })
    if (out.length >= limit) break
  }
  return out
}
