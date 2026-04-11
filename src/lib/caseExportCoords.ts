import type { Location, TrackPoint } from './types'

export function locationsToExportCoords(locations: Location[]): { lat: number; lon: number }[] {
  return locations.map((l) => ({ lat: l.lat, lon: l.lon }))
}

export function trackPointsToExportCoords(points: TrackPoint[]): { lat: number; lon: number }[] {
  return points.map((p) => ({ lat: p.lat, lon: p.lon }))
}
