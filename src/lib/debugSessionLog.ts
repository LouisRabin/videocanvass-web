/** Cursor debug session — dual: console (always) + ingest (when reachable). No secrets. */
const VC_DEBUG_SESSION_ID = 'abc55e'

type DebugSessionPayload = {
  location: string
  message: string
  hypothesisId?: string
  data?: Record<string, unknown>
  timestamp?: number
}

export function debugSessionLog(payload: DebugSessionPayload): void {
  const body = {
    sessionId: VC_DEBUG_SESSION_ID,
    location: payload.location,
    message: payload.message,
    ...(payload.hypothesisId != null ? { hypothesisId: payload.hypothesisId } : {}),
    ...(payload.data != null ? { data: payload.data } : {}),
    timestamp: payload.timestamp ?? Date.now(),
  }
  // #region agent log
  try {
    console.info('[VC_DEBUG_SESSION]', JSON.stringify(body))
  } catch {
    /* ignore */
  }
  fetch('http://127.0.0.1:7759/ingest/df6e8c6a-ef77-4700-b4ea-c4efb4253a82', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': VC_DEBUG_SESSION_ID,
    },
    body: JSON.stringify(body),
  }).catch(() => {})
  // #endregion
}
