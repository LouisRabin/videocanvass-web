import type { CSSProperties } from 'react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { hasCaseAccess } from './lib/casePermissions'
import { relationalBackendEnabled } from './lib/backendMode'
import { getNativeCapabilities } from './lib/nativeCapabilities'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { urlHashIndicatesPasswordRecovery } from './lib/authPasswordReset'
import {
  getUsableSessionOrSignOutWithTimeout,
  resolveUsableSessionWithTimeout,
  sessionLooksUsableLocally,
} from './lib/supabaseAuthSession'
import { useTargetMode } from './lib/targetMode'
import { MOBILE_BREAKPOINT_QUERY, useMediaQuery } from './lib/useMediaQuery'
import { StoreProvider, useStore } from './lib/store'
import { CasesPage } from './app/CasesPage'
import { Layout } from './app/Layout'
import { Modal } from './app/Modal'
import { BuildDebugStrip } from './app/BuildDebugStrip'
import { LoginPage } from './app/LoginPage'
import { PasswordRecoveryPage } from './app/PasswordRecoveryPage'
import { MfaTotpChallengePanel } from './app/MfaTotpChallengePanel'
import { getPreferredTotpFactorId, sessionNeedsTotpStep } from './lib/mfaAuth'
import type { AppUser } from './lib/types'
import { TourProvider } from './app/tour/TourContext'
import { TOUR_UI_ENABLED } from './app/tour/tourFlags'
import {
  vcAuthMainCenterWrap,
  vcGlassBtnPrimary,
  vcGlassFgDarkReadable,
  vcGlassFgMutedOnPanel,
  vcGlassFieldOnContentSurface,
  vcGlassHeaderBtn,
  vcLiquidGlassInnerSurface,
} from './lib/vcLiquidGlass'

const CasePage = lazy(async () => {
  const m = await import('./app/CasePage')
  return { default: m.CasePage }
})

const GlobalCanvassAdminPage = lazy(async () => {
  const m = await import('./app/GlobalCanvassAdminPage')
  return { default: m.GlobalCanvassAdminPage }
})

function sessionUserIdMatchesStoreUser(sessionId: string, storeUserId: string): boolean {
  return sessionId.trim().toLowerCase() === storeUserId.trim().toLowerCase()
}

/** Restore case / admin route after mobile tab sleep, reload, or Router remount (in-memory route was always `cases` before). */
const VC_NAV_ROUTE_STORAGE_PREFIX = 'vc:navRoute:'
/** Wall-clock inactivity (no pointer/keys/touch/scroll) before sign-out. */
const VC_SESSION_INACTIVITY_MS = 10 * 60 * 1000
/** After this much idle time, show a countdown for the remaining time until sign-out. */
const VC_SESSION_WARNING_MS = 5 * 60 * 1000

