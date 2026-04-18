import { useCallback, useEffect, useRef, useState } from 'react'
import { relationalBackendEnabled } from '../lib/backendMode'
import { getGeolocationPermissionState, requestCurrentPosition } from '../lib/geolocationRequest'
import { ensureMobileProximityLocationPrefsOn } from '../lib/mobileProximityLocationPrefs'
import { isMobileProximityClient } from '../lib/mobilePlatform'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { Modal } from './Modal'
import {
  vcGlassBtnPrimary,
  vcGlassFgDarkReadable,
  vcLiquidGlassInnerSurface,
} from '../lib/vcLiquidGlass'

const PROMPTED_KEY = 'vc:proximityInvitePrompted'

function loadPromptedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(PROMPTED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.map((x) => String(x)))
  } catch {
    return new Set()
  }
}

function savePromptedSet(s: Set<string>) {
  try {
    sessionStorage.setItem(PROMPTED_KEY, JSON.stringify([...s]))
  } catch {
    /* ignore */
  }
}

/**
 * Mobile (native + mobile web): while the document is visible, poll for active proximity invites and offer to join.
 */
export function ProximityInviteListener() {
  const { reconcileWithRemote } = useStore()
  const [invite, setInvite] = useState<{
    caseId: string
    caseTitle: string
    creatorName: string
    lat: number
    lng: number
  } | null>(null)

  const promptedRef = useRef(loadPromptedSet())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    if (!relationalBackendEnabled() || !supabase || document.visibilityState !== 'visible') return
    if (invite != null) return
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData.user?.id
    if (!uid) return

    let { data: prefRow } = await supabase.from('vc_profile_location_prefs').select('proximity_invite_listen').maybeSingle()
    let listen = (prefRow as { proximity_invite_listen?: boolean } | null)?.proximity_invite_listen === true
    if (!listen) {
      await ensureMobileProximityLocationPrefsOn()
      ;({ data: prefRow } = await supabase.from('vc_profile_location_prefs').select('proximity_invite_listen').maybeSingle())
      listen = (prefRow as { proximity_invite_listen?: boolean } | null)?.proximity_invite_listen === true
    }
    if (!listen) return

    const perm = await getGeolocationPermissionState()
    if (perm === 'denied') return

    const pos = await requestCurrentPosition({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 })
    if (!pos.ok) return

    const lat = pos.position.coords.latitude
    const lng = pos.position.coords.longitude

    const { data: rows, error } = await supabase.rpc('vc_active_proximity_invites_at', {
      p_lat: lat,
      p_lng: lng,
    })
    if (error) return

    const list = (rows ?? []) as Array<{
      case_id: string
      case_title: string
      creator_display_name: string
      creator_user_id: string
      distance_m: number
    }>
    for (const r of list) {
      const key = r.case_id
      if (promptedRef.current.has(key)) continue
      promptedRef.current.add(key)
      savePromptedSet(promptedRef.current)
      setInvite({
        caseId: r.case_id,
        caseTitle: r.case_title,
        creatorName: r.creator_display_name,
        lat,
        lng,
      })
      return
    }
  }, [invite])

  useEffect(() => {
    if (!isMobileProximityClient() || !relationalBackendEnabled()) return
    let cancelled = false
    const onVis = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVis)
    void (async () => {
      await ensureMobileProximityLocationPrefsOn()
      if (cancelled) return
      void poll()
      intervalRef.current = window.setInterval(() => void poll(), 45_000)
    })()
    return () => {
      cancelled = true
      if (intervalRef.current) window.clearInterval(intervalRef.current)
      intervalRef.current = null
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [poll])

  if (!isMobileProximityClient()) return null

  const onJoin = async () => {
    if (!invite || !supabase) return
    const { data, error } = await supabase.rpc('vc_accept_proximity_case_invite', {
      p_case_id: invite.caseId,
      p_lat: invite.lat,
      p_lng: invite.lng,
    })
    setInvite(null)
    if (error) {
      console.warn('vc_accept_proximity_case_invite', error.message)
      return
    }
    if (data === true) {
      await reconcileWithRemote()
    }
  }

  const onDismiss = () => setInvite(null)

  return (
    <Modal
      title="Join case nearby"
      open={invite != null}
      onClose={onDismiss}
      zBase={80000}
    >
      {invite ? (
        <div style={{ ...vcLiquidGlassInnerSurface, padding: 16, borderRadius: 12, display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, color: vcGlassFgDarkReadable, lineHeight: 1.45, fontSize: 15 }}>
            Join <strong>{invite.caseTitle}</strong> created by <strong>{invite.creatorName}</strong>?
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={onDismiss} style={{ border: '1px solid rgba(148,163,184,0.5)', borderRadius: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
              Not now
            </button>
            <button type="button" onClick={() => void onJoin()} style={{ ...vcGlassBtnPrimary, borderRadius: 10 }}>
              Join case
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
