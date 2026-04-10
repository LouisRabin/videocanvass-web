-- Preselect via SELECT under RLS cannot see rows the user does not own. Upsert then does
-- INSERT ... ON CONFLICT DO UPDATE; the UPDATE branch hits RLS and fails with
-- "new row violates row-level security" even though the client thought the id was free.
-- This RPC bypasses RLS only to read (id, owner_user_id) for the given ids so the client
-- can skip conflicting ids or use INSERT-only when there is no row.

CREATE OR REPLACE FUNCTION public.vc_case_owners_for_ids(p_ids text[])
RETURNS TABLE (id text, owner_user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.id, c.owner_user_id
  FROM public.vc_cases c
  WHERE c.id = ANY (p_ids);
$$;

REVOKE ALL ON FUNCTION public.vc_case_owners_for_ids(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vc_case_owners_for_ids(text[]) TO authenticated;
