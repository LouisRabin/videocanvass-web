import { z } from 'zod'

export const CanvassStatusSchema = z.enum([
  'noCameras',
  'camerasNoAnswer',
  'notProbativeFootage',
  'probativeFootage',
])
export type CanvassStatus = z.infer<typeof CanvassStatusSchema>

export const AddressBoundsSchema = z.object({
  south: z.number(),
  west: z.number(),
  north: z.number(),
  east: z.number(),
})
export type AddressBounds = z.infer<typeof AddressBoundsSchema>

export const LatLonSchema = z.tuple([z.number(), z.number()])
export type LatLon = z.infer<typeof LatLonSchema>

export const LocationSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  addressText: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  bounds: AddressBoundsSchema.nullable().default(null),
  footprint: z.array(LatLonSchema).nullable().default(null),
  status: CanvassStatusSchema,
  notes: z.string().default(''),
  lastVisitedAt: z.number().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Location = z.infer<typeof LocationSchema>

export const TrackSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  label: z.string().min(1),
  kind: z.enum(['person', 'vehicle']).default('person'),
  // When set to a CSS hex color (e.g. #2563eb), routes and pins use it; empty string uses the default palette.
  routeColor: z.string().default(''),
  createdAt: z.number(),
})
export type Track = z.infer<typeof TrackSchema>

export const TrackPointSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  trackId: z.string(),
  // Linked location so list/drawer can show context.
  // Note: each "mark visited" creates a new TrackPoint event (supports revisits/turnarounds).
  locationId: z.string().nullable().default(null),
  addressText: z.string().min(1),
  lat: z.number(),
  lon: z.number(),
  // Order along a track (0, 1, 2…). Distinct from visitedAt so path order stays stable.
  sequence: z.number().int().default(0),
  // When the subject was at this point (observation time), if known — not auto-filled with “now”.
  visitedAt: z.number().nullable().default(null),
  notes: z.string().default(''),
  // If false, the point stays in the step list but is omitted from paths and numbered pins on the map.
  showOnMap: z.boolean().default(true),
  // When true and visitedAt is set, show that time on the map beside this point.
  displayTimeOnMap: z.boolean().default(false),
  // Pixel offset for that time label relative to the default spot next to the pin.
  mapTimeLabelOffsetX: z.number().int().default(0),
  mapTimeLabelOffsetY: z.number().int().default(0),
  createdAt: z.number(),
})
export type TrackPoint = z.infer<typeof TrackPointSchema>

export const CaseSchema = z.object({
  id: z.string(),
  caseNumber: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type CaseFile = z.infer<typeof CaseSchema>

export const AppDataSchema = z.object({
  version: z.literal(1),
  cases: z.array(CaseSchema),
  locations: z.array(LocationSchema),
  tracks: z.array(TrackSchema).default([]),
  trackPoints: z.array(TrackPointSchema).default([]),
})
export type AppData = z.infer<typeof AppDataSchema>

export const DEFAULT_DATA: AppData = {
  version: 1,
  cases: [],
  locations: [],
  tracks: [],
  trackPoints: [],
}

export function statusLabel(s: CanvassStatus): string {
  switch (s) {
    case 'noCameras':
      return 'No cameras'
    case 'camerasNoAnswer':
      return 'Cameras, no answer'
    case 'notProbativeFootage':
      return 'Not probative footage'
    case 'probativeFootage':
      return 'Probative footage'
  }
}

export function statusColor(s: CanvassStatus): string {
  switch (s) {
    case 'noCameras':
      return '#3b82f6' // blue
    case 'camerasNoAnswer':
      return '#fbbf24' // yellow
    case 'notProbativeFootage':
      return '#ef4444' // red
    case 'probativeFootage':
      return '#22c55e' // green
  }
}

