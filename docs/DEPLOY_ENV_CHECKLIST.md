# Deploy environment checklist (web + Android)

Use this when aligning **hosted web**, **local dev**, and **Play Store** builds so data and auth match. Values are baked in at **`npm run build`** (see [`src/lib/supabase.ts`](../src/lib/supabase.ts)).

Step-by-step for Netlify/Vercel: [HOSTING_QUICKSTART.md](HOSTING_QUICKSTART.md).

## 1. Match hosting to your machine (verify-hosting-env)

- [ ] **Same Supabase project** for that environment: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` identical to what you use in `.env.local` (or your CI file) when you build for release.
- [ ] **`VITE_VC_RELATIONAL_BACKEND`**: same string on hosting, Android build, and local if you expect the same behavior (relational auth vs legacy `vc_app_state` blob).
- [ ] **Legacy POC blob only:** if relational is off, set **`VITE_SHARED_WORKSPACE_ID`** to the same value everywhere (e.g. `nypd-poc`). Different values = different rows in `vc_app_state`.
- [ ] After changing env on the host, **redeploy** the static site; changing only `.env.local` does not update production.

## 2. Android AAB (rebuild-aab-same-env)

- [ ] On the machine or CI that produces the AAB, run **`npm run build`** with the **same** `VITE_*` as production web.
- [ ] **`npm run cap:sync`** or `node scripts/cap-copy-web.cjs`, then bump **`versionCode`**, build signed AAB, upload. See [MOBILE_RELEASE.md section 10](MOBILE_RELEASE.md).

## 3. Confirm blob sync (verify-vc-app-state)

For **non-relational** setups using `vc_app_state`:

- [ ] In Supabase **Table Editor**, open **`vc_app_state`**, find the row where **`workspace_id`** equals your `VITE_SHARED_WORKSPACE_ID`.
- [ ] After saving data from Android, **`updated_at`** (or payload) should change; refresh the web app to pull merged state.

## 4. If the anon key was exposed (rotate-anon-if-exposed)

- [ ] In Supabase **Project Settings → API**, rotate or regenerate the **anon** key if it appeared in chat, tickets, or a public repo.
- [ ] Update **every** place that builds the app (hosting, CI, `.env.local`) and **rebuild** web + Android.

## 5. Production accounts (relational + email + MFA)

When you enable **`VITE_VC_RELATIONAL_BACKEND=true`**:

- [ ] Apply [supabase/migrations](../supabase/migrations/) per [SUPABASE_RELATIONAL.md](SUPABASE_RELATIONAL.md).
- [ ] In Supabase **Authentication**, configure **Email** (and optional **MFA**). The app supports **TOTP** enrollment under **Cases → Security / 2FA** and a TOTP challenge at sign-in when MFA is required.

There is **no automatic migration** from `vc_app_state` JSON to relational tables; plan a manual import or a fresh start for production users.
