import { useSyncExternalStore } from 'react'

type SyncMode = 'unknown' | 'supabase_ok' | 'local_fallback'

type SyncStatus = {
  mode: SyncMode
  /** User-visible detail (errors, sign-in hints). Left empty when cloud is healthy. */
  message: string
  updatedAt: number
  /** In-flight relational / shared saves (optimistic commits). */
  pendingRemoteSaves: number
  /** Latest fallback / failure line for diagnostics (cleared when mode becomes supabase_ok). */
  lastError: string | null
  /** Newest-first log lines for the sync diagnostics panel. */
  debugLines: string[]
}

const MAX_DEBUG_LINES = 60

let state: SyncStatus = {
  mode: 'unknown',
  message: '',
  updatedAt: Date.now(),
  pendingRemoteSaves: 0,
  lastError: null,
  debugLines: [],
}

const listeners = new Set<() => void>()

function appendDebugLine(lines: string[], line: string): string[] {
  const ts = new Date().toISOString()
  const entry = `${ts} ${line}`
  return [entry, ...lines].slice(0, MAX_DEBUG_LINES)
}

/** For sync effects that need to promote stale “signed out” / fallback UI without redundant updates every poll. */
export function getSyncStatusMode(): SyncMode {
  return state.mode
}

export function setSyncStatus(next: Partial<Pick<SyncStatus, 'mode' | 'message'>>): void {
  const mode = next.mode ?? state.mode
  let message = next.message !== undefined ? next.message : state.message
  if (mode === 'supabase_ok' && next.message === undefined) {
    message = ''
  }
  let lastError = state.lastError
  let debugLines = state.debugLines
  if (mode === 'supabase_ok') {
    lastError = null
  } else if (mode === 'local_fallback' && message.trim()) {
    lastError = message.trim()
    debugLines = appendDebugLine(debugLines, `status: ${message.trim()}`)
  }
  state = {
    ...state,
    ...next,
    message,
    lastError,
    debugLines,
    updatedAt: Date.now(),
  }
  for (const fn of listeners) fn()
}

/** Append a line to the diagnostics log (e.g. caught sync exceptions). */
export function recordSyncDebug(line: string): void {
  const text = line.trim() || '(empty)'
  state = {
    ...state,
    debugLines: appendDebugLine(state.debugLines, text),
    updatedAt: Date.now(),
  }
  for (const fn of listeners) fn()
}

export function adjustPendingRemoteSaves(delta: number): void {
  const n = Math.max(0, state.pendingRemoteSaves + delta)
  if (n === state.pendingRemoteSaves) return
  state = { ...state, pendingRemoteSaves: n, updatedAt: Date.now() }
  for (const fn of listeners) fn()
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
    () => state,
  )
}
