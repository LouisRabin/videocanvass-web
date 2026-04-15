#!/usr/bin/env node
/**
 * Smoke-test deployed /api/geocode/* routes (same paths the app uses for map tap → address).
 *
 * Usage:
 *   npm run verify:geocode-proxies -- https://www.example.com
 *   VERIFY_GEOCODE_BASE=https://www.example.com node scripts/verify-geocode-proxies.mjs
 *
 * Exits 0 only if photon-reverse and nominatim-reverse return HTTP 2xx with JSON bodies.
 */

const baseArg = process.argv[2]?.trim()
const baseEnv = (process.env.VERIFY_GEOCODE_BASE ?? '').trim()
const base = (baseArg || baseEnv).replace(/\/+$/, '')

if (!base) {
  console.error(
    'Missing base URL. Pass as first argument or set VERIFY_GEOCODE_BASE, e.g.\n' +
      '  npm run verify:geocode-proxies -- https://www.cameracanvass.com',
  )
  process.exit(2)
}

let parsed
try {
  parsed = new URL(base)
} catch {
  console.error(`Invalid URL: ${base}`)
  process.exit(2)
}
if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
  console.error('Base URL must be http(s):', base)
  process.exit(2)
}

/** Midtown-ish point inside US bbox used by the app. */
const lat = 40.758
const lon = -73.9855

async function check(name, url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  const ct = res.headers.get('content-type') ?? ''
  const text = await res.text()
  let jsonOk = false
  if (ct.includes('json') && text.trim().startsWith('{')) {
    try {
      JSON.parse(text)
      jsonOk = true
    } catch {
      jsonOk = false
    }
  }
  const acao = res.headers.get('access-control-allow-origin')
  const corsOk = !!acao
  const ok = res.ok && jsonOk && corsOk
  const status = `${res.status} ${res.statusText}`
  if (!ok) {
    const corsHint = !corsOk ? '\n  missing Access-Control-Allow-Origin (Capacitor WebView CORS will fail)' : ''
    console.error(`[FAIL] ${name}\n  GET ${url}\n  ${status}${corsHint}\n  body (first 200 chars): ${text.slice(0, 200)}`)
  } else {
    console.log(`[OK] ${name} — ${status} — ACAO: ${acao}`)
  }
  return ok
}

const photon = new URL('/api/geocode/photon-reverse', `${parsed.origin}/`)
photon.searchParams.set('lat', String(lat))
photon.searchParams.set('lon', String(lon))
photon.searchParams.set('lang', 'en')

const nom = new URL('/api/geocode/nominatim-reverse', `${parsed.origin}/`)
nom.searchParams.set('format', 'jsonv2')
nom.searchParams.set('lat', String(lat))
nom.searchParams.set('lon', String(lon))
nom.searchParams.set('zoom', '18')
nom.searchParams.set('addressdetails', '1')

console.log(`Verifying geocode proxies at origin: ${parsed.origin}\n`)

const a = await check('photon-reverse', photon.toString())
const b = await check('nominatim-reverse', nom.toString())

if (!a || !b) {
  console.error('\nOne or more checks failed. Fix hosting / env on the server, then retry.')
  process.exit(1)
}
console.log('\nAll geocode proxy checks passed.')
