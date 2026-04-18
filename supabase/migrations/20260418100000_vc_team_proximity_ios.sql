-- Profile location prefs + case proximity invites (team discovery & join-by-proximity).

CREATE OR REPLACE FUNCTION public.vc_distance_meters(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT (
    6371000.0 * acos(
      least(1::double precision, greatest(-1::double precision,
        cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2) - radians(lon1))
        + sin(radians(lat1)) * sin(radians(lat2))
      ))
    )
  )::double precision;
$$;

CREATE TABLE IF NOT EXISTS public.vc_profile_location_prefs (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  team_discovery_sharing boolean NOT NULL DEFAULT false,
  proximity_invite_listen boolean NOT NULL DEFAULT false,
  last_lat double precision,
  last_lng double precision,
  last_accuracy_m double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vc_profile_location_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vc_profile_location_prefs_own ON public.vc_profile_location_prefs;
CREATE POLICY vc_profile_location_prefs_own ON public.vc_profile_location_prefs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vc_profile_location_prefs TO authenticated;

CREATE TABLE IF NOT EXISTS public.vc_case_proximity_invites (
  case_id text NOT NULL PRIMARY KEY REFERENCES public.vc_cases (id) ON DELETE CASCADE,
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  radius_m double precision NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT vc_case_proximity_invites_radius_check CHECK (radius_m >= 25::double precision AND radius_m <= 10000::double precision)
);

CREATE INDEX IF NOT EXISTS idx_vc_case_proximity_invites_expires ON public.vc_case_proximity_invites (expires_at);

ALTER TABLE public.vc_case_proximity_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vc_case_proximity_invites_none ON public.vc_case_proximity_invites;
CREATE POLICY vc_case_proximity_invites_none ON public.vc_case_proximity_invites FOR ALL TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.vc_update_my_location_prefs(
  p_team_discovery_sharing boolean,
  p_proximity_invite_listen boolean,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_accuracy_m double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vc_profile_location_prefs (
    user_id, team_discovery_sharing, proximity_invite_listen, last_lat, last_lng, last_accuracy_m, updated_at
  )
  VALUES (
    auth.uid(),
    p_team_discovery_sharing,
    p_proximity_invite_listen,
    p_lat,
    p_lng,
    p_accuracy_m,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    team_discovery_sharing = EXCLUDED.team_discovery_sharing,
    proximity_invite_listen = EXCLUDED.proximity_invite_listen,
    last_lat = COALESCE(EXCLUDED.last_lat, vc_profile_location_prefs.last_lat),
    last_lng = COALESCE(EXCLUDED.last_lng, vc_profile_location_prefs.last_lng),
    last_accuracy_m = COALESCE(EXCLUDED.last_accuracy_m, vc_profile_location_prefs.last_accuracy_m),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.vc_update_my_location_prefs(boolean, boolean, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_update_my_location_prefs(boolean, boolean, double precision, double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.vc_register_case_proximity_invite(
  p_case_id text,
  p_center_lat double precision,
  p_center_lng double precision,
  p_radius_m double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_radius_m < 25 OR p_radius_m > 10000 THEN
    RAISE EXCEPTION 'radius out of range';
  END IF;

  SELECT c.owner_user_id INTO v_owner
  FROM public.vc_cases c
  WHERE c.id = p_case_id
  LIMIT 1;

  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not case owner';
  END IF;

  INSERT INTO public.vc_case_proximity_invites (case_id, center_lat, center_lng, radius_m, expires_at, created_by)
  VALUES (p_case_id, p_center_lat, p_center_lng, p_radius_m, now() + interval '30 minutes', auth.uid())
  ON CONFLICT (case_id) DO UPDATE SET
    center_lat = EXCLUDED.center_lat,
    center_lng = EXCLUDED.center_lng,
    radius_m = EXCLUDED.radius_m,
    expires_at = EXCLUDED.expires_at,
    created_by = EXCLUDED.created_by;
END;
$$;

REVOKE ALL ON FUNCTION public.vc_register_case_proximity_invite(text, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_register_case_proximity_invite(text, double precision, double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.vc_nearby_profiles_team_discovery(
  p_case_id text,
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision
)
RETURNS TABLE (
  id uuid,
  display_name text,
  email text,
  tax_number text,
  created_at timestamptz,
  distance_m double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF p_radius_m < 25 OR p_radius_m > 50000 THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_cases c
    WHERE c.id = p_case_id AND c.owner_user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    vp.id,
    vp.display_name,
    vp.email,
    vp.tax_number,
    vp.created_at,
    public.vc_distance_meters(p_lat, p_lng, lp.last_lat, lp.last_lng) AS distance_m
  FROM public.vc_profiles vp
  INNER JOIN public.vc_profile_location_prefs lp ON lp.user_id = vp.id
  WHERE lp.team_discovery_sharing = true
    AND lp.last_lat IS NOT NULL AND lp.last_lng IS NOT NULL
    AND vp.id <> auth.uid()
    AND vp.id <> (SELECT c.owner_user_id FROM public.vc_cases c WHERE c.id = p_case_id LIMIT 1)
    AND NOT EXISTS (
      SELECT 1 FROM public.vc_case_collaborators cc
      WHERE cc.case_id = p_case_id AND cc.user_id = vp.id
    )
    AND public.vc_distance_meters(p_lat, p_lng, lp.last_lat, lp.last_lng) <= p_radius_m
  ORDER BY distance_m
  LIMIT 25;
END;
$$;

REVOKE ALL ON FUNCTION public.vc_nearby_profiles_team_discovery(text, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_nearby_profiles_team_discovery(text, double precision, double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.vc_active_proximity_invites_at(
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE (
  case_id text,
  case_title text,
  creator_display_name text,
  creator_user_id uuid,
  distance_m double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_profile_location_prefs p
    WHERE p.user_id = uid AND p.proximity_invite_listen = true
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    inv.case_id,
    c.title AS case_title,
    prof.display_name AS creator_display_name,
    inv.created_by AS creator_user_id,
    public.vc_distance_meters(p_lat, p_lng, inv.center_lat, inv.center_lng) AS distance_m
  FROM public.vc_case_proximity_invites inv
  INNER JOIN public.vc_cases c ON c.id = inv.case_id
  INNER JOIN public.vc_profiles prof ON prof.id = inv.created_by
  WHERE inv.expires_at > now()
    AND inv.created_by <> uid
    AND public.vc_distance_meters(p_lat, p_lng, inv.center_lat, inv.center_lng) <= inv.radius_m
    AND NOT EXISTS (
      SELECT 1 FROM public.vc_case_collaborators cc
      WHERE cc.case_id = inv.case_id AND cc.user_id = uid
    )
    AND c.owner_user_id = inv.created_by;
END;
$$;

REVOKE ALL ON FUNCTION public.vc_active_proximity_invites_at(double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_active_proximity_invites_at(double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.vc_accept_proximity_case_invite(
  p_case_id text,
  p_lat double precision,
  p_lng double precision
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  inv public.vc_case_proximity_invites%ROWTYPE;
  d double precision;
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO inv FROM public.vc_case_proximity_invites WHERE case_id = p_case_id FOR UPDATE;
  IF NOT FOUND OR inv.expires_at <= now() THEN
    RETURN false;
  END IF;

  d := public.vc_distance_meters(p_lat, p_lng, inv.center_lat, inv.center_lng);
  IF d > inv.radius_m THEN
    RETURN false;
  END IF;

  IF inv.created_by = uid THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.vc_case_collaborators cc WHERE cc.case_id = p_case_id AND cc.user_id = uid) THEN
    RETURN true;
  END IF;

  INSERT INTO public.vc_case_collaborators (case_id, user_id, role, created_at_ms)
  VALUES (p_case_id, uid, 'editor', (extract(epoch from now()) * 1000)::bigint)
  ON CONFLICT (case_id, user_id) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.vc_accept_proximity_case_invite(text, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_accept_proximity_case_invite(text, double precision, double precision) TO authenticated;
