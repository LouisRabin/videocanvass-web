type LatLon = [number, number]

type GeoJsonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

type ReverseResult = {
  geojson?: GeoJsonGeometry
}

export async function fetchBuildingFootprint(lat: number, lon: number, signal?: AbortSignal): Promise<LatLon[] | null> {
  const fromOverpass = await fetchFromOverpass(lat, lon, signal).catch(() => null)
  if (fromOverpass && fromOverpass.length >= 3) return fromOverpass

  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('zoom', '18')
  url.searchParams.set('polygon_geojson', '1')
  url.searchParams.set('addressdetails', '0')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) return null

  const json = (await res.json()) as ReverseResult
  if (!json.geojson) return null
  return extractOuterRing(json.geojson)
}

export async function reverseGeocodeAddressText(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('zoom', '18')
  url.searchParams.set('addressdetails', '1')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) return null
  const json = (await res.json()) as { display_name?: string }
  const text = (json.display_name ?? '').trim()
  return text.length ? text : null
}

async function fetchFromOverpass(lat: number, lon: number, signal?: AbortSignal): Promise<LatLon[] | null> {
  const query = `
[out:json][timeout:10];
(
  way(around:25,${lat},${lon})["building"];
  relation(around:25,${lat},${lon})["building"];
);
out geom;
`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query,
    signal,
  })
  if (!res.ok) return null
  const json = (await res.json()) as {
    elements?: Array<{
      type: 'way' | 'relation'
      geometry?: Array<{ lat: number; lon: number }>
      members?: Array<{ geometry?: Array<{ lat: number; lon: number }> }>
    }>
  }
  const elements = json.elements ?? []
  const candidates: LatLon[][] = []
  for (const el of elements) {
    if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
      candidates.push(el.geometry.map((p) => [p.lat, p.lon]))
    }
    if (el.type === 'relation' && el.members) {
      for (const m of el.members) {
        if (m.geometry && m.geometry.length >= 3) candidates.push(m.geometry.map((p) => [p.lat, p.lon]))
      }
    }
  }
  if (!candidates.length) return null

  for (const poly of candidates) {
    if (pointInPolygon([lat, lon], poly)) return poly
  }

  // Fall back to nearest centroid.
  let best: LatLon[] | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const poly of candidates) {
    const c = centroid(poly)
    const d = (c[0] - lat) ** 2 + (c[1] - lon) ** 2
    if (d < bestDist) {
      bestDist = d
      best = poly
    }
  }
  return best
}

function extractOuterRing(geometry: GeoJsonGeometry): LatLon[] | null {
  if (geometry.type === 'Polygon') {
    return toLatLonRing(geometry.coordinates[0] ?? [])
  }

  // Use the largest outer ring if multiple polygons are returned.
  const rings = geometry.coordinates.map((poly) => poly[0] ?? [])
  if (!rings.length) return null
  let best: number[][] = []
  let bestArea = -1
  for (const ring of rings) {
    const a = Math.abs(roughArea(ring))
    if (a > bestArea) {
      bestArea = a
      best = ring
    }
  }
  return toLatLonRing(best)
}

function toLatLonRing(ring: number[][]): LatLon[] | null {
  if (ring.length < 3) return null
  const out: LatLon[] = ring
    .filter((p) => p.length >= 2)
    .map((p) => [p[1], p[0]])
  return out.length >= 3 ? out : null
}

function roughArea(ring: number[][]): number {
  if (ring.length < 3) return 0
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const p1 = ring[i]
    const p2 = ring[(i + 1) % ring.length]
    area += p1[0] * p2[1] - p2[0] * p1[1]
  }
  return area / 2
}

function centroid(points: LatLon[]): LatLon {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const [y1, x1] = points[i]
    const [y2, x2] = points[(i + 1) % points.length]
    const f = x1 * y2 - x2 * y1
    a += f
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  const area = a / 2 || 1
  return [cy / (6 * area), cx / (6 * area)]
}

function pointInPolygon(point: LatLon, polygon: LatLon[]): boolean {
  const [py, px] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

