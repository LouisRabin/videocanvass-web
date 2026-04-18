import { handleGeocodeOptions, withGeocodeCors } from './_cors.js'

export const config = { runtime: 'edge' }

const OVERPASS_USER_AGENT = 'Camera-Canvass/1.0 (building footprint proxy)'

export default async function handler(request: Request): Promise<Response> {
  const preflight = handleGeocodeOptions(request)
  if (preflight) return preflight
  if (request.method !== 'POST') {
    return withGeocodeCors(new Response('Method Not Allowed', { status: 405 }))
  }
  const body = await request.text()
  const upstream = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('Content-Type') ?? 'text/plain',
      'User-Agent': OVERPASS_USER_AGENT,
    },
    body,
  })
  const out = await upstream.arrayBuffer()
  const ct = upstream.headers.get('Content-Type') ?? 'application/json'
  return withGeocodeCors(new Response(out, { status: upstream.status, headers: { 'Content-Type': ct } }))
}
