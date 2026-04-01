import { useSyncExternalStore } from 'react'

export type SyncMode = 'unknown' | 'supabase_ok' | 'local_fallback'

export type SyncStatus = {
  mode: SyncMode
  message: string
  updatedAt: number
  /** In-flight relational / shared saves (optimistic commits). */
  pendingRemoteSaves: number
  /** One-shot hint after a server merge changed local data. */
  remoteMergeNotice: string | null
}

let state: SyncStatus = {
  mode: 'unknown',
  message: 'Checking sync...',
  updatedAt: Date.now(),
  pendingRemoteSaves: 0,
  remoteMergeNotice: null,
}

const listeners = new Set<() => void>()

export function setSyncStatus(next: Partial<Pick<SyncStatus, 'mode' | 'message' | 'remoteMergeNotice'>>): void {
  state = {
    ...state,
    ...next,
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

export function dismissRemoteMergeNotice(): void {
  if (state.remoteMergeNotice == null) return
  state = { ...state, remoteMergeNotice: null, updatedAt: Date.now() }
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
