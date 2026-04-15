import { handleGeocodeOptions, withGeocodeCors } from './_cors.js'
import { NOMINATIM_USER_AGENT } from './_proxyHeaders.js'

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  const preflight = handleGeocodeOptions(request)
  if (preflight) return preflight
  if (request.method !== 'GET') {
    return withGeocodeCors(new Response('Method Not Allowed', { status: 405 }))
  }
  const incoming = new URL(request.url)
  const target = new URL('https://nominatim.openstreetmap.org/reverse')
  incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v))

  const upstream = await fetch(target.toString(), {
    headers: {
      'User-Agent': NOMINATIM_USER_AGENT,
      Accept: 'application/json',
    },
  })
  const body = await upstream.arrayBuffer()
  const ct = upstream.headers.get('Content-Type') ?? 'application/json'
  return withGeocodeCors(new Response(body, { status: upstream.status, headers: { 'Content-Type': ct } }))
}
