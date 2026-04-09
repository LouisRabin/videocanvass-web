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

## 3. Database — verify `vc_cases` RLS policies

In **SQL Editor**, run the query in [`supabase/queries/verify_vc_cases_policies.sql`](../supabase/queries/verify_vc_cases_policies.sql).

Confirm there are no unexpected extra `INSERT` policies or `RESTRICTIVE` policies beyond your migrations.

## 4. Debug build (optional)

Set `VITE_VC_DEBUG=true` on a preview deployment to show a small build-info strip and extra console diagnostics around `vc_cases` upsert (no secrets logged).

## 5. Browser check when saves fail with RLS

Open DevTools → **Network**, trigger a save, inspect the request to `.../rest/v1/vc_cases`:

- There must be an `Authorization: Bearer ...` header.
- The request host must match your `VITE_SUPABASE_URL` host.

If the JWT is missing or the host does not match the project where the user signed in, you will see `new row violates row-level security` even with correct app code.
