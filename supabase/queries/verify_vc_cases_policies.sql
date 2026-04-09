-- Run in Supabase SQL Editor (privileged). Inspect vc_cases RLS policies for unexpected extras.
-- Expected from migrations: vc_cases_select, vc_cases_insert, vc_cases_update, vc_cases_delete (permissive).

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'vc_cases'
ORDER BY policyname;
