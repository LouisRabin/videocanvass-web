-- Case owners may search all vc_profiles by email or tax_number to add collaborators.
-- Direct SELECT on vc_profiles is limited by RLS to co-case users; this RPC is owner-gated.

CREATE OR REPLACE FUNCTION public.vc_search_profiles_for_case_team(p_case_id text, p_query text)
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
DECLARE
  q text;
BEGIN
  q := trim(p_query);
  IF length(q) < 2 THEN
    RETURN;
  END IF;

  -- Avoid user-supplied ILIKE wildcards; escape % and _ for ESCAPE '\'
  q := replace(replace(replace(q, E'\\', ''), '%', E'\%'), '_', E'\_');

  IF NOT EXISTS (
    SELECT 1 FROM public.vc_cases c
    WHERE c.id = p_case_id AND c.owner_user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT vp.id, vp.display_name, vp.email, vp.tax_number, vp.created_at
  FROM public.vc_profiles vp
  WHERE vp.id <> auth.uid()
    AND vp.id <> (SELECT c.owner_user_id FROM public.vc_cases c WHERE c.id = p_case_id LIMIT 1)
    AND NOT EXISTS (
      SELECT 1 FROM public.vc_case_collaborators cc
      WHERE cc.case_id = p_case_id AND cc.user_id = vp.id
    )
    AND (
      vp.email ILIKE '%' || q || '%' ESCAPE '\'
      OR vp.tax_number ILIKE '%' || q || '%' ESCAPE '\'
    )
  ORDER BY lower(vp.email)
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.vc_search_profiles_for_case_team(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_search_profiles_for_case_team(text, text) TO authenticated;
