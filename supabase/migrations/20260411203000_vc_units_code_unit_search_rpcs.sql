-- Short unit identifier for owner search / team add-by-unit flows.
ALTER TABLE public.vc_units
  ADD COLUMN IF NOT EXISTS code text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.vc_units.code IS 'Unit code for search (e.g. precinct). Empty allowed for legacy rows.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_vc_units_code_lower_unique
  ON public.vc_units (lower(trim(code)))
  WHERE trim(code) <> '';

-- ---------------------------------------------------------------------------
-- Case owner: search units by code or name
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vc_search_units_for_case_team(p_case_id text, p_query text)
RETURNS TABLE (
  id uuid,
  name text,
  code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  q text;
BEGIN
  q := trim(p_query);
  IF length(q) < 2 THEN
    RETURN;
  END IF;

  q := replace(replace(replace(q, E'\\', ''), '%', E'\%'), '_', E'\_');

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_cases c
    WHERE c.id = p_case_id AND c.owner_user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.name, u.code
  FROM public.vc_units u
  WHERE (
      (trim(u.code) <> '' AND u.code ILIKE '%' || q || '%' ESCAPE '\')
      OR u.name ILIKE '%' || q || '%' ESCAPE '\'
    )
  ORDER BY lower(nullif(trim(u.code), '')) NULLS LAST, lower(u.name)
  LIMIT 15;
END;
$$;

REVOKE ALL ON FUNCTION public.vc_search_units_for_case_team(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_search_units_for_case_team(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Case owner: profiles for users assigned to a unit (add team / multi-select)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vc_unit_member_profiles_for_case_team(p_case_id text, p_unit_id uuid)
RETURNS TABLE (
  id uuid,
  display_name text,
  email text,
  tax_number text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vc_cases c
    WHERE c.id = p_case_id AND c.owner_user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vc_units u WHERE u.id = p_unit_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.email, p.tax_number, p.created_at
  FROM public.vc_user_unit_members uum
  JOIN public.vc_profiles p ON p.id = uum.user_id
  WHERE uum.unit_id = p_unit_id
    AND p.id <> auth.uid()
    AND p.id <> (SELECT c.owner_user_id FROM public.vc_cases c WHERE c.id = p_case_id LIMIT 1)
    AND NOT EXISTS (
      SELECT 1 FROM public.vc_case_collaborators cc
      WHERE cc.case_id = p_case_id AND cc.user_id = p.id
    )
  ORDER BY lower(p.email)
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION public.vc_unit_member_profiles_for_case_team(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_unit_member_profiles_for_case_team(text, uuid) TO authenticated;
