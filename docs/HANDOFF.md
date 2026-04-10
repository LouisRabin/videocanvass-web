# VideoCanvass Web — engineering handoff

Last updated: 2026-04-10 (case roadmap + unit access handoff).

## Recent session (case feature roadmap)

- **Case page splits:** `CaseAddressesListPanel` ([`src/app/case/CaseListTab.tsx`](../src/app/case/CaseListTab.tsx)), `CaseWorkspaceModeTabs` ([`CaseMapTab.tsx`](../src/app/case/CaseMapTab.tsx)), `CaseMapTrackFloatingOverlays` ([`CaseTrackingTab.tsx`](../src/app/case/CaseTrackingTab.tsx)), track import in [`useCaseTrackImport.ts`](../src/app/case/hooks/useCaseTrackImport.ts). [`CasePage.tsx`](../src/app/CasePage.tsx) has a file-top **section map** comment.
- **Unit visibility:** `AppData.myUnitIds` from `vc_user_unit_members`; [`hasCaseAccess`](../src/lib/casePermissions.ts) matches `vc_case_visible` for read; mutations still follow `vc_case_editor`. Team case list includes unit-assigned cases. See root [`HANDOFF.md`](../HANDOFF.md) for tables and gotchas.
- **Sync:** [`SYNC_CONTRACT.md`](SYNC_CONTRACT.md) expanded (full relational pull, `myUnitIds`, footprint writes); Realtime watches `vc_user_unit_members` in [`storeSupabaseSync.tsx`](../src/lib/storeSupabaseSync.tsx).

## What this app is

Client-only **Vite + React** case/canvass manager. Optional **Supabase** backend: **Postgres + RLS** (`vc_*` tables) and **Supabase Auth** (email/password). Without relational env, it falls back to a **local/mock POC** (demo user picker + legacy/local storage paths).

## Stack

- **Frontend:** Vite 7, React, TypeScript, MapLibre, localforage (IndexedDB).
- **Hosting:** Vercel (`vercel.json`: `npm run build`, `dist`).
- **Backend:** Supabase project (Auth + PostgREST + Realtime + Storage as configured in migrations).

## Build-time vs runtime (Vercel + Vite)

All **`VITE_*`** variables are **inlined at build time**. Changing them in Vercel without a **new deployment** does nothing for already-built assets.

**Production vs Preview** can behave differently if env scopes differ (e.g. relational flag set only on Preview).

### Required env (relational / production intent)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Publishable (`sb_publishable_...`) **or** legacy anon JWT — **never** `service_role` in the browser |
| `VITE_VC_RELATIONAL_BACKEND` | Must be truthy in the bundle: `true`, `1`, `yes`, or `on` (case-insensitive; optional quotes stripped). See `src/lib/backendMode.ts`. |

Optional: `VITE_VC_DEBUG=true` — footer strip + extra console diagnostics (`src/lib/buildDebug.ts`, `src/app/BuildDebugStrip.tsx`).

Full deploy checklist: [`docs/DEPLOY_SUPABASE_VERCEL.md`](DEPLOY_SUPABASE_VERCEL.md).

## How “relational vs mock” is decided

`relationalBackendEnabled()` in `src/lib/backendMode.ts` is true only when **both** Supabase URL + anon key are non-empty **and** the relational flag parses as truthy.

- **False →** `SessionGate` shows **mock** “Choose demo user” / POC layout (`src/App.tsx`). A **production** build shows a red **misconfiguration banner** on that screen when `import.meta.env.PROD` and relational mode is off.
- **True + no session →** email/password **`LoginPage`**.
- **True + session →** normal app shell + relational sync.

## Supabase database

### Migration order (fresh project)

If **Table Editor → `public`** has **no tables**, run SQL **in filename order** (or `supabase db push` from repo):

