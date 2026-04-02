import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasCaseAccess } from './lib/casePermissions'
import { relationalBackendEnabled } from './lib/backendMode'
import { getNativeCapabilities } from './lib/nativeCapabilities'
import { supabase } from './lib/supabase'
import { useTargetMode } from './lib/targetMode'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from './lib/useMediaQuery'
import { StoreProvider, useStore } from './lib/store'
import { CasesPage } from './app/CasesPage'
import { CasePage } from './app/CasePage'
import { Layout } from './app/Layout'
import { LoginPage } from './app/LoginPage'
import { MfaTotpChallengePanel } from './app/MfaTotpChallengePanel'
import { GlobalCanvassAdminPage } from './app/GlobalCanvassAdminPage'
import { getPreferredTotpFactorId, sessionNeedsTotpStep } from './lib/mfaAuth'
import type { AppUser } from './lib/types'
import { TourProvider } from './app/tour/TourContext'
import { TOUR_UI_ENABLED } from './app/tour/tourFlags'

function App() {
  const targetMode = useTargetMode()
  const isNarrowLayout = useMediaQuery(MOBILE_BREAKPOINT_QUERY)
  useEffect(() => {
    const caps = getNativeCapabilities(targetMode)
    document.documentElement.dataset.layout = isNarrowLayout ? 'narrow' : 'wide'
    document.documentElement.dataset.target = targetMode
    document.documentElement.dataset.nativePlatform = caps.platform
  }, [isNarrowLayout, targetMode])

  return (
    <StoreProvider>
      <SessionGate />
    </StoreProvider>
  )
}

type MfaGateState = 'off' | 'checking' | 'totp' | 'unsupported'

function SessionGate() {
  const { ready, data } = useStore()
  const [mockUserId, setMockUserId] = useState<string | null>(null)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [sessionMeta, setSessionMeta] = useState<{
    email: string
    displayName: string
    taxNumber: string
  } | null>(null)
  const [mfaGate, setMfaGate] = useState<MfaGateState>('off')

  const applySession = useCallback(
    (session: import('@supabase/supabase-js').Session | null) => {
      const u = session?.user
      setSessionUserId(u?.id ?? null)
      if (!u) {
        setSessionMeta(null)
        return
      }
      const meta = u.user_metadata as { display_name?: string; tax_number?: string } | undefined
      setSessionMeta({
        email: u.email ?? '',
        displayName: meta?.display_name?.trim() || u.email?.split('@')[0] || 'User',
        taxNumber: meta?.tax_number?.trim() || '',
      })
    },
    [],
  )

  const syncMfaGate = useCallback(async () => {
    if (!relationalBackendEnabled() || !supabase) {
      setMfaGate('off')
      return
    }
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) {
      setMfaGate('off')
      return
    }
    setMfaGate('checking')
    const need = await sessionNeedsTotpStep(supabase)
    if (!need) {
      setMfaGate('off')
      return
    }
    const fid = await getPreferredTotpFactorId(supabase)
    setMfaGate(fid ? 'totp' : 'unsupported')
  }, [])

  useEffect(() => {
    if (!relationalBackendEnabled() || !supabase) return
    void supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session)
      void syncMfaGate()
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
      void syncMfaGate()
    })
    return () => subscription.unsubscribe()
  }, [applySession, syncMfaGate])

  const relationalUser = useMemo((): AppUser | null => {
    if (!sessionUserId) return null
    const fromStore = data.users.find((u) => u.id === sessionUserId)
    if (fromStore) return fromStore
    if (!sessionMeta) return null
    return {
      id: sessionUserId,
      displayName: sessionMeta.displayName,
      email: sessionMeta.email,
      taxNumber: sessionMeta.taxNumber,
      createdAt: Date.now(),
    }
  }, [data.users, sessionMeta, sessionUserId])

  const mockUser = useMemo(
    () => (mockUserId ? (data.users.find((u) => u.id === mockUserId) ?? null) : null),
    [data.users, mockUserId],
  )

  if (!ready) {
    return (
      <Layout title="VideoCanvass">
        <div style={{ color: '#6b7280' }}>Loading…</div>
      </Layout>
    )
  }

  if (relationalBackendEnabled()) {
    if (!sessionUserId) {
      return <LoginPage />
    }
    if (mfaGate === 'checking') {
      return (
        <Layout title="VideoCanvass" subtitle="Checking security…">
          <div style={{ color: '#6b7280' }}>Loading…</div>
        </Layout>
      )
    }
    if (mfaGate === 'totp') {
      return (
        <Layout title="VideoCanvass" subtitle="Two-step verification">
          <MfaTotpChallengePanel
            onSignOut={async () => {
              if (supabase) await supabase.auth.signOut()
              applySession(null)
              setMfaGate('off')
            }}
          />
        </Layout>
      )
    }
    if (mfaGate === 'unsupported') {
      return (
        <Layout title="VideoCanvass" subtitle="Sign-in issue">
          <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
            <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.5 }}>
              Your account requires MFA, but this app only supports authenticator-app (TOTP) codes right now. Phone/SMS or WebAuthn factors cannot be used here yet.
            </p>
            <button
              type="button"
              style={{ border: '1px solid #111827', borderRadius: 10, padding: '10px 12px', background: '#111827', color: 'white', fontWeight: 800 }}
              onClick={async () => {
                if (supabase) await supabase.auth.signOut()
                applySession(null)
                setMfaGate('off')
              }}
            >
              Sign out
            </button>
          </div>
        </Layout>
      )
    }
    if (!relationalUser) {
      return (
        <Layout title="VideoCanvass">
          <div style={{ color: '#6b7280' }}>Loading profile…</div>
        </Layout>
      )
    }
    const relationalRouter = (
      <Router
        currentUser={relationalUser}
        onLogout={async () => {
          if (supabase) await supabase.auth.signOut()
          applySession(null)
          setMfaGate('off')
        }}
        allowAdminGlobal={relationalUser.appRole === 'admin'}
      />
    )
    return TOUR_UI_ENABLED ? <TourProvider>{relationalRouter}</TourProvider> : relationalRouter
  }

  if (!mockUser) {
    return <MockLogin users={data.users} onSelectUser={(userId) => setMockUserId(userId)} />
  }

  const mockRouter = <Router currentUser={mockUser} onLogout={() => setMockUserId(null)} allowAdminGlobal={false} />
  return TOUR_UI_ENABLED ? <TourProvider>{mockRouter}</TourProvider> : mockRouter
}

