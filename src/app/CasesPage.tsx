import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { Layout } from './Layout'
import { useStore } from '../lib/store'
import { caseLastActivityMs, caseQuickCounts, casesAccessibleToUser } from '../lib/caseDashboard'
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

function TeamMembersModalBody(props: {
  caseId: string
  data: AppData
  teamPickUserId: string
  setTeamPickUserId: (v: string) => void
  onAdd: () => void
  onRemove: (collaboratorUserId: string) => void
}) {
  const c = props.data.cases.find((x) => x.id === props.caseId)
  if (!c) return <div style={{ color: '#6b7280' }}>Case not found.</div>
  const members = props.data.caseCollaborators.filter((cc) => cc.caseId === props.caseId)
  const eligible = props.data.users.filter(
    (u) => u.id !== c.ownerUserId && !members.some((m) => m.userId === u.id),
  )
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#4b5563', lineHeight: 1.45 }}>
        Detectives listed here can open this case and contribute. No invitation or acceptance step.
      </p>
      {members.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>No team members yet.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {members.map((m) => {
            const u = props.data.users.find((x) => x.id === m.userId)
            return (
              <li key={m.userId} style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>{u?.displayName ?? m.userId}</span>
                <span style={{ color: '#6b7280' }}> · {u?.taxNumber ?? ''}</span>
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

type ListTab = 'mine' | 'team' | 'all'

export function CasesPage(props: {
  onOpenCase: (caseId: string) => void
  currentUser: AppUser
  onLogout: () => void
  onOpenAdminGlobal?: () => void
}) {
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
  const [q, setQ] = useState('')
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
    return data.cases.filter((c) =>
      data.caseCollaborators.some((cc) => cc.caseId === c.id && cc.userId === uid),
    )
  }, [data.cases, data.caseCollaborators, props.currentUser.id])

  const accessibleCases = useMemo(() => casesAccessibleToUser(data, props.currentUser.id), [data, props.currentUser.id])

  const [ownerFilter, setOwnerFilter] = useState<'all' | 'me' | string>('all')
  const [unitFilter, setUnitFilter] = useState<'all' | 'none' | string>('all')
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | 'open' | 'closed'>('all')

  const ownerOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const c of accessibleCases) {
      if (c.ownerUserId) ids.add(c.ownerUserId)
    }
    return [...ids].sort()
  }, [accessibleCases])

  const unitOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const c of accessibleCases) {
      const u = c.unitId?.trim()
      if (u) ids.add(u)
    }
    return [...ids].sort()
  }, [accessibleCases])

  const filtered = useMemo(() => {
    const base = listTab === 'mine' ? mineCases : listTab === 'team' ? teamMemberCases : accessibleCases
    let rows = base
    if (lifecycleFilter === 'open') rows = rows.filter((c) => c.lifecycle !== 'closed')
    if (lifecycleFilter === 'closed') rows = rows.filter((c) => c.lifecycle === 'closed')
    if (unitFilter === 'none') rows = rows.filter((c) => !(c.unitId?.trim()))
    else if (unitFilter !== 'all') rows = rows.filter((c) => c.unitId === unitFilter)
    if (ownerFilter === 'me') rows = rows.filter((c) => c.ownerUserId === props.currentUser.id)
    else if (ownerFilter !== 'all') rows = rows.filter((c) => c.ownerUserId === ownerFilter)

    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((c) => {
      return (
        c.caseNumber.toLowerCase().includes(needle) ||
        (c.description ?? '').toLowerCase().includes(needle)
      )
    })
  }, [
    listTab,
    mineCases,
    teamMemberCases,
    accessibleCases,
    lifecycleFilter,
    unitFilter,
    ownerFilter,
    props.currentUser.id,
    q,
  ])

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

  return (
    <Layout
      title="Cases"
      subtitle={`Signed in as ${props.currentUser.displayName} (${props.currentUser.taxNumber})`}
      right={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0, maxWidth: '100%' }}>
          <button onClick={() => setShowNewCaseForm(true)} style={btnPrimary}>
            + New case
          </button>
          {props.onOpenAdminGlobal ? (
            <button type="button" onClick={props.onOpenAdminGlobal} style={btn}>
              Global results
            </button>
          ) : null}
          <button onClick={props.onLogout} style={btn}>
            Sign out
          </button>
        </div>
      }
    >
      {!ready ? (
        <div style={{ color: '#6b7280' }}>Loading…</div>
      ) : (
        <div style={{ minWidth: 0, maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setListTab('mine')
                setEditingCaseId(null)
              }}
              style={{ ...btn, fontWeight: listTab === 'mine' ? 800 : 600 }}
            >
              My cases
            </button>
            <button
              type="button"
              onClick={() => {
                setListTab('team')
                setEditingCaseId(null)
              }}
              style={{ ...btn, fontWeight: listTab === 'team' ? 800 : 600 }}
            >
              Team member
            </button>
            <button
              type="button"
              onClick={() => {
                setListTab('all')
                setEditingCaseId(null)
              }}
              style={{ ...btn, fontWeight: listTab === 'all' ? 800 : 600 }}
            >
              All accessible
            </button>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search case names…"
            style={search}
          />
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#4b5563' }}>Owner</span>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value as 'all' | 'me' | string)}
                style={filterSelect}
              >
                <option value="all">All</option>
                <option value="me">Me</option>
                {ownerOptions
                  .filter((id) => id !== props.currentUser.id)
                  .map((id) => (
                    <option key={id} value={id}>
                      {data.users.find((u) => u.id === id)?.displayName ?? id}
                    </option>
                  ))}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#4b5563' }}>Unit</span>
              <select
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value as 'all' | 'none' | string)}
                style={filterSelect}
              >
                <option value="all">All</option>
                <option value="none">Unassigned</option>
                {unitOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#4b5563' }}>Status</span>
              <select
                value={lifecycleFilter}
                onChange={(e) => setLifecycleFilter(e.target.value as 'all' | 'open' | 'closed')}
                style={filterSelect}
              >
                <option value="all">Open + closed</option>
                <option value="open">Open only</option>
                <option value="closed">Closed only</option>
              </select>
            </label>
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
              {listTab === 'mine'
                ? 'No cases for this profile yet. Create one to start tracking addresses.'
                : listTab === 'team'
                  ? 'No shared cases yet. When another detective adds you to a case, it appears here.'
                  : 'No cases match these filters, or you have no accessible cases.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {filtered.map((c) => (
                <div key={c.id} style={card}>
                  {listTab === 'team' || (listTab === 'all' && c.ownerUserId !== props.currentUser.id) ? (
                    <div style={{ display: 'grid', gap: 6, minWidth: 0, width: '100%' }}>
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
                                color: '#111827',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.caseNumber}
                            </div>
                            <button
                              type="button"
                              onClick={() => props.onOpenCase(c.id)}
                              style={{ ...btn, flexShrink: 0, padding: '6px 8px', minHeight: 40 }}
                            >
                              Open
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
                          <button type="button" onClick={() => props.onOpenCase(c.id)} style={{ ...btn, flexShrink: 0 }}>
                            Open
                          </button>
                        </div>
                      )}
                      <div style={{ color: '#6b7280', fontSize: 11, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        Owner:{' '}
                        {data.users.find((u) => u.id === c.ownerUserId)?.displayName ?? c.ownerUserId} ·{' '}
                        {c.lifecycle === 'closed' ? 'Closed' : 'Open'} · Updated {formatAppDateTime(c.updatedAt)}
                      </div>
                      {(() => {
                        const q = caseQuickCounts(data, c.id)
                        const last = caseLastActivityMs(data, c.id)
                        return (
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                            {q.locations} locations · {q.attachments} attachments · {q.tracks} tracks · Last activity{' '}
                            {formatAppDateTime(last)}
                          </div>
                        )
                      })()}
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
                            <button type="button" onClick={() => props.onOpenCase(c.id)} style={btn}>
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCaseId((id) => (id === c.id ? null : id))
                                void deleteCase(props.currentUser.id, c.id)
                              }}
                              style={btnDanger}
                            >
                              Delete
                            </button>
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
                            <button type="button" onClick={() => props.onOpenCase(c.id)} style={btn}>
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCaseId((id) => (id === c.id ? null : id))
                                void deleteCase(props.currentUser.id, c.id)
                              }}
                              style={btnDanger}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6, minWidth: 0, width: '100%' }}>
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
                                onClick={() => props.onOpenCase(c.id)}
                                style={{ ...btn, padding: '6px 8px', minHeight: 40 }}
                              >
                                Open
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
                                onClick={() => void deleteCase(props.currentUser.id, c.id)}
                                style={{ ...btnDanger, padding: '6px 8px', minHeight: 40 }}
                              >
                                Delete
                              </button>
                            </div>
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
                            <button type="button" onClick={() => props.onOpenCase(c.id)} style={btn}>
                              Open
                            </button>
                            <button type="button" onClick={() => setTeamModalCaseId(c.id)} style={btn}>
                              Team
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteCase(props.currentUser.id, c.id)}
                              style={btnDanger}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                      <div
                        style={{
                          color: '#6b7280',
                          fontSize: 11,
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        <span>
                          {c.lifecycle === 'closed' ? 'Closed' : 'Open'} · Updated {formatAppDateTime(c.updatedAt)}
                        </span>
                        {canEditCaseMeta(data, c.id, props.currentUser.id) ? (
                          <button
                            type="button"
                            style={{ ...btn, fontSize: 11, padding: '4px 8px' }}
                            onClick={() =>
                              void updateCase(props.currentUser.id, c.id, {
                                lifecycle: c.lifecycle === 'closed' ? 'open' : 'closed',
                              })
                            }
                          >
                            {c.lifecycle === 'closed' ? 'Reopen' : 'Close case'}
                          </button>
                        ) : null}
                      </div>
                      {(() => {
                        const q = caseQuickCounts(data, c.id)
                        const last = caseLastActivityMs(data, c.id)
                        return (
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                            {q.locations} locations · {q.attachments} attachments · {q.tracks} tracks · Last activity{' '}
                            {formatAppDateTime(last)}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'white',
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
}

const search: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '10px 12px',
  marginBottom: 8,
  fontSize: 16,
}

const filterSelect: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 14,
  maxWidth: '100%',
  boxSizing: 'border-box',
}

const empty: React.CSSProperties = {
  color: '#6b7280',
  border: '1px dashed #e5e7eb',
  borderRadius: 14,
  padding: 16,
  background: '#fafafa',
}

const label: React.CSSProperties = {
  fontSize: 12,
  color: '#6b7280',
  fontWeight: 700,
  marginBottom: 6,
}

const field: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'white',
  fontSize: 16,
}

const btn: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '8px 10px',
  background: 'white',
  cursor: 'pointer',
}

const btnPrimary: React.CSSProperties = {
  ...btn,
  borderColor: '#111827',
  background: '#111827',
  color: 'white',
  fontWeight: 700,
}

const btnDanger: React.CSSProperties = {
  ...btn,
  borderColor: '#fecaca',
  background: '#fff1f2',
  color: '#9f1239',
  fontWeight: 700,
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
  color: '#111827',
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
  color: '#6b7280',
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