1. `supabase/migrations/20260401120000_vc_relational_core.sql` — creates `vc_*` schema, RLS, `vc_case_visible`, storage-related policies.
2. `20260402130000_vc_lifecycle_global_canvass.sql`
3. `20260407120000_vc_track_points_placement_source.sql`
4. `20260410120000_vc_rls_reset_grants.sql` — optional on brand-new DB; use when fixing **duplicate / dashboard policies** on `vc_cases` or tightening grants. **Requires `vc_cases` to exist** (prerequisite `DO` block explains if not).

`20260409000322_new-migration.sql` is a **placeholder** only; safe to replace with real DDL or leave as no-op.

### Policy verification

`supabase/queries/verify_vc_cases_policies.sql` — expect **four** permissive policies on `vc_cases` after a clean reset migration.

### Common errors

- **`relation "public.vc_cases" does not exist`** — migrations never applied on that Supabase project; run core migration first.
- **`new row violates row-level security`** — JWT missing/expired, wrong Supabase project vs sign-in, or bad/extra RLS policies; verify Network tab `Authorization: Bearer` on `/rest/v1/vc_cases` and run policy verification / reset migration.

## Auth and store bootstrap (recent hardening)

**Symptom:** `Store bootstrap timed out after 60000ms` in console.

**Cause:** `getRelationalAuthUserId()` called Supabase Auth (`getUser` / `refreshSession`) with **no timeout**, so slow or blocked networks could stall `loadData()` until the store’s 60s outer timeout.

**Mitigations in code:**

- `getRelationalAuthUserIdWithTimeout()` — default **14s** — `src/lib/supabaseAuthSession.ts`
- Relational `loadData()` always attempts DB load when a **usable session** exists, even if auth user-id resolution timed out (JWT still used for PostgREST).
- `loadAppDataFromRelational({ emptyCaseUserId })` — avoids a **second** hung `getUser` when the user has **zero cases** — `src/lib/relational/sync.ts`
- `localforage.setItem` after successful relational load is bounded (~12s) so IndexedDB stalls do not block forever — `src/lib/db.ts`

Constants: `RELATIONAL_AUTH_USER_ID_TIMEOUT_MS`, `RELATIONAL_BOOTSTRAP_REMOTE_MS`, `STORE_BOOTSTRAP_TIMEOUT_MS` in `db.ts` / `store.tsx`.

## Key source files

| Area | Files |
|------|--------|
| Backend gate | `src/lib/backendMode.ts`, `src/lib/supabase.ts` |
| Auth session | `src/lib/supabaseAuthSession.ts` |
| Load/save | `src/lib/db.ts` |
| Relational sync | `src/lib/relational/sync.ts` (pull/push, `vc_cases` upsert helpers) |
| Store / bootstrap | `src/lib/store.tsx`, `src/lib/storeSupabaseSync.tsx` |
| Routing / session UI | `src/App.tsx` (`SessionGate`, mock vs login) |
| Deploy / DB ops doc | `docs/DEPLOY_SUPABASE_VERCEL.md` |
| High-level sync rules | `docs/SYNC_CONTRACT.md` |
| Case list / map tab extractions | `src/app/case/CaseListTab.tsx`, `CaseMapTab.tsx`, `CaseTrackingTab.tsx` |
| Case access (incl. unit) | `src/lib/casePermissions.ts` |

## API routes (Vercel)

`api/geocode/*` — serverless/edge proxies for geocoding (CORS / provider limits). TypeScript imports use **`.js`** extensions where required for Vercel resolution.

## Suggested next steps for a new owner

1. Confirm **Vercel Production** has the three `VITE_*` variables and redeploy after any change.
2. Confirm **Supabase Auth** Site URL + redirect URLs cover production and any preview hostnames in use.
3. Confirm **migrations** applied on the **same** project as `VITE_SUPABASE_URL` (match host ref in dashboard).
4. Use **`VITE_VC_DEBUG=true`** on one preview build if diagnosing env or host mismatch.
5. Ignore browser-extension noise in Network/console (`chrome-extension://…`) when reproducing bugs; test in a clean profile if needed.

## Related doc

- [`DEPLOY_SUPABASE_VERCEL.md`](DEPLOY_SUPABASE_VERCEL.md) — step-by-step Supabase + Vercel parity and troubleshooting.
