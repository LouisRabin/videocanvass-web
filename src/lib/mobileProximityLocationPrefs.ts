import { relationalBackendEnabled } from './backendMode'
import { isMobileProximityClient } from './mobilePlatform'
import { supabase } from './supabase'

/** Mobile: ensure team discovery + proximity invite listening are enabled (no per-device toggles). */
export async function ensureMobileProximityLocationPrefsOn(): Promise<void> {
  if (!isMobileProximityClient() || !relationalBackendEnabled() || !supabase) return
  const { data, error } = await supabase
    .from('vc_profile_location_prefs')
    .select('team_discovery_sharing, proximity_invite_listen')
    .maybeSingle()
  if (error) return
  const row = data as { team_discovery_sharing?: boolean; proximity_invite_listen?: boolean } | null
  if (row?.team_discovery_sharing === true && row?.proximity_invite_listen === true) return
  const { error: upErr } = await supabase.rpc('vc_update_my_location_prefs', {
    p_team_discovery_sharing: true,
    p_proximity_invite_listen: true,
    p_lat: null,
    p_lng: null,
    p_accuracy_m: null,
  })
  if (upErr) console.warn('ensureMobileProximityLocationPrefsOn', upErr.message)
}
