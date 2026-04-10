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
import { useTargetMode } from '../lib/targetMode'
import { MfaEnrollmentModal } from './MfaEnrollmentModal'
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

function TeamMembersModalBody(props: {
  caseId: string
  data: AppData
  teamPickUserId: string
  setTeamPickUserId: (v: string) => void
  onAdd: () => void
  onRemove: (collaboratorUserId: string) => void
}) {
  const c = props.data.cases.find((x) => x.id === props.caseId)
  if (!c) return <div style={{ color: vcGlassFgSecondaryOnContent }}>Case not found.</div>
  const members = props.data.caseCollaborators.filter((cc) => cc.caseId === props.caseId)
  const eligible = props.data.users.filter(
    (u) => u.id !== c.ownerUserId && !members.some((m) => m.userId === u.id),
  )
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
        <select value={props.teamPickUserId} onChange={(e) => props.setTeamPickUserId(e.target.value)} style={field}>
          <option value="">Choose user…</option>
          {eligible.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName} ({u.taxNumber})
            </option>
          ))}
        </select>
        <button type="button" style={btnPrimary} onClick={props.onAdd} disabled={!props.teamPickUserId.trim()}>
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
  const [mfaSecurityOpen, setMfaSecurityOpen] = useState(false)
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
    removeCaseCollaborator,
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
  const [teamPickUserId, setTeamPickUserId] = useState('')
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

  async function onCreateCaseFromForm() {
    const caseName = newCaseName.trim()
    if (!caseName) return
    const id = await createCase({
      ownerUserId: props.currentUser.id,
      caseName,
      description: clampCaseDescription(newCaseDescription.trim()),
    })
    setNewCaseName('')
    setNewCaseDescription('')
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
    <>
    <Layout
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
          {relationalBackendEnabled() ? (
            <button type="button" onClick={() => setMfaSecurityOpen(true)} style={vcGlassHeaderBtn}>
              Security / 2FA
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
        <div style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
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

          <Modal
            title="Create case"
            open={showNewCaseForm}
            onClose={() => {
              setShowNewCaseForm(false)
              setNewCaseName('')
              setNewCaseDescription('')
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
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setShowNewCaseForm(false)
                    setNewCaseName('')
                    setNewCaseDescription('')
                  }}
                  style={btn}
                >
                  Cancel
                </button>
                <button onClick={() => void onCreateCaseFromForm()} style={btnPrimary} disabled={!newCaseName.trim()}>
                  Save case
                </button>
              </div>
            </div>
          </Modal>

          <Modal
            title="Team members"
            open={teamModalCaseId != null}
            onClose={() => {
              setTeamModalCaseId(null)
              setTeamPickUserId('')
            }}
          >
            {teamModalCaseId ? (
              <TeamMembersModalBody
                caseId={teamModalCaseId}
                data={data}
                teamPickUserId={teamPickUserId}
                setTeamPickUserId={setTeamPickUserId}
                onAdd={() => {
                  if (!teamPickUserId.trim()) return
                  void addCaseCollaborator(props.currentUser.id, {
                    caseId: teamModalCaseId,
                    collaboratorUserId: teamPickUserId.trim(),
                  }).then(() => setTeamPickUserId(''))
                }}
                onRemove={(collaboratorUserId: string) =>
                  void removeCaseCollaborator(props.currentUser.id, { caseId: teamModalCaseId, collaboratorUserId })
                }
              />
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
      )}
    </Layout>
    <MfaEnrollmentModal open={mfaSecurityOpen} onClose={() => setMfaSecurityOpen(false)} onFactorsChanged={() => {}} />
    </>
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

