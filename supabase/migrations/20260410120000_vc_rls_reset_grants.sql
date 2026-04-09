-- Reset vc_cases RLS to a known-good state and ensure authenticated can reach tables under RLS.
--
-- Prerequisite: public.vc_cases must already exist. On an empty project (Table Editor shows
-- no public tables), run migrations in order starting with:
--   supabase/migrations/20260401120000_vc_relational_core.sql
-- then 20260402130000, 20260407120000, then this file — or use `supabase db push`.
--
-- Use when:
-- - Extra policies were added in the Supabase Dashboard and inserts fail mysteriously
-- - "new row violates row-level security" persists despite correct client env + JWT
--
-- Safe to run multiple times (idempotent policy names + grants).

DO $$
BEGIN
  IF to_regclass('public.vc_cases') IS NULL THEN
    RAISE EXCEPTION
      'public.vc_cases does not exist. Bootstrap the database first: open supabase/migrations/20260401120000_vc_relational_core.sql, paste the full file into the SQL editor, run it, then run later migrations in filename order (or run `supabase db push` from the repo).';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Drop ALL policies on vc_cases (including duplicates / manual dashboard policies)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN (
    SELECT policyname AS pname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vc_cases'
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.vc_cases', r.pname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Canonical vc_cases policies (match app contract: owner-only writes)
-- ---------------------------------------------------------------------------
CREATE POLICY vc_cases_select ON public.vc_cases
  FOR SELECT
  TO authenticated
  USING (public.vc_case_visible(id));

-- Explicit NULL checks: if auth.uid() is NULL (no JWT), fail clearly at policy layer.
CREATE POLICY vc_cases_insert ON public.vc_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_user_id IS NOT NULL
    AND owner_user_id = auth.uid()
  );

CREATE POLICY vc_cases_update ON public.vc_cases
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND owner_user_id = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_user_id IS NOT NULL
    AND owner_user_id = auth.uid()
  );

CREATE POLICY vc_cases_delete ON public.vc_cases
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND owner_user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3) Defensive GRANTs for authenticated (no-op if already granted)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_units TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_user_department_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_user_unit_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_cases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_case_collaborators TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_tracks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_track_points TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_case_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vc_audit_log TO authenticated;

-- Table added in 20260402130000; skip grant if that migration was not applied.
DO $$
BEGIN
  IF to_regclass('public.vc_global_canvass_results') IS NOT NULL THEN
    GRANT SELECT ON TABLE public.vc_global_canvass_results TO authenticated;
  END IF;
END $$;
