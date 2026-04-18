/** Options tuned for an explicit “where am I” user action (fresh fix, reasonable timeout). */
const DEFAULT_ACTION_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
}

type GeolocationFailCode = 'unsupported' | 'denied' | 'timeout' | 'unavailable' | 'unknown'

type GeolocationRequestResult =
  | { ok: true; position: GeolocationPosition }
  | { ok: false; code: GeolocationFailCode }

export async function requestCurrentPosition(
  options?: Partial<PositionOptions>,
): Promise<GeolocationRequestResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, code: 'unsupported' }
  }
  const merged: PositionOptions = { ...DEFAULT_ACTION_OPTS, ...options }
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, merged)
    })
    return { ok: true, position }
  } catch (e: unknown) {
    const err = e as GeolocationPositionError
    const code = err?.code
    if (code === 1) return { ok: false, code: 'denied' }
    if (code === 2) return { ok: false, code: 'unavailable' }
    if (code === 3) return { ok: false, code: 'timeout' }
    return { ok: false, code: 'unknown' }
  }
}

type GeolocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

/**
 * Best-effort read of geolocation permission (not supported in all browsers).
 * `denied` means the user will not see a prompt until they change site settings.
 */
export async function getGeolocationPermissionState(): Promise<GeolocationPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported'
  }
  try {
    const r = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    if (r.state === 'granted') return 'granted'
    if (r.state === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'unsupported'
  }
}
