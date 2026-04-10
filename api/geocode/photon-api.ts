import { PHOTON_USER_AGENT } from './_proxyHeaders.js'

export const config = { runtime: 'edge' }

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }
  const incoming = new URL(request.url)
  const target = new URL('https://photon.komoot.io/api/')
  incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v))

  const upstream = await fetch(target.toString(), {
    headers: {
      'User-Agent': PHOTON_USER_AGENT,
      Accept: 'application/json',
    },
  })
  const body = await upstream.arrayBuffer()
  const ct = upstream.headers.get('Content-Type') ?? 'application/json'
  const headers = new Headers({ 'Content-Type': ct })
  // Same query+bias repeats often while typing/backspacing; edge/CDN cache cuts duplicate round-trips to Komoot.
  if (upstream.ok) {
    headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=86400')
  }
  return new Response(body, { status: upstream.status, headers })
}
