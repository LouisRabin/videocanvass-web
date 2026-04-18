import { relationalBackendEnabled } from './backendMode'
import { isMobileProximityClient } from './mobilePlatform'
import { supabase } from './supabase'

/**
 * Mobile: write current coordinates to `vc_profile_location_prefs` so **other** case owners can find this
 * user via `vc_nearby_profiles_team_discovery`. Flags-only ensure is not enough — SQL requires last_lat/last_lng.
 */
export async function publishMobileTeamDiscoveryLocation(
  lat: number,
  lng: number,
  accuracyM?: number | null,
): Promise<void> {
  if (!isMobileProximityClient() || !relationalBackendEnabled() || !supabase) return
  const { data, error } = await supabase
    .from('vc_profile_location_prefs')
    .select('proximity_invite_listen')
    .maybeSingle()
  if (error) return
  const listen =
    (data as { proximity_invite_listen?: boolean } | null)?.proximity_invite_listen !== false

  const { error: upErr } = await supabase.rpc('vc_update_my_location_prefs', {
    p_team_discovery_sharing: true,
    p_proximity_invite_listen: listen,
    p_lat: lat,
    p_lng: lng,
    p_accuracy_m: accuracyM ?? null,
  })
  if (upErr) console.warn('publishMobileTeamDiscoveryLocation', upErr.message)
}

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
