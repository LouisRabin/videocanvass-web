import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Layout } from './Layout'
import { useStore } from '../lib/store'
import { caseQuickCounts } from '../lib/caseDashboard'
import { canEditCaseMeta } from '../lib/casePermissions'
import { Modal } from './Modal'
import type { AppData, AppUser, CaseFile } from '../lib/types'
import { formatAppDateTime } from '../lib/timeFormat'
import {
  CASE_DESCRIPTION_MAX_CHARS,
  CASE_META_INLINE_CONTROL_HEIGHT_PX,
  clampCaseDescription,
} from '../lib/caseMeta'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { relationalBackendEnabled } from '../lib/backendMode'
import { isMobileProximityClient } from '../lib/mobilePlatform'
import { ensureMobileProximityLocationPrefsOn } from '../lib/mobileProximityLocationPrefs'
import { getGeolocationPermissionState, requestCurrentPosition } from '../lib/geolocationRequest'
import { supabase } from '../lib/supabase'
import { appUserFromVcProfileRow, type VcProfileRow } from '../lib/relational/sync'
import { useTargetMode } from '../lib/targetMode'
import { useTour } from './tour/TourContext'
import { SHOW_TOUR_FIRST_RUN_PROMPT, TOUR_UI_ENABLED } from './tour/tourFlags'
import { readTourFlag, tourCasesDoneKey, TOUR_CASES_PROMPT_DISMISSED_KEY, writeTourFlag } from './tour/tourStorage'
import { VC_TOUR } from './tour/tourSteps'
import {
  vcGlassBtnPrimary,
  vcGlassBtnSecondary,
  vcGlassFgDarkReadable,
  vcGlassFgMetaOnContent,
  vcGlassFgMutedOnPanel,
  vcGlassFgSecondaryOnContent,
  vcGlassFieldOnContentSurface,
  vcGlassHeaderBtn,
  vcGlassHeaderBtnPrimary,
  vcLiquidGlassInnerSurface,
} from '../lib/vcLiquidGlass'

/** App role as rank until a dedicated profile rank field exists. */
function casesPageIdentitySubtitle(u: AppUser): string {
  const rank = u.appRole === 'admin' ? 'Admin' : 'Staff'
  const id = u.taxNumber.trim()
  return id ? `${rank} · ${u.displayName} · ${id}` : `${rank} · ${u.displayName}`
}

function TeamSearchPersonGlyph(props: { size?: number }) {
  const s = props.size ?? 18
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0, color: '#64748b' }}>
      <path
        fill="currentColor"
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
      />
    </svg>
  )
}

function TeamSearchUnitGlyph(props: { size?: number }) {
  const s = props.size ?? 18
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0, color: '#0d9488' }}>
      <path
        fill="currentColor"
        d="M4 21V9l8-4 8 4v12h-5v-7H9v7H4zm9 0v-6h2v6h-2z"
      />
    </svg>
  )
}

type UnitSearchRow = { id: string; name: string; code: string }

