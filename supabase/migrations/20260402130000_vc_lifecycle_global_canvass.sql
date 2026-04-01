-- Case open/closed, profile admin role, global canvass aggregate (no notes; admin read-only via RLS).

ALTER TABLE public.vc_profiles
  ADD COLUMN IF NOT EXISTS app_role text NOT NULL DEFAULT 'user';

-- Relax then re-apply check if column pre-existed without constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vc_profiles_app_role_check'
  ) THEN
    ALTER TABLE public.vc_profiles
      ADD CONSTRAINT vc_profiles_app_role_check CHECK (app_role IN ('user', 'admin'));
  END IF;
END $$;

ALTER TABLE public.vc_cases
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vc_cases_lifecycle_check'
  ) THEN
    ALTER TABLE public.vc_cases
      ADD CONSTRAINT vc_cases_lifecycle_check CHECK (lifecycle IN ('open', 'closed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.vc_global_canvass_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_location_id text NOT NULL UNIQUE REFERENCES public.vc_locations (id) ON DELETE CASCADE,
  source_case_id text NOT NULL REFERENCES public.vc_cases (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.vc_organizations (id) ON DELETE SET NULL,
  address_fingerprint text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  canvass_status text NOT NULL,
  has_cameras boolean NOT NULL,
  updated_at_ms bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vc_global_canvass_org ON public.vc_global_canvass_results (organization_id);
CREATE INDEX IF NOT EXISTS idx_vc_global_canvass_status ON public.vc_global_canvass_results (canvass_status);

ALTER TABLE public.vc_global_canvass_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vc_global_canvass_select_admin ON public.vc_global_canvass_results;
CREATE POLICY vc_global_canvass_select_admin ON public.vc_global_canvass_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.vc_profiles p WHERE p.id = auth.uid() AND p.app_role = 'admin')
  );

CREATE OR REPLACE FUNCTION public.vc_sync_global_canvass_from_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  fp text;
BEGIN
  SELECT c.organization_id INTO org_id FROM public.vc_cases c WHERE c.id = NEW.case_id;
  fp := lower(trim(NEW.address_text));
  INSERT INTO public.vc_global_canvass_results (
    source_location_id, source_case_id, organization_id,
    address_fingerprint, lat, lon, canvass_status, has_cameras, updated_at_ms
  )
  VALUES (
    NEW.id, NEW.case_id, org_id, fp, NEW.lat, NEW.lon, NEW.status,
    NEW.status <> 'noCameras', NEW.updated_at_ms
  )
  ON CONFLICT (source_location_id) DO UPDATE SET
    source_case_id = EXCLUDED.source_case_id,
    organization_id = EXCLUDED.organization_id,
    address_fingerprint = EXCLUDED.address_fingerprint,
    lat = EXCLUDED.lat,
    lon = EXCLUDED.lon,
    canvass_status = EXCLUDED.canvass_status,
    has_cameras = EXCLUDED.has_cameras,
    updated_at_ms = EXCLUDED.updated_at_ms;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vc_locations_global_canvass ON public.vc_locations;
CREATE TRIGGER trg_vc_locations_global_canvass
  AFTER INSERT OR UPDATE OF status, lat, lon, address_text, case_id, updated_at_ms ON public.vc_locations
  FOR EACH ROW
  EXECUTE PROCEDURE public.vc_sync_global_canvass_from_location();

-- Backfill existing locations (idempotent per row)
INSERT INTO public.vc_global_canvass_results (
  source_location_id, source_case_id, organization_id,
  address_fingerprint, lat, lon, canvass_status, has_cameras, updated_at_ms
)
SELECT
  l.id,
  l.case_id,
  c.organization_id,
  lower(trim(l.address_text)),
  l.lat,
  l.lon,
  l.status,
  l.status <> 'noCameras',
  l.updated_at_ms
FROM public.vc_locations l
JOIN public.vc_cases c ON c.id = l.case_id
ON CONFLICT (source_location_id) DO UPDATE SET
  source_case_id = EXCLUDED.source_case_id,
  organization_id = EXCLUDED.organization_id,
  address_fingerprint = EXCLUDED.address_fingerprint,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  canvass_status = EXCLUDED.canvass_status,
  has_cameras = EXCLUDED.has_cameras,
  updated_at_ms = EXCLUDED.updated_at_ms;
