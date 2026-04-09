/**
 * STABLE MODULE — Do not casually edit.
 *
 * Resolves a human-readable address line from coordinates (map tap, pending-add queue, post-save backfill,
 * building hint refinement). Behavior is documented in `HANDOFF.md` (Address & footprint retrieval).
 *
 * If you need to change providers, cache TTL, or deduplication: validate end-to-end, update HANDOFF, and edit
 * here deliberately. Avoid drifting copies of this logic into `geocode.ts` or callers.
 *
 * Importers should use `import { reverseGeocodeAddressText } from './geocode'` (re-export) unless they are
 * intentionally depending only on this file.
 */
import { z } from 'zod'

const PhotonReversePropertiesSchema = z.object({
  street: z.string().optional(),
  housenumber: z.string().optional(),
  postcode: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  name: z.string().optional(),
  locality: z.string().optional(),
  district: z.string().optional(),
})

const PhotonReverseResponseSchema = z.object({
  features: z.array(
    z.object({
      properties: PhotonReversePropertiesSchema,
    }),
  ),
})

const reverseCache = new Map<string, { at: number; value: string }>()
const REVERSE_TTL_MS = 15 * 60 * 1000
/** Fail fast when Komoot Photon stalls so Nominatim can run without waiting on the browser’s long default. */
const PHOTON_REVERSE_TIMEOUT_MS = 6_000
const NOMINATIM_REVERSE_TIMEOUT_MS = 12_000

/** Same coordinate can be reverse-geocoded from the map click, pending-add queue, and post-save hooks — one HTTP pass. */
const reverseInflight = new Map<string, Promise<string | null>>()

function abortSignalWithTimeout(base: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs)
  if (!base) return t
  return AbortSignal.any([base, t])
}

type PhotonRevProps = z.infer<typeof PhotonReversePropertiesSchema>

function photonReverseStreetLine(p: PhotonRevProps): string {
  return [p.housenumber, p.street].filter(Boolean).join(' ').trim()
}

function photonReverseAddressScore(p: PhotonRevProps): number {
  let s = 0
  if (p.housenumber) s += 6
  if (p.street) s += 5
  if (p.city) s += 1
  if ((p.name ?? '').trim() && !p.street) s -= 3
  return s
}

function pickPhotonReverseProperties(features: Array<{ properties: PhotonRevProps }>): PhotonRevProps {
  let best = features[0]!.properties
  let bestScore = photonReverseAddressScore(best)
  for (let i = 1; i < Math.min(features.length, 8); i++) {
    const p = features[i]!.properties
    const sc = photonReverseAddressScore(p)
    if (sc > bestScore) {
      bestScore = sc
      best = p
    }
  }
  return best
}

function labelFromPhotonProperties(p: PhotonRevProps, fallback: string | null): string | null {
  const streetLine = photonReverseStreetLine(p)
  const poi = (p.name ?? '').trim()
  const line1 = streetLine || poi || null
  const parts = [
    line1 || undefined,
    p.locality,
    p.district,
    p.city,
    p.state,
    p.postcode,
    p.country,
  ]
    .map((x) => (x ?? '').trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const deduped = parts.filter((x) => {
    const k = x.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const label = deduped.join(', ')
  if (label.length) return label
  const n = (p.name ?? '').trim()
  if (n.length) return n
  return fallback
}

async function reverseGeocodePhoton(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const url = new URL('/api/geocode/photon-reverse', window.location.origin)
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('lang', 'en')

  const res = await fetch(url.toString(), { signal: abortSignalWithTimeout(signal, PHOTON_REVERSE_TIMEOUT_MS) })
  if (!res.ok) return null
  const json = await res.json()
  const parsed = PhotonReverseResponseSchema.safeParse(json)
  if (!parsed.success || !parsed.data.features.length) return null
  const props = pickPhotonReverseProperties(parsed.data.features)
  return labelFromPhotonProperties(props, null)
}

function labelFromNominatimAddress(a: Record<string, string>): string | null {
  const hn = (a.house_number ?? a.house_name ?? '').trim()
  const road = (a.road || a.pedestrian || a.path || a.footway || a.residential || '').trim()
  const line1 = [hn, road].filter(Boolean).join(' ').trim()
  const city = (a.city || a.town || a.village || a.hamlet || a.suburb || a.city_district || '').trim()
  const state = (a.state || a.region || '').trim()
  const pc = (a.postcode ?? '').trim()
  const country = (a.country ?? '').trim()
  const tail = [city, state, pc, country]
    .map((x) => x.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const deduped = tail.filter((x) => {
    const k = x.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  if (line1 && deduped.length) return `${line1}, ${deduped.join(', ')}`
  if (line1) return line1
  if (deduped.length) return deduped.join(', ')
  return null
}

async function reverseGeocodeNominatim(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const url = new URL('/api/geocode/nominatim-reverse', window.location.origin)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('zoom', '18')
  url.searchParams.set('addressdetails', '1')

  const res = await fetch(url.toString(), { signal: abortSignalWithTimeout(signal, NOMINATIM_REVERSE_TIMEOUT_MS) })
  if (!res.ok) return null
  const json = (await res.json()) as {
    display_name?: string
    address?: Record<string, string>
  }
  const structured = json.address ? labelFromNominatimAddress(json.address) : null
  if (structured) return structured
  const text = (json.display_name ?? '').trim()
  return text.length ? text : null
}

/**
 * Run Photon (Komoot) and Nominatim in parallel; return the first non-null label.
 * Cancels the other request via `parent` once a winner is found to reduce load.
 */
async function reverseGeocodeFirstNonNullParallel(
  lat: number,
  lon: number,
  signal: AbortSignal | undefined,
  parent: AbortController,
): Promise<string | null> {
  const combined = signal ? AbortSignal.any([signal, parent.signal]) : parent.signal

  return await new Promise<string | null>((resolve) => {
    let done = false
    let nullCount = 0

    const finish = (v: string | null) => {
      if (done) return
      if (v) {
        done = true
        try {
          parent.abort()
        } catch {
          /* ignore */
        }
        resolve(v)
        return
      }
      nullCount++
      if (nullCount >= 2) {
        done = true
        resolve(null)
      }
    }

    void reverseGeocodePhoton(lat, lon, combined)
      .then(finish)
      .catch(() => finish(null))
    void reverseGeocodeNominatim(lat, lon, combined)
      .then(finish)
      .catch(() => finish(null))
  })
}

/**
 * Human-readable label for a map point. Photon (browser-direct) and Nominatim (app proxy) run in parallel;
 * first successful non-null result wins and the other request is aborted. Callers share cache + inflight per rounded coordinate.
 */
export async function reverseGeocodeAddressText(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`
  const cached = reverseCache.get(key)
  if (cached && Date.now() - cached.at < REVERSE_TTL_MS) {
    return cached.value
  }

  let inflight = reverseInflight.get(key)
  if (!inflight) {
    inflight = (async () => {
      const parent = new AbortController()
      try {
        const label = await reverseGeocodeFirstNonNullParallel(lat, lon, signal, parent)
        if (label) {
          reverseCache.set(key, { at: Date.now(), value: label })
        }
        return label
      } catch {
        return null
      }
    })().finally(() => {
      reverseInflight.delete(key)
    })
    reverseInflight.set(key, inflight)
  }
  return inflight
}
