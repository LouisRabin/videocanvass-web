/** Capacitor / Ionic WebViews use non-https origins; browsers enforce CORS on cross-origin fetches to these proxies. */
function corsHeaders(): Headers {
  const h = new Headers()
  h.set('Access-Control-Allow-Origin', '*')
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization')
  h.set('Access-Control-Max-Age', '86400')
  return h
}

export function handleGeocodeOptions(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export function withGeocodeCors(response: Response): Response {
  const headers = new Headers(response.headers)
  corsHeaders().forEach((value, key) => headers.set(key, value))
  return new Response(response.body, { status: response.status, headers })
}
