# Deploy: Supabase + Vercel (production vs preview parity)

Vite bakes `VITE_*` variables into the client at **build time**. Preview deployments and Production can produce **different apps** if their environment variables differ.

## 1. Vercel — mirror these on Production and Preview

In the Vercel project: **Settings → Environment Variables**

| Variable | Value | Notes |
|----------|--------|--------|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Same project as Auth + DB |
| `VITE_SUPABASE_ANON_KEY` | **Publishable** key (`sb_publishable_...`) *or* legacy **anon public** JWT (`eyJ...`) from API Settings → API Keys | Never **service_role** / **secret** keys |
| `VITE_VC_RELATIONAL_BACKEND` | `true` | Literal `true` (no quotes in the value field) |

- Enable each variable for **Production** and **Preview** (and **Development** if you use `vercel dev`).
- After changing variables, **redeploy** the affected deployment (especially Production for `videocanvass-web.vercel.app`).

**Symptom if Production is missing the flag or keys:** mock “choose demo user” sign-in, long loading, or no email/password login — while a preview URL behaves differently.

## 2. Supabase — Auth URL configuration

**Authentication → URL configuration**

- **Site URL:** `https://videocanvass-web.vercel.app` (or your primary custom domain)
- **Redirect URLs:** include the production URL and any preview URLs you use, for example:
  - `https://videocanvass-web.vercel.app/**`
  - `https://*.vercel.app/**` (only if acceptable for your security posture)

## 3. Database — schema, then RLS

### Empty `public` schema (no tables in Table Editor)

If **Table Editor → `public`** shows no tables, the project was never migrated. Running only the RLS reset script will error (`relation "public.vc_cases" does not exist`).

Apply migrations **in this order** (SQL editor: open each file from the repo, paste the full contents, **Run**; role **postgres** is fine):

1. [`supabase/migrations/20260401120000_vc_relational_core.sql`](../supabase/migrations/20260401120000_vc_relational_core.sql) — creates all `vc_*` tables, RLS, storage bucket hooks.
2. [`supabase/migrations/20260402130000_vc_lifecycle_global_canvass.sql`](../supabase/migrations/20260402130000_vc_lifecycle_global_canvass.sql)
3. [`supabase/migrations/20260407120000_vc_track_points_placement_source.sql`](../supabase/migrations/20260407120000_vc_track_points_placement_source.sql)
4. (Optional but recommended) [`supabase/migrations/20260410120000_vc_rls_reset_grants.sql`](../supabase/migrations/20260410120000_vc_rls_reset_grants.sql) — canonical `vc_cases` policies + `GRANT`s.

Alternatively, from the repo with the CLI linked to this project: `supabase db push`.

### Reset policies (if inserts still fail on an already-migrated DB)

Apply migration [`supabase/migrations/20260410120000_vc_rls_reset_grants.sql`](../supabase/migrations/20260410120000_vc_rls_reset_grants.sql) via **`supabase db push`** or by pasting it into the SQL editor. It:

- Drops **every** policy on `public.vc_cases` (including duplicates from the Dashboard), then recreates the four canonical owner-based policies with explicit `auth.uid() IS NOT NULL` checks.
- Re-applies `GRANT` on `vc_*` tables to `authenticated` (harmless if already present).

### Inspect current policies

In **SQL Editor**, run [`supabase/queries/verify_vc_cases_policies.sql`](../supabase/queries/verify_vc_cases_policies.sql). After the reset migration you should see exactly **four** rows for `vc_cases`: `vc_cases_select`, `vc_cases_insert`, `vc_cases_update`, `vc_cases_delete`, all **PERMISSIVE**.

## 4. Debug build (optional)

Set `VITE_VC_DEBUG=true` on a preview deployment to show a small build-info strip and extra console diagnostics around `vc_cases` upsert (no secrets logged).

## 5. Browser check when saves fail with RLS

Open DevTools → **Network**, trigger a save, inspect the request to `.../rest/v1/vc_cases`:

- There must be an `Authorization: Bearer ...` header.
- The request host must match your `VITE_SUPABASE_URL` host.

If the JWT is missing or the host does not match the project where the user signed in, you will see `new row violates row-level security` even with correct app code.
