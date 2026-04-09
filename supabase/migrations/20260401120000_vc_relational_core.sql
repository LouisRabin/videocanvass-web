-- VideoCanvass relational core: org groups (Department/Unit), cases, RLS, audit, storage bucket.
-- Apply with Supabase CLI: `supabase db push` or paste into SQL editor.
-- Requires Supabase Auth (auth.users).

-- ---------------------------------------------------------------------------
-- Organizations, departments, units (directory / access groups)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vc_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.vc_organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_departments_org ON public.vc_departments (organization_id);

CREATE TABLE IF NOT EXISTS public.vc_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.vc_departments (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_units_department ON public.vc_units (department_id);

CREATE TABLE IF NOT EXISTS public.vc_user_department_members (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.vc_departments (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, department_id)
);

CREATE TABLE IF NOT EXISTS public.vc_user_unit_members (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.vc_units (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_vc_user_unit_members_user ON public.vc_user_unit_members (user_id);

-- ---------------------------------------------------------------------------
-- Profiles (1:1 auth.users; app user directory fields)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  tax_number text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_profiles_email ON public.vc_profiles (lower(email));

-- ---------------------------------------------------------------------------
-- Cases and collaborators
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_cases (
  id text PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.vc_organizations (id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.vc_units (id) ON DELETE SET NULL,
  case_number text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vc_cases_owner ON public.vc_cases (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_vc_cases_unit ON public.vc_cases (unit_id);

CREATE TABLE IF NOT EXISTS public.vc_case_collaborators (
  case_id text NOT NULL REFERENCES public.vc_cases (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor')),
  created_at_ms bigint NOT NULL,
  PRIMARY KEY (case_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Domain tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_locations (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES public.vc_cases (id) ON DELETE CASCADE,
  address_text text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  bounds jsonb,
  footprint jsonb,
  status text NOT NULL,
  notes text NOT NULL DEFAULT '',
  last_visited_at_ms bigint,
  created_by_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vc_locations_case ON public.vc_locations (case_id);

CREATE TABLE IF NOT EXISTS public.vc_tracks (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES public.vc_cases (id) ON DELETE CASCADE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'person',
  route_color text NOT NULL DEFAULT '',
  created_by_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vc_tracks_case ON public.vc_tracks (case_id);

CREATE TABLE IF NOT EXISTS public.vc_track_points (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES public.vc_cases (id) ON DELETE CASCADE,
  track_id text NOT NULL REFERENCES public.vc_tracks (id) ON DELETE CASCADE,
  location_id text REFERENCES public.vc_locations (id) ON DELETE SET NULL,
  address_text text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  visited_at_ms bigint,
  notes text NOT NULL DEFAULT '',
  show_on_map boolean NOT NULL DEFAULT true,
  display_time_on_map boolean NOT NULL DEFAULT false,
  map_time_label_offset_x integer NOT NULL DEFAULT 0,
  map_time_label_offset_y integer NOT NULL DEFAULT 0,
  created_by_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vc_track_points_case ON public.vc_track_points (case_id);
CREATE INDEX IF NOT EXISTS idx_vc_track_points_track ON public.vc_track_points (track_id);

CREATE TABLE IF NOT EXISTS public.vc_case_attachments (
  id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES public.vc_cases (id) ON DELETE CASCADE,
  kind text NOT NULL,
  caption text NOT NULL DEFAULT '',
  image_data_url text,
  image_storage_path text,
  content_type text,
  created_by_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vc_case_attachments_case ON public.vc_case_attachments (case_id);

-- ---------------------------------------------------------------------------
-- Audit log (append-only; client inserts own actor row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vc_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  case_id text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vc_audit_actor ON public.vc_audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_vc_audit_case ON public.vc_audit_log (case_id);
CREATE INDEX IF NOT EXISTS idx_vc_audit_created ON public.vc_audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- Helper: can user see case (owner, collaborator, or unit member when case.unit_id set)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vc_case_visible(p_case_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vc_cases c
    WHERE c.id = p_case_id
      AND (
        c.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.vc_case_collaborators cc
          WHERE cc.case_id = c.id AND cc.user_id = auth.uid()
        )
        OR (
          c.unit_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.vc_user_unit_members uu
            WHERE uu.user_id = auth.uid() AND uu.unit_id = c.unit_id
          )
        )
      )
  );
$$;

-- Owner or editor collaborator (viewer = read-only in app)
CREATE OR REPLACE FUNCTION public.vc_case_editor(p_case_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vc_cases c
    WHERE c.id = p_case_id
      AND (
        c.owner_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.vc_case_collaborators cc
          WHERE cc.case_id = c.id
            AND cc.user_id = auth.uid()
            AND cc.role = 'editor'
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.vc_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_user_department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_user_unit_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_case_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_track_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_case_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vc_audit_log ENABLE ROW LEVEL SECURITY;

-- Idempotent: safe to re-run in SQL editor after a partial apply (avoids 42710 policy already exists).
DROP POLICY IF EXISTS vc_org_select ON public.vc_organizations;
DROP POLICY IF EXISTS vc_dept_select ON public.vc_departments;
DROP POLICY IF EXISTS vc_unit_select ON public.vc_units;
DROP POLICY IF EXISTS vc_udm_select ON public.vc_user_department_members;
DROP POLICY IF EXISTS vc_uum_select ON public.vc_user_unit_members;
DROP POLICY IF EXISTS vc_profiles_select ON public.vc_profiles;
DROP POLICY IF EXISTS vc_profiles_update ON public.vc_profiles;
DROP POLICY IF EXISTS vc_cases_select ON public.vc_cases;
DROP POLICY IF EXISTS vc_cases_insert ON public.vc_cases;
DROP POLICY IF EXISTS vc_cases_update ON public.vc_cases;
DROP POLICY IF EXISTS vc_cases_delete ON public.vc_cases;
DROP POLICY IF EXISTS vc_cc_select ON public.vc_case_collaborators;
DROP POLICY IF EXISTS vc_cc_ins ON public.vc_case_collaborators;
DROP POLICY IF EXISTS vc_cc_upd ON public.vc_case_collaborators;
DROP POLICY IF EXISTS vc_cc_del ON public.vc_case_collaborators;
DROP POLICY IF EXISTS vc_loc_select ON public.vc_locations;
DROP POLICY IF EXISTS vc_loc_insert ON public.vc_locations;
DROP POLICY IF EXISTS vc_loc_update ON public.vc_locations;
DROP POLICY IF EXISTS vc_loc_delete ON public.vc_locations;
DROP POLICY IF EXISTS vc_tracks_select ON public.vc_tracks;
DROP POLICY IF EXISTS vc_tracks_write_ins ON public.vc_tracks;
DROP POLICY IF EXISTS vc_tracks_write_upd ON public.vc_tracks;
DROP POLICY IF EXISTS vc_tracks_del ON public.vc_tracks;
DROP POLICY IF EXISTS vc_tp_select ON public.vc_track_points;
DROP POLICY IF EXISTS vc_tp_ins ON public.vc_track_points;
DROP POLICY IF EXISTS vc_tp_upd ON public.vc_track_points;
DROP POLICY IF EXISTS vc_tp_del ON public.vc_track_points;
DROP POLICY IF EXISTS vc_att_select ON public.vc_case_attachments;
DROP POLICY IF EXISTS vc_att_ins ON public.vc_case_attachments;
DROP POLICY IF EXISTS vc_att_upd ON public.vc_case_attachments;
DROP POLICY IF EXISTS vc_att_del ON public.vc_case_attachments;
DROP POLICY IF EXISTS vc_audit_ins ON public.vc_audit_log;
DROP POLICY IF EXISTS vc_audit_sel ON public.vc_audit_log;
DROP POLICY IF EXISTS case_attachments_select ON storage.objects;
DROP POLICY IF EXISTS case_attachments_insert ON storage.objects;
DROP POLICY IF EXISTS case_attachments_update ON storage.objects;
DROP POLICY IF EXISTS case_attachments_delete ON storage.objects;

-- Organizations / directory: any signed-in user can read (narrow for v2 via org membership)
CREATE POLICY vc_org_select ON public.vc_organizations FOR SELECT TO authenticated USING (true);
CREATE POLICY vc_dept_select ON public.vc_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY vc_unit_select ON public.vc_units FOR SELECT TO authenticated USING (true);

CREATE POLICY vc_udm_select ON public.vc_user_department_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY vc_uum_select ON public.vc_user_unit_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Profiles: read co-workers on shared cases; update self
CREATE POLICY vc_profiles_select ON public.vc_profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.vc_cases c
      WHERE public.vc_case_visible(c.id)
        AND (
          c.owner_user_id = vc_profiles.id
          OR EXISTS (
            SELECT 1 FROM public.vc_case_collaborators cc
            WHERE cc.case_id = c.id AND cc.user_id = vc_profiles.id
          )
        )
    )
  );

CREATE POLICY vc_profiles_update ON public.vc_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Cases
CREATE POLICY vc_cases_select ON public.vc_cases FOR SELECT TO authenticated
  USING (public.vc_case_visible(id));

CREATE POLICY vc_cases_insert ON public.vc_cases FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY vc_cases_update ON public.vc_cases FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY vc_cases_delete ON public.vc_cases FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

-- Collaborators
CREATE POLICY vc_cc_select ON public.vc_case_collaborators FOR SELECT TO authenticated
  USING (public.vc_case_visible(case_id));

CREATE POLICY vc_cc_ins ON public.vc_case_collaborators FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.vc_cases c WHERE c.id = case_id AND c.owner_user_id = auth.uid())
  );

CREATE POLICY vc_cc_upd ON public.vc_case_collaborators FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.vc_cases c WHERE c.id = case_id AND c.owner_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.vc_cases c WHERE c.id = case_id AND c.owner_user_id = auth.uid())
  );

CREATE POLICY vc_cc_del ON public.vc_case_collaborators FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.vc_cases c WHERE c.id = case_id AND c.owner_user_id = auth.uid())
  );

-- Locations: viewers read; editors/owners write (coarse editor — matches “team can add” baseline)
CREATE POLICY vc_loc_select ON public.vc_locations FOR SELECT TO authenticated
  USING (public.vc_case_visible(case_id));

CREATE POLICY vc_loc_insert ON public.vc_locations FOR INSERT TO authenticated
  WITH CHECK (public.vc_case_editor(case_id));

CREATE POLICY vc_loc_update ON public.vc_locations FOR UPDATE TO authenticated
  USING (public.vc_case_editor(case_id))
  WITH CHECK (public.vc_case_editor(case_id));

CREATE POLICY vc_loc_delete ON public.vc_locations FOR DELETE TO authenticated
  USING (public.vc_case_editor(case_id));

-- Tracks / points / attachments: same pattern
CREATE POLICY vc_tracks_select ON public.vc_tracks FOR SELECT TO authenticated
  USING (public.vc_case_visible(case_id));
CREATE POLICY vc_tracks_write_ins ON public.vc_tracks FOR INSERT TO authenticated
  WITH CHECK (public.vc_case_editor(case_id));
CREATE POLICY vc_tracks_write_upd ON public.vc_tracks FOR UPDATE TO authenticated
  USING (public.vc_case_editor(case_id))
  WITH CHECK (public.vc_case_editor(case_id));
CREATE POLICY vc_tracks_del ON public.vc_tracks FOR DELETE TO authenticated
  USING (public.vc_case_editor(case_id));

CREATE POLICY vc_tp_select ON public.vc_track_points FOR SELECT TO authenticated
  USING (public.vc_case_visible(case_id));
CREATE POLICY vc_tp_ins ON public.vc_track_points FOR INSERT TO authenticated
  WITH CHECK (public.vc_case_editor(case_id));
CREATE POLICY vc_tp_upd ON public.vc_track_points FOR UPDATE TO authenticated
  USING (public.vc_case_editor(case_id))
  WITH CHECK (public.vc_case_editor(case_id));
CREATE POLICY vc_tp_del ON public.vc_track_points FOR DELETE TO authenticated
  USING (public.vc_case_editor(case_id));

CREATE POLICY vc_att_select ON public.vc_case_attachments FOR SELECT TO authenticated
  USING (public.vc_case_visible(case_id));
CREATE POLICY vc_att_ins ON public.vc_case_attachments FOR INSERT TO authenticated
  WITH CHECK (public.vc_case_editor(case_id));
CREATE POLICY vc_att_upd ON public.vc_case_attachments FOR UPDATE TO authenticated
  USING (public.vc_case_editor(case_id))
  WITH CHECK (public.vc_case_editor(case_id));
CREATE POLICY vc_att_del ON public.vc_case_attachments FOR DELETE TO authenticated
  USING (public.vc_case_editor(case_id));

-- Audit
CREATE POLICY vc_audit_ins ON public.vc_audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());
CREATE POLICY vc_audit_sel ON public.vc_audit_log FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- New user profile row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vc_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vc_profiles (id, display_name, email, tax_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'tax_number', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- Use EXECUTE FUNCTION instead of EXECUTE PROCEDURE on PostgreSQL 14+ if the migration errors.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.vc_handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage bucket for case photos (private; path: {caseId}/{attachmentId})
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('case-attachments', 'case-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY case_attachments_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-attachments'
    AND public.vc_case_visible(split_part(name, '/', 1))
  );

CREATE POLICY case_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-attachments'
    AND public.vc_case_editor(split_part(name, '/', 1))
  );

CREATE POLICY case_attachments_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'case-attachments'
    AND public.vc_case_editor(split_part(name, '/', 1))
  );

CREATE POLICY case_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'case-attachments'
    AND public.vc_case_editor(split_part(name, '/', 1))
  );
