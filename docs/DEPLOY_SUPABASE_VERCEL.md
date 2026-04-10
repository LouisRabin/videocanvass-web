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

## 2a. Outbound auth email (Resend + `cameracanvass.com`)

If you send Supabase Auth mail through **Resend** from your domain, follow [**docs/RESEND_CAMERACANVASS.md**](./RESEND_CAMERACANVASS.md) (verify domain, SMTP in Supabase, sender `noreply@cameracanvass.com`).

## 2. Supabase — Auth URL configuration

**Authentication → URL configuration**

- **Site URL:** `https://videocanvass-web.vercel.app` (or your primary custom domain)
- **Redirect URLs:** include the production URL and any preview URLs you use, for example:
  - `https://videocanvass-web.vercel.app/**`
  - `https://*.vercel.app/**` (only if acceptable for your security posture)

### Password reset (“Forgot password”)

The app calls `resetPasswordForEmail` with `redirectTo` set to your current origin and path (see `passwordRecoveryRedirectTo()` in `src/lib/authPasswordReset.ts`). After the user clicks the email link, Supabase redirects back with tokens in the URL hash so they can set a new password.

**Important:** **`redirectTo` must be a full URL including `https://`**. If Supabase or the dashboard uses a bare hostname (e.g. `cameracanvass.com` or `videocanvass-web.vercel.app` without a scheme), the browser can end up at `https://<project>.supabase.co/your-hostname#access_token=…` and show `{"error":"requested path is invalid"}` — Supabase treats the hostname as a **path** on `*.supabase.co`. Fix:

- **Authentication → URL configuration → Site URL:** use `https://your-domain` (with `https://`), not the hostname alone.
- **Redirect URLs:** keep using patterns like `https://your-app.vercel.app/**`.

Optional: set **`VITE_VC_SITE_URL`** in Vercel to the same public origin (e.g. `https://videocanvass-web.vercel.app`) so the reset link always uses that value even if `window.location` is unusual (some embedded browsers).

1. **Redirect allow list:** Add the exact URLs users can land on after clicking the email link, e.g.:
   - `http://localhost:5173/**` (Vite dev)
   - `https://videocanvass-web.vercel.app/**`
   - Preview URLs if you use them (`https://*.vercel.app/**` or each preview host).
2. **Email:** Under **Authentication → Providers → Email**, keep **Confirm email** / **Secure email change** as you prefer. Password reset emails are sent by Supabase (or your custom SMTP if configured under **Project Settings → Auth**).
3. **Template (optional):** **Authentication → Email templates → Reset password** — the repo includes a branded HTML layout at [`supabase/templates/recovery.html`](../supabase/templates/recovery.html). For **hosted** Supabase, open that file, copy the full HTML into the dashboard editor, and keep the Go variables intact (`{{ .ConfirmationURL }}`, `{{ .Email }}`). For **local** `supabase start`, it is wired in [`supabase/config.toml`](../supabase/config.toml) under `[auth.email.template.recovery]`.

If reset links redirect to the wrong host or show an “invalid redirect” error, the URL is missing from **Redirect URLs**.

### “Email rate limit exceeded” (forgot password / sign-up mail)

Supabase caps how many auth emails (reset, confirm, magic link) can be sent **per hour** per project. If testers hit **Forgot password** many times, you’ll see this until the window resets.

- **Hosted (supabase.co):** Dashboard → **Authentication** → **Rate limits** (wording may vary by dashboard version). Increase the email quota if your plan allows, or wait for the hourly window to roll over.
- **Local `supabase start`:** Repo `supabase/config.toml` → `[auth.rate_limit]` → `email_sent` (defaults were raised in-repo for dev). Restart the stack after editing: `supabase stop` then `supabase start`.

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