function TeamMembersModalBody(props: {
  caseId: string
  data: AppData
  onAdd: (input: { collaboratorUserId: string; collaboratorProfile: AppUser }) => Promise<void> | void
  onAddMany: (items: { collaboratorUserId: string; collaboratorProfile: AppUser }[]) => Promise<void> | void
  onRemove: (collaboratorUserId: string) => void
}) {
  const showMobileNearby = isMobileProximityClient() && relationalBackendEnabled()
  const [nearbyRows, setNearbyRows] = useState<VcProfileRow[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [nearbyErr, setNearbyErr] = useState<string | null>(null)
  const [nearbyRadiusM, setNearbyRadiusM] = useState(500)
  const [nearbyDistances, setNearbyDistances] = useState<Record<string, number>>({})
  const [nearbyHadSuccessfulSearch, setNearbyHadSuccessfulSearch] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [profileResults, setProfileResults] = useState<VcProfileRow[]>([])
  const [unitResults, setUnitResults] = useState<UnitSearchRow[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [pickedProfile, setPickedProfile] = useState<AppUser | null>(null)
  const [expandedUnit, setExpandedUnit] = useState<UnitSearchRow | null>(null)
  const [unitMembers, setUnitMembers] = useState<VcProfileRow[]>([])
  const [unitMembersLoading, setUnitMembersLoading] = useState(false)
  const [unitMembersError, setUnitMembersError] = useState<string | null>(null)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])

  const c = props.data.cases.find((x) => x.id === props.caseId)
  const members = c ? props.data.caseCollaborators.filter((cc) => cc.caseId === props.caseId) : []

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setProfileResults([])
      setUnitResults([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }
    const caseRow = props.data.cases.find((x) => x.id === props.caseId)
    const memberIds = caseRow
      ? props.data.caseCollaborators.filter((cc) => cc.caseId === props.caseId).map((m) => m.userId)
      : []
    const eligibleLocal = caseRow
      ? props.data.users.filter((u) => u.id !== caseRow.ownerUserId && !memberIds.includes(u.id))
      : []

    let cancelled = false
    const t = window.setTimeout(() => {
      void (async () => {
        setSearchLoading(true)
        setSearchError(null)
        try {
          if (relationalBackendEnabled() && supabase) {
            const [profRes, unitRes] = await Promise.all([
              supabase.rpc('vc_search_profiles_for_case_team', {
                p_case_id: props.caseId,
                p_query: q,
              }),
              supabase.rpc('vc_search_units_for_case_team', {
                p_case_id: props.caseId,
                p_query: q,
              }),
            ])
            if (cancelled) return
            if (profRes.error) throw profRes.error
            if (unitRes.error) throw unitRes.error
            const rows = (profRes.data ?? []) as VcProfileRow[]
            setProfileResults(rows.map((r) => ({ ...r, id: String(r.id) })))
            const urows = (unitRes.data ?? []) as { id: string; name: string; code: string }[]
            setUnitResults(urows.map((r) => ({ ...r, id: String(r.id) })))
          } else {
            const ql = q.toLowerCase()
            const filtered = eligibleLocal
              .filter(
                (u) =>
                  u.email.toLowerCase().includes(ql) ||
                  (u.taxNumber && u.taxNumber.toLowerCase().includes(ql)),
              )
              .slice(0, 20)
            if (cancelled) return
            setProfileResults(
              filtered.map((u) => ({
                id: u.id,
                display_name: u.displayName,
                email: u.email,
                tax_number: u.taxNumber,
                created_at: new Date(u.createdAt).toISOString(),
              })),
            )
            setUnitResults([])
          }
        } catch (e) {
          if (!cancelled) setSearchError(e instanceof Error ? e.message : 'Search failed')
        } finally {
          if (!cancelled) setSearchLoading(false)
        }
      })()
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [searchQuery, props.caseId, props.data])

  useEffect(() => {
    if (!expandedUnit) {
      setUnitMembers([])
      setUnitMembersLoading(false)
      setUnitMembersError(null)
      return
    }
    if (!relationalBackendEnabled() || !supabase) {
      setUnitMembers([])
      setUnitMembersLoading(false)
      setUnitMembersError(null)
      return
    }
    let cancelled = false
    setUnitMembersLoading(true)
    setUnitMembersError(null)
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('vc_unit_member_profiles_for_case_team', {
          p_case_id: props.caseId,
          p_unit_id: expandedUnit.id,
        })
        if (cancelled) return
        if (error) throw error
        const rows = (data ?? []) as VcProfileRow[]
        setUnitMembers(rows.map((r) => ({ ...r, id: String(r.id) })))
      } catch (e) {
        if (!cancelled) setUnitMembersError(e instanceof Error ? e.message : 'Failed to load unit members')
      } finally {
        if (!cancelled) setUnitMembersLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [expandedUnit, props.caseId])

  const clearSearchAfterAdd = () => {
    setPickedProfile(null)
    setSearchQuery('')
    setProfileResults([])
    setUnitResults([])
    setExpandedUnit(null)
    setUnitMembers([])
    setSelectedMemberIds([])
  }

  const toggleMemberSelect = (id: string) => {
    setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const addManyFromRows = (rows: VcProfileRow[]) => {
    const items = rows.map((row) => ({
      collaboratorUserId: row.id,
      collaboratorProfile: appUserFromVcProfileRow(row),
    }))
    return Promise.resolve(props.onAddMany(items)).then(() => {
      const added = new Set(items.map((i) => i.collaboratorUserId))
      setUnitMembers((prev) => prev.filter((m) => !added.has(m.id)))
      setSelectedMemberIds((prev) => prev.filter((id) => !added.has(id)))
    })
  }

  if (!c) return <div style={{ color: vcGlassFgSecondaryOnContent }}>Case not found.</div>

  const hasHits = unitResults.length > 0 || profileResults.length > 0

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: vcGlassFgMetaOnContent, lineHeight: 1.45 }}>
        Detectives listed here can open this case and contribute. No invitation or acceptance step.
      </p>
      {members.length === 0 ? (
        <div style={{ color: vcGlassFgSecondaryOnContent, fontSize: 13 }}>No team members yet.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {members.map((m) => {
            const u = props.data.users.find((x) => x.id === m.userId)
            return (
              <li key={m.userId} style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>{u?.displayName ?? m.userId}</span>
                <span style={{ color: vcGlassFgSecondaryOnContent }}> · {u?.taxNumber ?? ''}</span>
                <button
                  type="button"
                  style={{ ...btn, marginLeft: 8, padding: '4px 8px', fontSize: 12 }}
                  onClick={() => props.onRemove(m.userId)}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>Add member</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setPickedProfile(null)
            setExpandedUnit(null)
            setSelectedMemberIds([])
          }}
          placeholder="Search by email, tax number, or unit code…"
          style={field}
          autoComplete="off"
        />
        {searchLoading ? (
          <div style={{ fontSize: 12, color: vcGlassFgMetaOnContent }}>Searching…</div>
        ) : null}
        {searchError ? (
          <div style={{ fontSize: 12, color: '#b91c1c' }}>{searchError}</div>
        ) : null}
        {!searchLoading && searchQuery.trim().length >= 2 && !hasHits && !searchError ? (
          <div style={{ fontSize: 12, color: vcGlassFgSecondaryOnContent }}>No matches.</div>
        ) : null}
        {hasHits ? (
          <div
            role="listbox"
            aria-label="Search results"
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              border: '1px solid rgba(148, 163, 184, 0.45)',
              borderRadius: 10,
              padding: 4,
              display: 'grid',
              gap: 4,
            }}
          >
            {unitResults.map((unit) => {
              const expanded = expandedUnit?.id === unit.id
              const codeT = (unit.code ?? '').trim()
              const line = codeT ? `${codeT} · ${unit.name}` : unit.name
              return (
                <button
                  key={`unit-${unit.id}`}
                  type="button"
                  role="option"
                  aria-expanded={expanded}
                  onClick={() => {
                    setPickedProfile(null)
                    setExpandedUnit((prev) => (prev?.id === unit.id ? null : unit))
                    setSelectedMemberIds([])
                  }}
                  style={{
                    ...btn,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    borderWidth: 1,
                    background: expanded ? 'rgba(13, 148, 136, 0.1)' : undefined,
                    borderColor: expanded ? 'rgba(13, 148, 136, 0.45)' : undefined,
                    minWidth: 0,
                  }}
                >
                  <TeamSearchUnitGlyph />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {line}
                  </span>
                </button>
              )
            })}
            {profileResults.map((row) => {
              const user = appUserFromVcProfileRow(row)
              const selected = pickedProfile?.id === user.id
              const name = row.display_name?.trim() || user.displayName
              const emailFull = (row.email ?? '').trim() || '—'
              const taxFull = (row.tax_number ?? '').trim() || '—'
              const line = `${name} · ${emailFull} · ${taxFull}`
              return (
                <button
                  key={`person-${row.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setExpandedUnit(null)
                    setSelectedMemberIds([])
                    setPickedProfile(user)
                  }}
                  style={{
                    ...btn,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    borderWidth: 1,
                    background: selected ? 'rgba(59, 130, 246, 0.12)' : undefined,
                    borderColor: selected ? 'rgba(59, 130, 246, 0.45)' : undefined,
                    minWidth: 0,
                  }}
                >
                  <TeamSearchPersonGlyph />
                  <span
                    style={{
                      fontSize: 13,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {line}
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}
        {expandedUnit ? (
          <div
            style={{
              border: '1px solid rgba(13, 148, 136, 0.35)',
              borderRadius: 10,
              padding: 10,
              display: 'grid',
              gap: 8,
              background: 'rgba(13, 148, 136, 0.06)',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 13 }}>
              People in unit {(expandedUnit.code ?? '').trim() || expandedUnit.name}
            </div>
            {unitMembersLoading ? (
              <div style={{ fontSize: 12, color: vcGlassFgMetaOnContent }}>Loading members…</div>
            ) : null}
            {unitMembersError ? (
              <div style={{ fontSize: 12, color: '#b91c1c' }}>{unitMembersError}</div>
            ) : null}
            {!unitMembersLoading && !unitMembersError && unitMembers.length === 0 ? (
              <div style={{ fontSize: 12, color: vcGlassFgSecondaryOnContent }}>
                No one to add (everyone may already be on the case, or the unit is empty).
              </div>
            ) : null}
            {unitMembers.length > 0 ? (
              <div
                style={{
                  maxHeight: 200,
                  overflowY: 'auto',
                  display: 'grid',
                  gap: 4,
                }}
              >
                {unitMembers.map((row) => {
                  const u = appUserFromVcProfileRow(row)
                  const name = row.display_name?.trim() || u.displayName
                  const emailFull = (row.email ?? '').trim() || '—'
                  const taxFull = (row.tax_number ?? '').trim() || '—'
                  const line = `${name} · ${emailFull} · ${taxFull}`
                  const checked = selectedMemberIds.includes(row.id)
                  return (
                    <label
                      key={row.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        cursor: 'pointer',
                        minWidth: 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMemberSelect(row.id)}
                        style={{ flexShrink: 0 }}
                      />
                      <span
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {line}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : null}
            {unitMembers.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={selectedMemberIds.length === 0}
                  onClick={() => {
                    const rows = unitMembers.filter((m) => selectedMemberIds.includes(m.id))
                    if (rows.length === 0) return
                    void addManyFromRows(rows)
                  }}
                >
                  Add selected
                </button>
                <button
                  type="button"
                  style={btn}
                  onClick={() => void addManyFromRows(unitMembers)}
                >
                  Add all
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {showMobileNearby ? (
          <div
            style={{
              borderTop: '1px solid rgba(148, 163, 184, 0.35)',
              paddingTop: 10,
              display: 'grid',
              gap: 8,
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 13 }}>Nearby (this device)</span>
            <p style={{ margin: 0, fontSize: 12, color: vcGlassFgMetaOnContent, lineHeight: 1.45 }}>
              Find teammates who have team location sharing enabled. Uses your current position.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Radius (m)</span>
              <input
                type="number"
                min={25}
                max={2000}
                step={25}
                value={nearbyRadiusM}
                onChange={(e) => setNearbyRadiusM(Number(e.target.value) || 500)}
                style={{ ...field, maxWidth: 96 }}
              />
              <button
                type="button"
                style={btn}
                disabled={nearbyLoading || !supabase}
                onClick={() => {
                  if (!supabase) return
                  setNearbyLoading(true)
                  setNearbyErr(null)
                  setNearbyHadSuccessfulSearch(false)
                  void (async () => {
                    const pos = await requestCurrentPosition({
                      enableHighAccuracy: true,
                      timeout: 20_000,
                      maximumAge: 60_000,
                    })
                    if (!pos.ok) {
                      setNearbyErr('Location is required for nearby search.')
                      setNearbyLoading(false)
                      setNearbyHadSuccessfulSearch(false)
                      return
                    }
                    const lat = pos.position.coords.latitude
                    const lng = pos.position.coords.longitude
                    const acc = pos.position.coords.accuracy
                    const { data: pref } = await supabase
                      .from('vc_profile_location_prefs')
                      .select('proximity_invite_listen')
                      .maybeSingle()
                    const listen =
                      ((pref as { proximity_invite_listen?: boolean } | null)?.proximity_invite_listen) ?? true
                    await supabase.rpc('vc_update_my_location_prefs', {
                      p_team_discovery_sharing: true,
                      p_proximity_invite_listen: listen,
                      p_lat: lat,
                      p_lng: lng,
                      p_accuracy_m: acc ?? null,
                    })
                    const { data, error } = await supabase.rpc('vc_nearby_profiles_team_discovery', {
                      p_case_id: props.caseId,
                      p_lat: lat,
                      p_lng: lng,
                      p_radius_m: nearbyRadiusM,
                    })
                    setNearbyLoading(false)
                    if (error) {
                      setNearbyErr(error.message)
                      setNearbyRows([])
                      setNearbyDistances({})
                      setNearbyHadSuccessfulSearch(false)
                      return
                    }
                    const rows = (data ?? []) as Array<
                      VcProfileRow & {
                        distance_m?: number
                      }
                    >
                    const dist: Record<string, number> = {}
                    const clean: VcProfileRow[] = rows.map((r) => {
                      dist[String(r.id)] = typeof r.distance_m === 'number' ? r.distance_m : NaN
                      const { distance_m: _, ...rest } = r as VcProfileRow & { distance_m?: number }
                      return rest as VcProfileRow
                    })
                    setNearbyDistances(dist)
                    setNearbyRows(clean)
                    setNearbyHadSuccessfulSearch(true)
                  })()
                }}
              >
                {nearbyLoading ? 'Searching…' : 'Find nearby'}
              </button>
            </div>
            {nearbyErr ? (
              <div style={{ fontSize: 12, color: '#b91c1c' }}>{nearbyErr}</div>
            ) : null}
            {nearbyRows.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {nearbyRows.map((row) => {
                  const u = appUserFromVcProfileRow(row)
                  const d = nearbyDistances[String(row.id)]
                  const dLabel = Number.isFinite(d) ? `~${Math.round(d)} m` : ''
                  return (
                    <li key={row.id} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 700 }}>{row.display_name?.trim() || u.displayName}</span>
                      {dLabel ? <span style={{ color: vcGlassFgSecondaryOnContent }}> · {dLabel}</span> : null}
                      <button
                        type="button"
                        style={{ ...btn, marginLeft: 8, padding: '4px 8px', fontSize: 12 }}
                        onClick={() =>
                          void Promise.resolve(
                            props.onAdd({ collaboratorUserId: String(row.id), collaboratorProfile: u }),
                          ).then(clearSearchAfterAdd)
                        }
                      >
                        Add
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
            {nearbyHadSuccessfulSearch && nearbyRows.length === 0 && !nearbyLoading ? (
              <div style={{ fontSize: 12, color: vcGlassFgSecondaryOnContent }}>No one in range yet.</div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          style={btnPrimary}
          disabled={!pickedProfile}
          onClick={() => {
            if (!pickedProfile) return
            void Promise.resolve(
              props.onAdd({ collaboratorUserId: pickedProfile.id, collaboratorProfile: pickedProfile }),
            ).then(clearSearchAfterAdd)
          }}
        >
          Add to case
        </button>
      </div>
    </div>
  )
}

type ListTab = 'mine' | 'team'

export function CasesPage(props: {
  onOpenCase: (caseId: string) => void
  currentUser: AppUser
  onLogout: () => void
  onOpenAdminGlobal?: () => void
}) {
  const tourTargetMode = useTargetMode()
  const { startTour, tourOpen } = useTour()
  const [showCasesTourBanner, setShowCasesTourBanner] = useState(false)

  useEffect(() => {
    if (!TOUR_UI_ENABLED || !SHOW_TOUR_FIRST_RUN_PROMPT) return
    if (readTourFlag(tourCasesDoneKey(tourTargetMode))) return
    if (readTourFlag(TOUR_CASES_PROMPT_DISMISSED_KEY)) return
    setShowCasesTourBanner(true)
  }, [tourTargetMode])

  const {
    ready,
    data,
    createCase,
    deleteCase,
    updateCase,
    addCaseCollaborator,
    addCaseCollaborators,
    removeCaseCollaborator,
    reconcileWithRemote,
  } = useStore()
  const [listTab, setListTab] = useState<ListTab>('mine')
  const [showNewCaseForm, setShowNewCaseForm] = useState(false)
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [baselineName, setBaselineName] = useState('')
  const [baselineDesc, setBaselineDesc] = useState('')
  const [newCaseName, setNewCaseName] = useState('')
  const [newCaseDescription, setNewCaseDescription] = useState('')
  const [teamModalCaseId, setTeamModalCaseId] = useState<string | null>(null)
  /** Mobile (native + mobile web): join-by-proximity when creating a case */
  const [allowProximityJoin, setAllowProximityJoin] = useState(false)
  const [proximityRadiusM, setProximityRadiusM] = useState(400)
  const [proximityAnchor, setProximityAnchor] = useState<{ lat: number; lng: number } | null>(null)
  const [proximityAnchorLoading, setProximityAnchorLoading] = useState(false)
  const [manualInviteCheckLoading, setManualInviteCheckLoading] = useState(false)
  const [manualInviteCheckBanner, setManualInviteCheckBanner] = useState<string | null>(null)
  const [manualInviteModal, setManualInviteModal] = useState<{
    caseId: string
    caseTitle: string
    creatorName: string
    lat: number
    lng: number
    totalNearby: number
  } | null>(null)
  const isNarrow = useMediaQuery(MOBILE_BREAKPOINT_QUERY)

  const mineCases = useMemo(
    () => data.cases.filter((c) => c.ownerUserId === props.currentUser.id),
    [data.cases, props.currentUser.id],
  )

  const teamMemberCases = useMemo(() => {
    const uid = props.currentUser.id
    return data.cases.filter((c) => {
      if (data.caseCollaborators.some((cc) => cc.caseId === c.id && cc.userId === uid)) return true
      const u = (c.unitId ?? '').trim().toLowerCase()
      if (!u) return false
      return data.myUnitIds.some((x) => x.trim().toLowerCase() === u)
    })
  }, [data.cases, data.caseCollaborators, data.myUnitIds, props.currentUser.id])

  const [lifecycleFilter, setLifecycleFilter] = useState<'open' | 'closed'>('open')

  const filtered = useMemo(() => {
    const base = listTab === 'mine' ? mineCases : teamMemberCases
    return lifecycleFilter === 'open'
      ? base.filter((c) => c.lifecycle !== 'closed')
      : base.filter((c) => c.lifecycle === 'closed')
  }, [listTab, mineCases, teamMemberCases, lifecycleFilter])

  const beginEditCase = useCallback((row: CaseFile) => {
    setEditingCaseId(row.id)
    setBaselineName(row.caseNumber)
    const d = row.description ?? ''
    setBaselineDesc(clampCaseDescription(d))
    setDraftName(row.caseNumber)
    setDraftDesc(clampCaseDescription(d))
  }, [])

  const discardEditCase = useCallback(() => {
    setDraftName(baselineName)
    setDraftDesc(baselineDesc)
    setEditingCaseId(null)
  }, [baselineName, baselineDesc])

  const saveEditCase = useCallback(() => {
    if (!editingCaseId) return
    const name = draftName.trim() || baselineName
    void updateCase(props.currentUser.id, editingCaseId, {
      caseNumber: name,
      title: name,
      description: clampCaseDescription(draftDesc.trim()),
    })
    setEditingCaseId(null)
  }, [editingCaseId, draftName, draftDesc, baselineName, props.currentUser.id, updateCase])

  useEffect(() => {
    if (!isMobileProximityClient() || !relationalBackendEnabled()) return
    void ensureMobileProximityLocationPrefsOn()
  }, [])

  const runManualProximityInviteCheck = useCallback(async () => {
    if (!relationalBackendEnabled() || !supabase) return
    await ensureMobileProximityLocationPrefsOn()
    setManualInviteCheckBanner(null)
    setManualInviteModal(null)
    setManualInviteCheckLoading(true)
    try {
      const perm = await getGeolocationPermissionState()
      if (perm === 'denied') {
        setManualInviteCheckBanner('Location permission is off. Turn it on in settings to search for nearby invites.')
        return
      }
      const pos = await requestCurrentPosition({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 })
      if (!pos.ok) {
        setManualInviteCheckBanner(
          pos.code === 'denied'
            ? 'Location permission is required.'
            : 'Could not read your location. Try again outdoors or with location services on.',
        )
        return
      }
      const lat = pos.position.coords.latitude
      const lng = pos.position.coords.longitude
      const { data: rows, error } = await supabase.rpc('vc_active_proximity_invites_at', {
        p_lat: lat,
        p_lng: lng,
      })
      if (error) {
        setManualInviteCheckBanner(error.message)
        return
      }
      const list = (rows ?? []) as Array<{
        case_id: string
        case_title: string
        creator_display_name: string
        creator_user_id: string
        distance_m: number
      }>
      if (list.length === 0) {
        setManualInviteCheckBanner('No join-by-proximity invites near your location right now.')
        return
      }
      const r = list[0]
      if (!r) return
      setManualInviteModal({
        caseId: r.case_id,
        caseTitle: r.case_title,
        creatorName: r.creator_display_name,
        lat,
        lng,
        totalNearby: list.length,
      })
    } finally {
      setManualInviteCheckLoading(false)
    }
  }, [])

  const onManualProximityInviteJoin = useCallback(async () => {
    const m = manualInviteModal
    if (!m || !supabase) return
    const { data, error } = await supabase.rpc('vc_accept_proximity_case_invite', {
      p_case_id: m.caseId,
      p_lat: m.lat,
      p_lng: m.lng,
    })
    setManualInviteModal(null)
    if (error) {
      console.warn('vc_accept_proximity_case_invite', error.message)
      setManualInviteCheckBanner(error.message)
      return
    }
    if (data === true) {
      await reconcileWithRemote()
    }
  }, [manualInviteModal, reconcileWithRemote])

  async function onCreateCaseFromForm() {
    const caseName = newCaseName.trim()
    if (!caseName) return
    const id = await createCase({
      ownerUserId: props.currentUser.id,
      caseName,
      description: clampCaseDescription(newCaseDescription.trim()),
      proximityInvite:
        isMobileProximityClient() &&
        relationalBackendEnabled() &&
        allowProximityJoin &&
        proximityAnchor
          ? { centerLat: proximityAnchor.lat, centerLng: proximityAnchor.lng, radiusM: proximityRadiusM }
          : undefined,
    })
    setNewCaseName('')
    setNewCaseDescription('')
    setAllowProximityJoin(false)
    setProximityAnchor(null)
    setProximityRadiusM(400)
    setShowNewCaseForm(false)
    props.onOpenCase(id)
  }

  const handleCaseRowEnter = useCallback(
    (c: CaseFile) => {
      if (c.lifecycle === 'closed' && canEditCaseMeta(data, c.id, props.currentUser.id)) {
        void updateCase(props.currentUser.id, c.id, { lifecycle: 'open' }).then(() => props.onOpenCase(c.id))
        return
      }
      props.onOpenCase(c.id)
    },
    [data, props.currentUser.id, props.onOpenCase, updateCase],
  )

  const caseRowEnterLabel = useCallback(
    (c: CaseFile) =>
      c.lifecycle === 'closed' && canEditCaseMeta(data, c.id, props.currentUser.id) ? 'Reopen' : 'Open',
    [data, props.currentUser.id],
  )

  const renderCaseQuickCountsBlock = useCallback(
    (c: CaseFile) => {
      const q = caseQuickCounts(data, c.id)
      const canLifecycle = canEditCaseMeta(data, c.id, props.currentUser.id)
      const mineClosedFooter =
        listTab === 'mine' && c.lifecycle === 'closed' ? (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexShrink: 0,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              aria-label="Delete case"
              title="Delete case"
              onClick={() => {
                setEditingCaseId((id) => (id === c.id ? null : id))
                void deleteCase(props.currentUser.id, c.id)
              }}
              style={caseCardDeleteIconBtn}
            >
              ×
            </button>
            <button
              type="button"
              style={{ ...btn, fontSize: 11, padding: '4px 8px', flexShrink: 0 }}
              onClick={() => handleCaseRowEnter(c)}
            >
              {caseRowEnterLabel(c)}
            </button>
          </div>
        ) : null
      const lifecycleBtn =
        !(listTab === 'mine' && c.lifecycle === 'closed') && canLifecycle ? (
          <button
            type="button"
            style={{ ...btn, fontSize: 11, padding: '4px 8px', flexShrink: 0 }}
            onClick={() =>
              void updateCase(props.currentUser.id, c.id, {
                lifecycle: c.lifecycle === 'closed' ? 'open' : 'closed',
              })
            }
          >
            {c.lifecycle === 'closed' ? 'Reopen' : 'Close case'}
          </button>
        ) : null
      return (
        <div
          style={{
            ...caseListMetaCounts,
            marginTop: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          <span style={{ minWidth: 0 }}>
            {q.locations} locations · {q.attachments} attachments · {q.tracks} tracks
          </span>
          {mineClosedFooter ?? lifecycleBtn}
        </div>
      )
    },
    [data, props.currentUser.id, updateCase, listTab, handleCaseRowEnter, caseRowEnterLabel, deleteCase],
  )

  return (
    <Layout
      mainScroll="hidden"
      title="Cases"
      subtitle={
        <span
          style={{
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {casesPageIdentitySubtitle(props.currentUser)}
        </span>
      }
      right={
        <div
          data-vc-tour={VC_TOUR.casesActions}
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0, maxWidth: '100%' }}
        >
          {TOUR_UI_ENABLED ? (
            <button type="button" onClick={() => startTour('cases')} style={vcGlassHeaderBtn} disabled={tourOpen}>
              Tour
            </button>
          ) : null}
          {props.onOpenAdminGlobal ? (
            <button type="button" onClick={props.onOpenAdminGlobal} style={vcGlassHeaderBtn}>
              Global results
            </button>
          ) : null}
          <button onClick={props.onLogout} style={vcGlassHeaderBtn}>
            Sign out
          </button>
        </div>
      }
    >
      {!ready ? (
        <div style={{ color: vcGlassFgMutedOnPanel }}>Loading…</div>
      ) : (
        <div
          style={{
            minWidth: 0,
            maxWidth: '100%',
            overflowX: 'hidden',
            boxSizing: 'border-box',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {TOUR_UI_ENABLED && showCasesTourBanner ? (
            <div
              style={{
                marginBottom: 12,
                padding: '12px 14px',
                ...vcLiquidGlassInnerSurface,
                borderRadius: 14,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'center',
                justifyContent: 'space-between',
                color: vcGlassFgDarkReadable,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>New here? Take a quick tour of the case list.</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={vcGlassBtnPrimary}
                  onClick={() => {
                    setShowCasesTourBanner(false)
                    startTour('cases')
                  }}
                >
                  Start tour
                </button>
                <button
                  type="button"
                  style={vcGlassBtnSecondary}
                  onClick={() => {
                    writeTourFlag(TOUR_CASES_PROMPT_DISMISSED_KEY, true)
                    setShowCasesTourBanner(false)
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
          {isMobileProximityClient() && relationalBackendEnabled() ? (
            <div
              style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 12,
                ...vcLiquidGlassInnerSurface,
                display: 'grid',
                gap: 10,
                maxWidth: '100%',
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13, color: vcGlassFgDarkReadable }}>Nearby invites</div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: vcGlassFgMetaOnContent, lineHeight: 1.45 }}>
                Team discovery and proximity invites use your location when you search or join. We keep those on so
                teammates can find you and you can see invites while VideoCanvass is open.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  style={vcGlassBtnPrimary}
                  disabled={manualInviteCheckLoading}
                  onClick={() => void runManualProximityInviteCheck()}
                >
                  {manualInviteCheckLoading ? 'Checking…' : 'Check for nearby invites'}
                </button>
              </div>
              {manualInviteCheckBanner ? (
                <div style={{ fontSize: 12, fontWeight: 600, color: vcGlassFgSecondaryOnContent, lineHeight: 1.45 }}>
                  {manualInviteCheckBanner}
                </div>
              ) : null}
            </div>
          ) : null}
          <div
            data-vc-tour={VC_TOUR.casesTabsSearch}
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              rowGap: 8,
              minWidth: 0,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
                minWidth: 0,
                flex: '1 1 160px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setListTab(listTab === 'mine' ? 'team' : 'mine')
                  setEditingCaseId(null)
                }}
                style={{
                  ...vcGlassHeaderBtn,
                  fontWeight: 700,
                  background: 'rgba(255,255,255,0.16)',
                  whiteSpace: 'nowrap',
                }}
              >
                {listTab === 'mine' ? 'Team Cases' : 'My Cases'}
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginLeft: 'auto',
                flex: '0 1 auto',
                minWidth: 0,
              }}
            >
              <button
                type="button"
                onClick={() => setShowNewCaseForm(true)}
                style={{
                  ...vcGlassHeaderBtnPrimary,
                  flexShrink: 0,
                  ...(isNarrow
                    ? { padding: '6px 10px', fontSize: 12, fontWeight: 800 }
                    : { whiteSpace: 'nowrap' }),
                }}
              >
                {isNarrow ? '+ New' : '+ New case'}
              </button>
              <label
                style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontWeight: 700, color: vcGlassFgMutedOnPanel }}>Status</span>
                <select
                  value={lifecycleFilter}
                  onChange={(e) => setLifecycleFilter(e.target.value as 'open' | 'closed')}
                  style={{
                    ...filterSelect,
                    ...(isNarrow ? { padding: '5px 6px', fontSize: 13, maxWidth: 120 } : {}),
                  }}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
          <Modal
            title="Create case"
            open={showNewCaseForm}
            onClose={() => {
              setShowNewCaseForm(false)
              setNewCaseName('')
              setNewCaseDescription('')
              setAllowProximityJoin(false)
              setProximityAnchor(null)
              setProximityRadiusM(400)
            }}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div style={label}>Case name</div>
                <input
                  autoFocus
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  placeholder="Required"
                  style={field}
                />
              </div>
              <div>
                <div style={label}>Description (optional)</div>
                <textarea
                  value={newCaseDescription}
                  maxLength={CASE_DESCRIPTION_MAX_CHARS}
                  onChange={(e) => setNewCaseDescription(e.target.value)}
                  placeholder="Short description"
                  style={newCaseDescTextarea}
                />
              </div>
              {isMobileProximityClient() && relationalBackendEnabled() ? (
                <div
                  style={{
                    ...vcLiquidGlassInnerSurface,
                    padding: 12,
                    borderRadius: 12,
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, fontWeight: 700, color: vcGlassFgDarkReadable, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allowProximityJoin}
                      onChange={(e) => setAllowProximityJoin(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span>Allow join by proximity (30 minutes — others nearby can join this case)</span>
                  </label>
                  {allowProximityJoin ? (
                    <>
                      <div style={{ fontSize: 12, color: vcGlassFgMetaOnContent, lineHeight: 1.45 }}>
                        Set the area where teammates can see the invite. Uses this device&apos;s location as the center.
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>Radius (m)</span>
                        <input
                          type="number"
                          min={25}
                          max={10000}
                          step={25}
                          value={proximityRadiusM}
                          onChange={(e) => setProximityRadiusM(Number(e.target.value) || 400)}
                          style={{ ...field, maxWidth: 100 }}
                        />
                        <button
                          type="button"
                          style={btn}
                          disabled={proximityAnchorLoading}
                          onClick={() => {
                            setProximityAnchorLoading(true)
                            void requestCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }).then((r) => {
                              setProximityAnchorLoading(false)
                              if (r.ok) {
                                setProximityAnchor({
                                  lat: r.position.coords.latitude,
                                  lng: r.position.coords.longitude,
                                })
                              }
                            })
                          }}
                        >
                          {proximityAnchorLoading ? 'Getting location…' : 'Use current location'}
                        </button>
                      </div>
                      {proximityAnchor ? (
                        <div style={{ fontSize: 12, color: '#047857', fontWeight: 700 }}>
                          Location captured. Invite active for 30 minutes after you create the case.
                        </div>
                      ) : allowProximityJoin ? (
                        <div style={{ fontSize: 12, color: '#b45309' }}>Capture location to enable proximity join.</div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowNewCaseForm(false)
                    setNewCaseName('')
                    setNewCaseDescription('')
                    setAllowProximityJoin(false)
                    setProximityAnchor(null)
                    setProximityRadiusM(400)
                  }}
                  style={btn}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void onCreateCaseFromForm()}
                  style={btnPrimary}
                  disabled={
                    !newCaseName.trim() ||
                    (isMobileProximityClient() &&
                      relationalBackendEnabled() &&
                      allowProximityJoin &&
                      !proximityAnchor)
                  }
                >
                  Save case
                </button>
              </div>
            </div>
          </Modal>

          <Modal
            title="Team members"
            open={teamModalCaseId != null}
            onClose={() => setTeamModalCaseId(null)}
          >
            {teamModalCaseId ? (
              <TeamMembersModalBody
                caseId={teamModalCaseId}
                data={data}
                onAdd={(input) =>
                  addCaseCollaborator(props.currentUser.id, {
                    caseId: teamModalCaseId,
                    collaboratorUserId: input.collaboratorUserId,
                    collaboratorProfile: input.collaboratorProfile,
                  })
                }
                onAddMany={(items) =>
                  addCaseCollaborators(props.currentUser.id, { caseId: teamModalCaseId, items })
                }
                onRemove={(collaboratorUserId: string) =>
                  void removeCaseCollaborator(props.currentUser.id, { caseId: teamModalCaseId, collaboratorUserId })
                }
              />
            ) : null}
          </Modal>

          <Modal
            title="Join case nearby"
            open={manualInviteModal != null}
            onClose={() => setManualInviteModal(null)}
            zBase={80000}
          >
            {manualInviteModal ? (
              <div style={{ ...vcLiquidGlassInnerSurface, padding: 16, borderRadius: 12, display: 'grid', gap: 12 }}>
                {manualInviteModal.totalNearby > 1 ? (
                  <p style={{ margin: 0, fontSize: 12, color: vcGlassFgMetaOnContent }}>
                    Showing the nearest of {manualInviteModal.totalNearby} active invites.
                  </p>
                ) : null}
                <p style={{ margin: 0, color: vcGlassFgDarkReadable, lineHeight: 1.45, fontSize: 15 }}>
                  Join <strong>{manualInviteModal.caseTitle}</strong> created by{' '}
                  <strong>{manualInviteModal.creatorName}</strong>?
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setManualInviteModal(null)}
                    style={{
                      border: '1px solid rgba(148,163,184,0.5)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.85)',
                      fontWeight: 700,
                    }}
                  >
                    Not now
                  </button>
                  <button
                    type="button"
                    onClick={() => void onManualProximityInviteJoin()}
                    style={{ ...vcGlassBtnPrimary, borderRadius: 10 }}
                  >
                    Join case
                  </button>
                </div>
              </div>
            ) : null}
          </Modal>

          {filtered.length === 0 ? (
            <div style={empty}>
              {listTab === 'mine' && lifecycleFilter === 'open'
                ? 'No open cases yet. Create one to start tracking addresses.'
                : listTab === 'mine' && lifecycleFilter === 'closed'
                  ? 'No closed cases.'
                  : listTab === 'team' && lifecycleFilter === 'open'
                    ? 'No open shared cases yet. When another detective adds you to a case, it appears here.'
                    : 'No closed shared cases.'}
            </div>
          ) : (
            <div data-vc-tour={VC_TOUR.casesList} style={{ display: 'grid', gap: 8 }}>
              {filtered.map((c) => (
                <div key={c.id} style={card}>
                  {listTab === 'team' ? (
                    <div style={{ display: 'grid', gap: 4, minWidth: 0, width: '100%' }}>
                      {isNarrow ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              minWidth: 0,
                              width: '100%',
                            }}
                          >
                            <div
                              style={{
                                flex: '1 1 140px',
                                minWidth: 0,
                                fontWeight: 800,
                                fontSize: 15,
                                color: vcGlassFgDarkReadable,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.caseNumber}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCaseRowEnter(c)}
                              style={{ ...btn, flexShrink: 0, padding: '6px 8px', minHeight: 40 }}
                            >
                              {caseRowEnterLabel(c)}
                            </button>
                          </div>
                          <div style={{ ...caseDescReadonly, cursor: 'default', marginTop: 0, WebkitLineClamp: 3 }}>
                            {(c.description ?? '').trim() ? c.description : '—'}
                          </div>
                        </>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            gap: 12,
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                            flexDirection: 'row',
                            minWidth: 0,
                            width: '100%',
                          }}
                        >
                          <div style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '100%' }}>
                            <div style={{ ...caseTitleReadonly, cursor: 'default', maxWidth: '100%' }}>{c.caseNumber}</div>
                            <div style={{ ...caseDescReadonly, cursor: 'default', marginTop: 4, WebkitLineClamp: 3 }}>
                              {(c.description ?? '').trim() ? c.description : '—'}
                            </div>
                          </div>
                          <button type="button" onClick={() => handleCaseRowEnter(c)} style={{ ...btn, flexShrink: 0 }}>
                            {caseRowEnterLabel(c)}
                          </button>
                        </div>
                      )}
                      <div style={caseListMetaLine}>
                        Owner:{' '}
                        {data.users.find((u) => u.id === c.ownerUserId)?.displayName ?? c.ownerUserId} ·{' '}
                        {c.lifecycle === 'closed' ? 'Closed' : 'Open'} · Updated {formatAppDateTime(c.updatedAt)}
                      </div>
                      {renderCaseQuickCountsBlock(c)}
                    </div>
                  ) : editingCaseId === c.id ? (
                    <div style={{ display: 'grid', gap: 8, minWidth: 0, width: '100%' }}>
                      {isNarrow ? (
                        <>
                          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={label}>Case name</div>
                              <input
                                autoFocus
                                value={draftName}
                                onChange={(e) => setDraftName(e.target.value)}
                                style={caseMetaNameEdit}
                              />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={label}>Description</div>
                              <textarea
                                value={draftDesc}
                                maxLength={CASE_DESCRIPTION_MAX_CHARS}
                                onChange={(e) => setDraftDesc(e.target.value)}
                                placeholder="Optional"
                                style={caseMetaDescEditNarrow}
                              />
                            </div>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              justifyContent: 'flex-end',
                              minWidth: 0,
                              width: '100%',
                            }}
                          >
                            <button type="button" onClick={saveEditCase} style={btnPrimary}>
                              Save
                            </button>
                            <button type="button" onClick={discardEditCase} style={btn}>
                              Discard
                            </button>
                            {c.lifecycle !== 'closed' ? (
                              <>
                                <button type="button" onClick={() => handleCaseRowEnter(c)} style={btn}>
                                  {caseRowEnterLabel(c)}
                                </button>
                                <button
                                  type="button"
                                  aria-label="Delete case"
                                  title="Delete case"
                                  onClick={() => {
                                    setEditingCaseId((id) => (id === c.id ? null : id))
                                    void deleteCase(props.currentUser.id, c.id)
                                  }}
                                  style={caseCardDeleteIconBtn}
                                >
                                  ×
                                </button>
                              </>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            gap: 12,
                            alignItems: 'flex-end',
                            minWidth: 0,
                            width: '100%',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div
                            style={{
                              flex: '1 1 280px',
                              minWidth: 0,
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 12,
                              alignItems: 'flex-end',
                            }}
                          >
                            <div style={{ flex: '1 1 120px', minWidth: 0, maxWidth: '100%' }}>
                              <div style={label}>Case name</div>
                              <input
                                autoFocus
                                value={draftName}
                                onChange={(e) => setDraftName(e.target.value)}
                                style={caseMetaNameEdit}
                              />
                            </div>
                            <div style={{ flex: '3 1 200px', minWidth: 0, maxWidth: '100%' }}>
                              <div style={label}>Description</div>
                              <textarea
                                value={draftDesc}
                                maxLength={CASE_DESCRIPTION_MAX_CHARS}
                                onChange={(e) => setDraftDesc(e.target.value)}
                                placeholder="Optional"
                                style={caseMetaDescEdit}
                              />
                            </div>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              flexShrink: 0,
                              justifyContent: 'flex-end',
                            }}
                          >
                            <button type="button" onClick={saveEditCase} style={btnPrimary}>
                              Save
                            </button>
                            <button type="button" onClick={discardEditCase} style={btn}>
                              Discard
                            </button>
                            {c.lifecycle !== 'closed' ? (
                              <>
                                <button type="button" onClick={() => handleCaseRowEnter(c)} style={btn}>
                                  {caseRowEnterLabel(c)}
                                </button>
                                <button
                                  type="button"
                                  aria-label="Delete case"
                                  title="Delete case"
                                  onClick={() => {
                                    setEditingCaseId((id) => (id === c.id ? null : id))
                                    void deleteCase(props.currentUser.id, c.id)
                                  }}
                                  style={caseCardDeleteIconBtn}
                                >
                                  ×
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      )}
                      {c.lifecycle === 'closed' ? renderCaseQuickCountsBlock(c) : null}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 4, minWidth: 0, width: '100%' }}>
                      {isNarrow ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              minWidth: 0,
                              width: '100%',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => beginEditCase(c)}
                              style={{
                                ...caseTitleReadonly,
                                flex: '1 1 160px',
                                minWidth: 0,
                                maxWidth: '100%',
                                whiteSpace: 'normal',
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                WebkitLineClamp: 2,
                                textAlign: 'left',
                              }}
                            >
                              {c.caseNumber}
                            </button>
                            {!(c.lifecycle === 'closed') ? (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                  flexShrink: 0,
                                  alignItems: 'center',
                                  paddingTop: 0,
                                  justifyContent: 'flex-end',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleCaseRowEnter(c)}
                                  style={{ ...btn, padding: '6px 8px', minHeight: 40 }}
                                >
                                  {caseRowEnterLabel(c)}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setTeamModalCaseId(c.id)}
                                  style={{ ...btn, padding: '6px 8px', minHeight: 40 }}
                                >
                                  Team
                                </button>
                                <button
                                  type="button"
                                  aria-label="Delete case"
                                  title="Delete case"
                                  onClick={() => void deleteCase(props.currentUser.id, c.id)}
                                  style={caseCardDeleteIconBtn}
                                >
                                  ×
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => beginEditCase(c)}
                            style={{ ...caseDescReadonly, width: '100%', maxWidth: '100%', display: 'block' }}
                          >
                            {(c.description ?? '').trim() ? c.description : 'Add description'}
                          </button>
                        </>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            gap: 12,
                            alignItems: 'flex-start',
                            minWidth: 0,
                            width: '100%',
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div
                            style={{
                              flex: '1 1 240px',
                              minWidth: 0,
                              maxWidth: '100%',
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 12,
                              alignItems: 'flex-start',
                            }}
                          >
                            <button type="button" onClick={() => beginEditCase(c)} style={caseTitleReadonly}>
                              {c.caseNumber}
                            </button>
                            <button type="button" onClick={() => beginEditCase(c)} style={caseDescReadonly}>
                              {(c.description ?? '').trim() ? c.description : 'Add description'}
                            </button>
                          </div>
                          {!(c.lifecycle === 'closed') ? (
                            <div
                              style={{
                                display: 'flex',
                                gap: 8,
                                flexShrink: 0,
                                flexWrap: 'wrap',
                                alignItems: 'flex-start',
                                paddingTop: 2,
                                flexDirection: 'row',
                              }}
                            >
                              <button type="button" onClick={() => handleCaseRowEnter(c)} style={btn}>
                                {caseRowEnterLabel(c)}
                              </button>
                              <button type="button" onClick={() => setTeamModalCaseId(c.id)} style={btn}>
                                Team
                              </button>
                              <button
                                type="button"
                                aria-label="Delete case"
                                title="Delete case"
                                onClick={() => void deleteCase(props.currentUser.id, c.id)}
                                style={caseCardDeleteIconBtn}
                              >
                                ×
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )}
                      <div style={caseListMetaLine}>
                        {c.lifecycle === 'closed' ? 'Closed' : 'Open'} · Updated {formatAppDateTime(c.updatedAt)}
                      </div>
                      {renderCaseQuickCountsBlock(c)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}
    </Layout>
  )
}

const caseListMetaLine: React.CSSProperties = {
  color: vcGlassFgMetaOnContent,
  fontSize: 12,
  lineHeight: 1.45,
  fontWeight: 600,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
}

const caseListMetaCounts: React.CSSProperties = {
  ...caseListMetaLine,
  marginTop: 4,
  fontWeight: 500,
}

const card: React.CSSProperties = {
  ...vcLiquidGlassInnerSurface,
  borderRadius: 12,
  padding: '10px 12px',
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
  color: vcGlassFgDarkReadable,
}

const filterSelect: React.CSSProperties = {
  ...vcGlassFieldOnContentSurface,
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 14,
  maxWidth: '100%',
  boxSizing: 'border-box',
}

const empty: React.CSSProperties = {
  color: vcGlassFgMutedOnPanel,
  border: '1px dashed rgba(148, 163, 184, 0.45)',
  borderRadius: 14,
  padding: 16,
  background: 'rgba(203, 213, 225, 0.2)',
  backdropFilter: 'blur(14px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(14px) saturate(1.2)',
  boxSizing: 'border-box',
}

const label: React.CSSProperties = {
  fontSize: 12,
  color: vcGlassFgMetaOnContent,
  fontWeight: 700,
  marginBottom: 6,
}

const field: React.CSSProperties = {
  ...vcGlassFieldOnContentSurface,
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 16,
}

const btn: React.CSSProperties = {
  ...vcGlassBtnSecondary,
}

const btnPrimary: React.CSSProperties = {
  ...vcGlassBtnPrimary,
}

const btnDanger: React.CSSProperties = {
  ...vcGlassBtnSecondary,
  borderColor: '#fecaca',
  background: '#fff1f2',
  color: '#9f1239',
  fontWeight: 700,
}

const caseCardDeleteIconBtn: React.CSSProperties = {
  ...btnDanger,
  width: 40,
  minWidth: 40,
  height: 40,
  padding: 0,
  borderRadius: 10,
  fontSize: 22,
  lineHeight: 1,
  fontWeight: 400,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  boxSizing: 'border-box',
}

const caseTitleReadonly: React.CSSProperties = {
  margin: 0,
  padding: '2px 4px',
  border: 'none',
  background: 'none',
  font: 'inherit',
  fontWeight: 800,
  fontSize: 15,
  textAlign: 'left',
  cursor: 'pointer',
  color: vcGlassFgDarkReadable,
  borderRadius: 6,
  flex: '0 1 auto',
  maxWidth: 'min(240px, 46%)',
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const caseDescReadonly: React.CSSProperties = {
  margin: 0,
  padding: '2px 4px',
  border: 'none',
  background: 'none',
  font: 'inherit',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
  color: vcGlassFgSecondaryOnContent,
  borderRadius: 6,
  flex: '1 1 0',
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
  lineHeight: 1.35,
  whiteSpace: 'normal',
  overflow: 'hidden',
  wordBreak: 'break-word',
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
}

const caseMetaNameEdit: CSSProperties = {
  ...field,
  fontWeight: 800,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  height: CASE_META_INLINE_CONTROL_HEIGHT_PX,
  minHeight: CASE_META_INLINE_CONTROL_HEIGHT_PX,
}

const caseMetaDescEdit: CSSProperties = {
  ...field,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  minWidth: 0,
  height: CASE_META_INLINE_CONTROL_HEIGHT_PX,
  minHeight: CASE_META_INLINE_CONTROL_HEIGHT_PX,
  maxHeight: CASE_META_INLINE_CONTROL_HEIGHT_PX,
  resize: 'none',
  overflow: 'auto',
  lineHeight: 1.35,
}

const caseMetaDescEditNarrow: CSSProperties = {
  ...field,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  minWidth: 0,
  height: 'auto',
  minHeight: 72,
  maxHeight: 180,
  resize: 'none',
  overflow: 'auto',
  lineHeight: 1.35,
}

const newCaseDescTextarea: CSSProperties = {
  ...field,
  width: '100%',
  minHeight: CASE_META_INLINE_CONTROL_HEIGHT_PX,
  maxHeight: CASE_META_INLINE_CONTROL_HEIGHT_PX,
  resize: 'none',
  overflow: 'auto',
  lineHeight: 1.35,
}

