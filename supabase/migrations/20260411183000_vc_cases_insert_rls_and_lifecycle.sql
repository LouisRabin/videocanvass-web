-- vc_cases INSERT returns 403 / "new row violates row-level security" fixes:
-- 1) Ensure `lifecycle` exists (app upserts this column; missing column → different errors, but
--    projects that skipped 20260402130000 need the column).
-- 2) Replace vc_cases INSERT policy with the canonical owner = auth.uid() check.
-- 3) Re-assert GRANT so `authenticated` can INSERT (dashboard experiments sometimes revoke grants).
--
-- Apply via `supabase db push` or paste into the Supabase SQL editor.

ALTER TABLE public.vc_cases
  ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vc_cases_lifecycle_check'
  ) THEN
    ALTER TABLE public.vc_cases
      ADD CONSTRAINT vc_cases_lifecycle_check CHECK (lifecycle IN ('open', 'closed'));
  END IF;
END $$;

DROP POLICY IF EXISTS vc_cases_insert ON public.vc_cases;

CREATE POLICY vc_cases_insert ON public.vc_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_user_id IS NOT NULL
    AND owner_user_id = auth.uid()
  );

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE public.vc_cases TO authenticated;
