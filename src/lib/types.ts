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
  createdByUserId: z.string().default(''),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Location = z.infer<typeof LocationSchema>

export const TrackSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  label: z.string().min(1),
  kind: z.enum(['person', 'vehicle', 'other']).default('person'),
  // When set to a CSS hex color (e.g. #2563eb), routes and pins use it; empty string uses the default palette.
  routeColor: z.string().default(''),
  createdByUserId: z.string().default(''),
  createdAt: z.number(),
  /** Last metadata edit (label/kind/color); defaults to createdAt for legacy rows. Used for sync merge. */
  updatedAt: z.number().optional(),
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
  /** `map` = subject tracking (tap on map); `import` = coordinate spreadsheet / paste import. */
  placementSource: z.enum(['map', 'import']).default('map'),
  createdByUserId: z.string().default(''),
  createdAt: z.number(),
  /** Bump on every edit; used for merge (createdAt alone stays fixed after create). */
  updatedAt: z.number().optional(),
})
export type TrackPoint = z.infer<typeof TrackPointSchema>

const CaseLifecycleSchema = z.enum(['open', 'closed'])

export const CaseSchema = z.object({
  id: z.string(),
  ownerUserId: z.string().default(''),
  /** Optional org scope (UUID) when using relational backend. */
  organizationId: z.string().nullable().optional().default(null),
  /** When set, unit members may view the case without an explicit collaborator row. */
  unitId: z.string().nullable().optional().default(null),
  caseNumber: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** Open cases appear in default filters; closed is archival. */
  lifecycle: CaseLifecycleSchema.default('open'),
})
export type CaseFile = z.infer<typeof CaseSchema>

export const AppUserSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1),
  email: z.string().email(),
  taxNumber: z.string().min(1),
  createdAt: z.number(),
  /** Relational: from `vc_profiles.app_role`; absent in mock / legacy = standard user. */
  appRole: z.enum(['user', 'admin']).optional(),
})
export type AppUser = z.infer<typeof AppUserSchema>

export const CaseCollaboratorSchema = z.object({
  caseId: z.string(),
  userId: z.string(),
  role: z.enum(['viewer', 'editor']).default('viewer'),
  createdAt: z.number(),
})
export type CaseCollaborator = z.infer<typeof CaseCollaboratorSchema>

/** In-app reference images (e.g. suspect description, wanted flyer); stored as data URLs in the shared JSON payload. */
export const CaseAttachmentKindSchema = z.enum(['suspect_description', 'wanted_flyer', 'other'])
export type CaseAttachmentKind = z.infer<typeof CaseAttachmentKindSchema>

export const CaseAttachmentSchema = z
  .object({
    id: z.string(),
    caseId: z.string(),
    kind: CaseAttachmentKindSchema.default('other'),
    caption: z.string().default(''),
    /** data:image/…;base64,… — local / legacy; prefer `imageStoragePath` when using object storage. */
    imageDataUrl: z.string().default(''),
    /** Supabase Storage path inside bucket `case-attachments` (format `{caseId}/{attachmentId}`). */
    imageStoragePath: z.string().nullable().optional().default(null),
    contentType: z.string().default(''),
    createdByUserId: z.string().default(''),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .refine((a) => (a.imageDataUrl?.trim() ?? '').length > 0 || (a.imageStoragePath?.trim() ?? '').length > 0, {
    message: 'Attachment must have imageDataUrl or imageStoragePath',
    path: ['imageDataUrl'],
  })
export type CaseAttachment = z.infer<typeof CaseAttachmentSchema>

export const AppDataSchema = z.object({
  version: z.literal(1),
  cases: z.array(CaseSchema),
  locations: z.array(LocationSchema),
  tracks: z.array(TrackSchema).default([]),
  trackPoints: z.array(TrackPointSchema).default([]),
  users: z.array(AppUserSchema).default([]),
  caseCollaborators: z.array(CaseCollaboratorSchema).default([]),
  caseAttachments: z.array(CaseAttachmentSchema).default([]),
  /** IDs removed locally; kept so merge-with-remote cannot resurrect deleted rows from Supabase. */
  deletedCaseIds: z.array(z.string()).default([]),
  deletedLocationIds: z.array(z.string()).default([]),
  deletedTrackIds: z.array(z.string()).default([]),
  deletedTrackPointIds: z.array(z.string()).default([]),
  deletedCaseAttachmentIds: z.array(z.string()).default([]),
  /** `${caseId}::${userId}` — removed collaborators so merge/push cannot resurrect rows (case/user ids must not contain `::`). */
  deletedCaseCollaboratorKeys: z.array(z.string()).default([]),
  /**
   * Relational: unit ids the signed-in user belongs to (`vc_user_unit_members`), lowercased UUID strings.
   * Used with `CaseFile.unitId` so app routing matches `vc_case_visible` (unit-wide case access).
   */
  myUnitIds: z.array(z.string()).default([]),
})
export type AppData = z.infer<typeof AppDataSchema>

export const DEFAULT_DATA: AppData = {
  version: 1,
  cases: [],
  locations: [],
  tracks: [],
  trackPoints: [],
  users: [],
  caseCollaborators: [],
  caseAttachments: [],
  deletedCaseIds: [],
  deletedLocationIds: [],
  deletedTrackIds: [],
  deletedTrackPointIds: [],
  deletedCaseAttachmentIds: [],
  deletedCaseCollaboratorKeys: [],
  myUnitIds: [],
}

export function caseAttachmentKindLabel(k: CaseAttachmentKind): string {
  switch (k) {
    case 'suspect_description':
      return 'Suspect / description'
    case 'wanted_flyer':
      return 'Wanted flyer'
    case 'other':
      return 'Other'
  }
}

export function statusLabel(s: CanvassStatus): string {
  switch (s) {
    case 'noCameras':
      return 'No Cameras'
    case 'camerasNoAnswer':
      return 'Needs Follow Up'
    case 'notProbativeFootage':
      return 'Not Probative'
    case 'probativeFootage':
      return 'Probative Footage'
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

