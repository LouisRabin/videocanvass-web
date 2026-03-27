import { useMemo, useState } from 'react'
import { Layout } from './Layout'
import { useStore } from '../lib/store'
import { Modal } from './Modal'
import type { AppUser } from '../lib/types'

export function CasesPage(props: { onOpenCase: (caseId: string) => void; currentUser: AppUser; onLogout: () => void }) {
  const { ready, data, createCase, deleteCase } = useStore()
  const [q, setQ] = useState('')
  const [showNewCaseForm, setShowNewCaseForm] = useState(false)
  const [newCaseName, setNewCaseName] = useState('')
  const [newCaseDescription, setNewCaseDescription] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return data.cases
    return data.cases.filter((c) => {
      return (
        c.caseNumber.toLowerCase().includes(needle) ||
        (c.description ?? '').toLowerCase().includes(needle)
      )
    })
  }, [data.cases, q])

  async function onCreateCaseFromForm() {
    const caseName = newCaseName.trim()
    if (!caseName) return
    const id = await createCase({ caseName, description: newCaseDescription.trim() })
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowNewCaseForm(true)} style={btnPrimary}>
            + New case
          </button>
          <button onClick={props.onLogout} style={btn}>
            Sign out
          </button>
        </div>
      }
    >
      {!ready ? (
        <div style={{ color: '#6b7280' }}>Loading…</div>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search case names…"
            style={search}
          />

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
                  onChange={(e) => setNewCaseDescription(e.target.value)}
                  placeholder="Short description"
                  style={{ ...field, minHeight: 96, resize: 'vertical' }}
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

          {filtered.length === 0 ? (
            <div style={empty}>No cases yet. Create one to start tracking addresses.</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {filtered.map((c) => (
                <div key={c.id} style={card}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 800 }}>{c.caseNumber}</div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                      Updated {new Date(c.updatedAt).toLocaleDateString()}
                    </div>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => props.onOpenCase(c.id)} style={btn}>
                      Open
                    </button>
                    <button onClick={() => void deleteCase(c.id)} style={btnDanger}>
                      Delete
                    </button>
                  </div>
                  {c.description ? <div style={{ color: '#6b7280', marginTop: 6 }}>{c.description}</div> : null}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  )
}

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 14,
  background: 'white',
}

const search: React.CSSProperties = {
  width: '100%',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '10px 12px',
  marginBottom: 12,
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
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'white',
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

