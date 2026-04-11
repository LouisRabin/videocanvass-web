import { vcDebugEnabled } from './buildDebug'

/** Dev / `VITE_VC_DEBUG` — logs relational pull step timings (no payload stringify to avoid huge work). */
export function shouldTraceRelationalPull(): boolean {
  return vcDebugEnabled() || Boolean(import.meta.env.DEV)
}

export function traceRelationalPullStep(label: string, startedMs: number, rowCount?: number): void {
  if (!shouldTraceRelationalPull()) return
  const elapsed = Math.round(performance.now() - startedMs)
  const rows = rowCount != null ? ` rows=${rowCount}` : ''
  console.info(`[vc_sync_pull] ${label}${rows} ${elapsed}ms`)
}