function MockLogin(props: { users: AppUser[]; onSelectUser: (userId: string) => void }) {
  const [selectedUserId, setSelectedUserId] = useState(props.users[0]?.id ?? '')
  const narrow = useMediaQuery(MOBILE_BREAKPOINT_QUERY)
  const selectedUser = useMemo(
    () => props.users.find((u) => u.id === selectedUserId) ?? null,
    [props.users, selectedUserId],
  )
  const pickerCardStyle: CSSProperties = {
    width: '100%',
    maxWidth: 460,
    boxSizing: 'border-box',
    border: '1px solid #e5e7eb',
    borderRadius: 14,
    background: 'white',
    padding: 16,
    display: 'grid',
    gap: 12,
  }

  return (
    <Layout title="VideoCanvass POC" subtitle="Mock sign-in (demo only)">
      <div style={pickerCardStyle}>
        <div style={{ fontWeight: 800 }}>Choose demo user</div>
        {narrow ? (
          <div
            role="listbox"
            aria-label="Demo users"
            style={{ display: 'grid', gap: 8, maxHeight: 'min(50vh, 360px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
          >
            {props.users.map((u) => {
              const on = u.id === selectedUserId
              return (
                <button
                  type="button"
                  key={u.id}
                  role="option"
                  aria-selected={on}
                  onClick={() => setSelectedUserId(u.id)}
                  style={{
                    border: on ? '2px solid #111827' : '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: '12px 14px',
                    textAlign: 'left',
                    background: on ? '#f9fafb' : 'white',
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 4,
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: 15, wordBreak: 'break-word' }}>{u.displayName}</span>
                  <span style={{ fontSize: 13, color: '#4b5563', wordBreak: 'break-all' }}>{u.email}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{u.taxNumber}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '10px 12px',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                fontSize: 16,
              }}
            >
              {props.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} — {u.email} — {u.taxNumber}
                </option>
              ))}
            </select>
            {selectedUser ? (
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.45, wordBreak: 'break-word' }}>
                <span style={{ fontWeight: 800 }}>{selectedUser.displayName}</span>
                {' · '}
                {selectedUser.email}
                {' · '}
                {selectedUser.taxNumber}
              </div>
            ) : null}
          </>
        )}
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

function Router(props: { currentUser: AppUser; onLogout: () => void; allowAdminGlobal: boolean }) {
  const { data } = useStore()
  const [route, setRoute] = useState<
    { name: 'cases' } | { name: 'case'; id: string } | { name: 'admin_global' }
  >({ name: 'cases' })

  const currentCase = useMemo(() => {
    if (route.name !== 'case') return null
    return data.cases.find((c) => c.id === route.id && hasCaseAccess(data, c.id, props.currentUser.id)) ?? null
  }, [data, route, props.currentUser.id])

  if (route.name === 'admin_global') {
    return <GlobalCanvassAdminPage onBack={() => setRoute({ name: 'cases' })} />
  }

  if (route.name === 'cases') {
    return (
      <CasesPage
        onOpenCase={(id) => setRoute({ name: 'case', id })}
        currentUser={props.currentUser}
        onLogout={props.onLogout}
        onOpenAdminGlobal={props.allowAdminGlobal ? () => setRoute({ name: 'admin_global' }) : undefined}
      />
    )
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

  return (
    <CasePage caseId={currentCase.id} currentUser={props.currentUser} onBack={() => setRoute({ name: 'cases' })} />
  )
}

export default App
