import { z } from 'zod'
import type { AddressBounds } from './types'

export type PlaceSuggestion = {
  label: string
  lat: number
  lon: number
  bounds: AddressBounds | null
}

type SearchOpts = {
  limit?: number
  signal?: AbortSignal
  bias?: { lat: number; lon: number }
}

export type GeocodeScope = 'ny' | 'us'
export const GEOCODE_SCOPE: GeocodeScope = 'us'

const PhotonFeatureSchema = z.object({
  properties: z.object({
    street: z.string().optional(),
    housenumber: z.string().optional(),
    postcode: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    name: z.string().optional(),
    // Photon sometimes returns a bbox via `extent`.
    extent: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(), // [west, south, east, north]
  }),
  geometry: z.object({
    // [lon, lat]
    coordinates: z.tuple([z.number(), z.number()]),
  }),
})

const PhotonResponseSchema = z.object({
  features: z.array(PhotonFeatureSchema),
})

const memCache = new Map<string, { at: number; value: PlaceSuggestion[] }>()
const TTL_MS = 10 * 60 * 1000

export async function searchPlaces(query: string, opts?: SearchOpts): Promise<PlaceSuggestion[]> {
  const q = normalizeQuery(query)
  if (q.length < 3) return []

  const limit = opts?.limit ?? 6
  const cacheKey = `${q.toLowerCase()}|${limit}`
  const cached = memCache.get(cacheKey)
  if (cached && Date.now() - cached.at < TTL_MS) {
    // Don't cache empties.
    if (cached.value.length) return cached.value
  }

  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('lang', 'en')
  if (opts?.bias) {
    // Location biasing can improve relevance.
    url.searchParams.set('lat', String(opts.bias.lat))
    url.searchParams.set('lon', String(opts.bias.lon))
  }

  const res = await fetch(url.toString(), { signal: opts?.signal })
  if (!res.ok) return []

  const json = await res.json()
  const parsed = PhotonResponseSchema.safeParse(json)
  if (!parsed.success) return []

  const value = parsed.data.features
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates
      const p = f.properties

      const parts = [
        [p.housenumber, p.street].filter(Boolean).join(' '),
        p.city,
        p.state,
        p.postcode,
        p.country,
      ]
        .map((x) => (x ?? '').trim())
        .filter(Boolean)

      const label = parts.join(', ') || p.name || q

      const bounds = p.extent
        ? {
            west: p.extent[0],
            south: p.extent[1],
            east: p.extent[2],
            north: p.extent[3],
          }
        : null

      return { label, lat, lon, bounds }
    })
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon))

  // Cache only non-empty results.
  if (value.length) memCache.set(cacheKey, { at: Date.now(), value })
  return value
}

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim()
}

