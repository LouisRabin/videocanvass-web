import { useMemo, useState } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { CasesPage } from './app/CasesPage'
import { Layout } from './app/Layout'
import { CasePage } from './app/CasePage'
import type { AppUser } from './lib/types'

function App() {
  return (
    <StoreProvider>
      <SessionGate />
    </StoreProvider>
  )
}

function SessionGate() {
  const { ready, data } = useStore()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const currentUser = useMemo(() => data.users.find((u) => u.id === currentUserId) ?? null, [data.users, currentUserId])

  if (!ready) {
    return (
      <Layout title="VideoCanvass">
        <div style={{ color: '#6b7280' }}>Loading…</div>
      </Layout>
    )
  }

  if (!currentUser) {
    return <MockLogin users={data.users} onSelectUser={(userId) => setCurrentUserId(userId)} />
  }

  return <Router currentUser={currentUser} onLogout={() => setCurrentUserId(null)} />
}

function MockLogin(props: { users: AppUser[]; onSelectUser: (userId: string) => void }) {
  const [selectedUserId, setSelectedUserId] = useState(props.users[0]?.id ?? '')
  return (
    <Layout title="VideoCanvass POC" subtitle="Mock sign-in (demo only)">
      <div style={{ maxWidth: 460, border: '1px solid #e5e7eb', borderRadius: 14, background: 'white', padding: 16, display: 'grid', gap: 12 }}>
        <div style={{ fontWeight: 800 }}>Choose demo user</div>
        <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' }}>
          {props.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName} - {u.email} - {u.taxNumber}
            </option>
          ))}
        </select>
        <button
          onClick={() => props.onSelectUser(selectedUserId)}
          style={{ border: '1px solid #111827', borderRadius: 10, padding: '10px 12px', background: '#111827', color: 'white', fontWeight: 800 }}
          disabled={!selectedUserId}
        >
          Enter app
        </button>
      </div>
    </Layout>
  )
}

function Router(props: { currentUser: AppUser; onLogout: () => void }) {
  const { data } = useStore()
  const [route, setRoute] = useState<{ name: 'cases' } | { name: 'case'; id: string }>({ name: 'cases' })

  const currentCase = useMemo(() => {
    if (route.name !== 'case') return null
    return data.cases.find((c) => c.id === route.id) ?? null
  }, [data.cases, route])

  if (route.name === 'cases') {
    return <CasesPage onOpenCase={(id) => setRoute({ name: 'case', id })} currentUser={props.currentUser} onLogout={props.onLogout} />
  }

  if (!currentCase) {
    return (
      <Layout
        title="Case not found"
        right={
          <button
            onClick={() => setRoute({ name: 'cases' })}
            style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', background: 'white' }}
          >
            Back
          </button>
        }
      >
        <div style={{ color: '#6b7280' }}>This case may have been deleted.</div>
      </Layout>
    )
  }

  return <CasePage caseId={currentCase.id} onBack={() => setRoute({ name: 'cases' })} />
}

export default App
