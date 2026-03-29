import { useSyncExternalStore } from 'react'

export type SyncMode = 'unknown' | 'supabase_ok' | 'local_fallback'

export type SyncStatus = {
  mode: SyncMode
  message: string
  updatedAt: number
}

let state: SyncStatus = {
  mode: 'unknown',
  message: 'Checking sync...',
  updatedAt: Date.now(),
}

const listeners = new Set<() => void>()

export function setSyncStatus(next: Omit<SyncStatus, 'updatedAt'>): void {
  state = {
    ...next,
    updatedAt: Date.now(),
  }
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