function formatIdleCountdown(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

type AppNavRoute = { name: 'cases' } | { name: 'case'; id: string } | { name: 'admin_global' }

function navRouteStorageKey(userId: string): string {
  return `${VC_NAV_ROUTE_STORAGE_PREFIX}${userId}`
}

function readNavRouteFromStorage(userId: string, allowAdminGlobal: boolean): AppNavRoute {
  try {
    const raw = sessionStorage.getItem(navRouteStorageKey(userId))
    if (!raw) return { name: 'cases' }
    const o = JSON.parse(raw) as { name?: string; id?: string }
    if (o?.name === 'cases') return { name: 'cases' }
    if (o?.name === 'admin_global') return allowAdminGlobal ? { name: 'admin_global' } : { name: 'cases' }
    if (o?.name === 'case' && typeof o.id === 'string' && o.id.length > 0) return { name: 'case', id: o.id }
  } catch {
    /* ignore */
  }
  return { name: 'cases' }
}

const routeSuspenseFallback = (
  <div
    style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: vcGlassFgMutedOnPanel,
      fontWeight: 700,
      fontSize: 14,
    }}
  >
    Loading…
  </div>
)

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
      <BuildDebugStrip />
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
  /** False until first `getUsableSessionOrSignOut` finishes (avoids login-screen flash for valid sessions). */
  const [authResolved, setAuthResolved] = useState(false)
  /** User opened a password-reset email link and must set a new password before the normal app shell. */
  const [awaitingPasswordReset, setAwaitingPasswordReset] = useState(false)

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

  const syncMfaGate = useCallback(async (trustedSession?: Session | null) => {
    if (!relationalBackendEnabled() || !supabase) {
      setMfaGate('off')
      return
    }
    const session =
      trustedSession && sessionLooksUsableLocally(trustedSession)
        ? trustedSession
        : await getUsableSessionOrSignOutWithTimeout(supabase)
    if (!session?.user) {
      setMfaGate('off')
      return
    }
    setMfaGate('checking')
    const MFA_AAL_CHECK_MS = 12_000
    const need = await Promise.race([
      sessionNeedsTotpStep(supabase),
      new Promise<boolean>((resolve) => {
        window.setTimeout(() => resolve(false), MFA_AAL_CHECK_MS)
      }),
    ])
    if (!need) {
      setMfaGate('off')
      return
    }
    const fid = await getPreferredTotpFactorId(supabase)
    setMfaGate(fid ? 'totp' : 'unsupported')
  }, [])

  const completePasswordRecovery = useCallback(async () => {
    setAwaitingPasswordReset(false)
    try {
      const u = new URL(window.location.href)
      if (u.hash) {
        window.history.replaceState({}, '', `${u.pathname}${u.search}`)
      }
    } catch {
      /* ignore */
    }
    if (!relationalBackendEnabled() || !supabase) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const usable = await resolveUsableSessionWithTimeout(supabase, session)
    applySession(usable)
    if (!usable?.user) {
      setMfaGate('off')
      return
    }
    void syncMfaGate(usable)
  }, [applySession, syncMfaGate])

  useEffect(() => {
    if (!relationalBackendEnabled() || !supabase) {
      setAuthResolved(true)
      return
    }
    const sb = supabase
    let cancelled = false

    void (async () => {
      try {
        const url = new URL(window.location.href)
        if (url.searchParams.get('vc_signout') === '1') {
          url.searchParams.delete('vc_signout')
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
          await sb.auth.signOut()
          if (cancelled) return
          applySession(null)
          setAwaitingPasswordReset(false)
          setAuthResolved(true)
          setMfaGate('off')
          return
        }
      } catch {
        /* ignore */
      }

      if (cancelled) return
      try {
        const session = await getUsableSessionOrSignOutWithTimeout(sb)
        if (cancelled) return
        applySession(session)
        if (session?.user && urlHashIndicatesPasswordRecovery()) {
          setAwaitingPasswordReset(true)
        }
        setAuthResolved(true)
        void syncMfaGate(session)
      } catch (e) {
        console.warn('Session bootstrap failed:', e)
        if (cancelled) return
        applySession(null)
        setAwaitingPasswordReset(false)
        setAuthResolved(true)
        setMfaGate('off')
      }
    })()

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        setAwaitingPasswordReset(true)
      }
      void (async () => {
        if (!session?.user) {
          setAwaitingPasswordReset(false)
          applySession(null)
          setMfaGate('off')
          return
        }
        const usable = await resolveUsableSessionWithTimeout(sb, session)
        applySession(usable)
        if (!usable?.user) {
          setAwaitingPasswordReset(false)
          setMfaGate('off')
          return
        }
        void syncMfaGate(usable)
      })()
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [applySession, syncMfaGate])

  const relationalUser = useMemo((): AppUser | null => {
    if (!sessionUserId) return null
    const fromStore =
      data.users.find((u) => u.id === sessionUserId) ??
      data.users.find((u) => sessionUserIdMatchesStoreUser(sessionUserId, u.id))
    if (fromStore) return fromStore
    if (sessionMeta) {
      return {
        id: sessionUserId,
        displayName: sessionMeta.displayName,
        email: sessionMeta.email,
        taxNumber: sessionMeta.taxNumber,
        /** Placeholder until `vc_profiles` row is merged from the store. */
        createdAt: 0,
      }
    }
    // Avoid indefinite "Loading profile…" if auth metadata is late or Strict Mode reordered state.
    return {
      id: sessionUserId,
      displayName: 'User',
      email: '',
      taxNumber: '',
      createdAt: 0,
    }
  }, [data.users, sessionMeta, sessionUserId])

  const mockUser = useMemo(
    () => (mockUserId ? (data.users.find((u) => u.id === mockUserId) ?? null) : null),
    [data.users, mockUserId],
  )

  if (!ready) {
    return (
      <Layout title="VideoCanvass">
        <div style={{ color: vcGlassFgMutedOnPanel }}>Loading…</div>
      </Layout>
    )
  }

  if (relationalBackendEnabled()) {
    if (!authResolved) {
      return (
        <Layout title="VideoCanvass">
          <div style={{ color: vcGlassFgMutedOnPanel }}>Loading…</div>
        </Layout>
      )
    }
    if (!sessionUserId) {
      return <LoginPage />
    }
    if (awaitingPasswordReset) {
      return (
        <PasswordRecoveryPage
          onComplete={() => void completePasswordRecovery()}
          onSignOut={async () => {
            if (supabase) await supabase.auth.signOut()
            applySession(null)
            setAwaitingPasswordReset(false)
            setMfaGate('off')
          }}
        />
      )
    }
    if (mfaGate === 'checking') {
      return (
        <Layout title="VideoCanvass" subtitle="Checking security…">
          <div style={{ color: vcGlassFgMutedOnPanel }}>Loading…</div>
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
          <div style={{ ...vcLiquidGlassInnerSurface, display: 'grid', gap: 12, maxWidth: 480, padding: 16, borderRadius: 14 }}>
            <p style={{ margin: 0, color: vcGlassFgDarkReadable, lineHeight: 1.5 }}>
              Your account requires MFA, but this app only supports authenticator-app (TOTP) codes right now. Phone/SMS or WebAuthn factors cannot be used here yet.
            </p>
            <button
              type="button"
              style={vcGlassBtnPrimary}
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
          <div style={{ color: vcGlassFgMutedOnPanel }}>Loading profile…</div>
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
    ...vcLiquidGlassInnerSurface,
    borderRadius: 14,
    padding: 16,
    display: 'grid',
    gap: 12,
    color: vcGlassFgDarkReadable,
  }

  const prodDemoMisconfig = import.meta.env.PROD && !relationalBackendEnabled()

  return (
    <Layout title="VideoCanvass POC" subtitle="Mock sign-in (demo only)">
      <div style={vcAuthMainCenterWrap}>
        {prodDemoMisconfig ? (
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              boxSizing: 'border-box',
              marginBottom: 14,
              padding: 14,
              borderRadius: 12,
              background: 'rgba(127, 29, 29, 0.12)',
              border: '1px solid rgba(185, 28, 28, 0.45)',
              color: '#7f1d1d',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Production build is running in demo mode</div>
            {!hasSupabaseConfig ? (
              <p style={{ margin: 0 }}>
                This bundle was built without <code style={{ fontSize: 13 }}>VITE_SUPABASE_URL</code> and{' '}
                <code style={{ fontSize: 13 }}>VITE_SUPABASE_ANON_KEY</code>. In Vercel → Settings → Environment Variables, add both for{' '}
                <strong>Production</strong>, then trigger a new deployment (Vite bakes these in at build time).
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                Supabase URL/key are in this build, but relational mode is off (<code style={{ fontSize: 13 }}>VITE_VC_RELATIONAL_BACKEND</code>{' '}
                is false/off). You get demo sign-in and legacy blob sync, not email login or <code style={{ fontSize: 13 }}>vc_*</code>. Set the flag to{' '}
                <code style={{ fontSize: 13 }}>true</code> and redeploy, or remove that variable in Vercel so production defaults to relational when URL+key are set.
              </p>
            )}
          </div>
        ) : null}
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
                      border: on ? '2px solid rgba(15, 23, 42, 0.35)' : '1px solid rgba(148, 163, 184, 0.5)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      textAlign: 'left',
                      background: on ? 'rgba(203, 213, 225, 0.55)' : 'rgba(226, 232, 240, 0.35)',
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
                  ...vcGlassFieldOnContentSurface,
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
            type="button"
            onClick={() => props.onSelectUser(selectedUserId)}
            style={{ ...vcGlassBtnPrimary, width: '100%', boxSizing: 'border-box' }}
            disabled={!selectedUserId}
          >
            Enter app
          </button>
        </div>
      </div>
    </Layout>
  )
}

function Router(props: { currentUser: AppUser; onLogout: () => void; allowAdminGlobal: boolean }) {
  const { data, ready } = useStore()
  const prevUserIdRef = useRef(props.currentUser.id)
  const [route, setRoute] = useState<AppNavRoute>(() =>
    readNavRouteFromStorage(props.currentUser.id, props.allowAdminGlobal),
  )

  useEffect(() => {
    const prev = prevUserIdRef.current
    if (prev === props.currentUser.id) return
    prevUserIdRef.current = props.currentUser.id
    setRoute(readNavRouteFromStorage(props.currentUser.id, props.allowAdminGlobal))
  }, [props.allowAdminGlobal, props.currentUser.id])

  useEffect(() => {
    try {
      sessionStorage.setItem(navRouteStorageKey(props.currentUser.id), JSON.stringify(route))
    } catch {
      /* quota / private mode */
    }
  }, [props.currentUser.id, route])

  useLayoutEffect(() => {
    if (!ready || route.name !== 'case') return
    const ok = data.cases.some(
      (c) => c.id === route.id && hasCaseAccess(data, route.id, props.currentUser.id),
    )
    if (!ok) setRoute({ name: 'cases' })
  }, [data, props.currentUser.id, ready, route])

  const onLogoutRef = useRef(props.onLogout)
  onLogoutRef.current = props.onLogout

  const lastActivityRef = useRef(Date.now())
  const logoutTriggeredRef = useRef(false)

  const bumpActivity = useCallback((e?: Event) => {
    const t = e?.target
    if (t instanceof Element && t.closest('[data-vc-ignore-idle-bump="true"]')) return
    lastActivityRef.current = Date.now()
    logoutTriggeredRef.current = false
  }, [])

  const [idleTick, setIdleTick] = useState(0)
  const extendSession = useCallback(() => {
    bumpActivity()
    setIdleTick((t) => t + 1)
  }, [bumpActivity])

  useEffect(() => {
    const id = window.setInterval(() => setIdleTick((x) => x + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const opts: AddEventListenerOptions = { passive: true, capture: true }
    const bumpFromEvent = (e: Event) => bumpActivity(e)
    let scrollT: ReturnType<typeof setTimeout> | null = null
    const scrollThrottled = () => {
      if (scrollT) return
      scrollT = window.setTimeout(() => {
        scrollT = null
        bumpActivity()
      }, 1000)
    }
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(ev, bumpFromEvent, opts)
    }
    window.addEventListener('scroll', scrollThrottled, { passive: true, capture: true })
    return () => {
      for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
        window.removeEventListener(ev, bumpFromEvent, opts)
      }
      window.removeEventListener('scroll', scrollThrottled, { capture: true })
      if (scrollT) window.clearTimeout(scrollT)
    }
  }, [bumpActivity])

  useEffect(() => {
    const onVis = () => setIdleTick((x) => x + 1)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.visibilityState !== 'visible') return
    const idle = Date.now() - lastActivityRef.current
    if (idle < VC_SESSION_INACTIVITY_MS) return
    if (logoutTriggeredRef.current) return
    logoutTriggeredRef.current = true
    void onLogoutRef.current()
  }, [idleTick])

  const tabVisible = typeof document !== 'undefined' && document.visibilityState === 'visible'
  const idleMs = Date.now() - lastActivityRef.current
  const showIdleWarning =
    tabVisible && idleMs >= VC_SESSION_WARNING_MS && idleMs < VC_SESSION_INACTIVITY_MS
  const secondsUntilLogout = Math.max(
    0,
    Math.ceil((lastActivityRef.current + VC_SESSION_INACTIVITY_MS - Date.now()) / 1000),
  )

  const idleWarningModal = (
    <Modal
      open={showIdleWarning}
      title="Signing out soon"
      ariaLabel="Inactivity warning"
      onClose={extendSession}
      zBase={70000}
    >
      <div data-vc-ignore-idle-bump="true" style={{ display: 'grid', gap: 16 }}>
        <p style={{ margin: 0, color: vcGlassFgDarkReadable, lineHeight: 1.5, fontSize: 15 }}>
          You will be logged out in <strong>{formatIdleCountdown(secondsUntilLogout)}</strong> due to inactivity.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => {
              void onLogoutRef.current()
            }}
            style={{
              border: '1px solid rgba(185, 28, 28, 0.45)',
              borderRadius: 10,
              padding: '10px 16px',
              background: 'rgba(254, 242, 242, 0.95)',
              color: '#991b1b',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            Log out
          </button>
          <button type="button" onClick={extendSession} style={{ ...vcGlassBtnPrimary, fontSize: 14 }}>
            Stay logged in
          </button>
        </div>
      </div>
    </Modal>
  )

  const currentCase = useMemo(() => {
    if (route.name !== 'case') return null
    return data.cases.find((c) => c.id === route.id && hasCaseAccess(data, c.id, props.currentUser.id)) ?? null
  }, [data, route, props.currentUser.id])

  if (route.name === 'admin_global') {
    return (
      <>
        {idleWarningModal}
        <Suspense fallback={routeSuspenseFallback}>
          <GlobalCanvassAdminPage onBack={() => setRoute({ name: 'cases' })} />
        </Suspense>
      </>
    )
  }

  if (route.name === 'cases') {
    return (
      <>
        {idleWarningModal}
        <CasesPage
          onOpenCase={(id) => setRoute({ name: 'case', id })}
          currentUser={props.currentUser}
          onLogout={props.onLogout}
          onOpenAdminGlobal={props.allowAdminGlobal ? () => setRoute({ name: 'admin_global' }) : undefined}
        />
      </>
    )
  }

  if (!currentCase) {
    return (
      <>
        {idleWarningModal}
        <Layout
          title="Case not found"
          right={
            <button type="button" onClick={() => setRoute({ name: 'cases' })} style={vcGlassHeaderBtn}>
              Back
            </button>
          }
        >
          <div style={{ color: vcGlassFgMutedOnPanel }}>This case may have been deleted.</div>
        </Layout>
      </>
    )
  }

  return (
    <>
      {idleWarningModal}
      <Suspense fallback={routeSuspenseFallback}>
        <CasePage caseId={currentCase.id} currentUser={props.currentUser} onBack={() => setRoute({ name: 'cases' })} />
      </Suspense>
    </>
  )
}

export default App
