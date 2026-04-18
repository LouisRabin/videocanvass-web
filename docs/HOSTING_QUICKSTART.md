# Hosting quickstart (web deploy + env to-do 1)

Vite embeds **`VITE_*`** at **`npm run build`**. Your host must supply the same values as [`.env.local`](../.env.local) (from [`.env.example`](../.env.example)) for production, then **redeploy**.

Full checklist: [DEPLOY_ENV_CHECKLIST.md](DEPLOY_ENV_CHECKLIST.md).

## Variables to copy into the host UI

| Name | Notes |
|------|--------|
| `VITE_SUPABASE_URL` | Same project as Android AAB builds |
| `VITE_SUPABASE_ANON_KEY` | Anon public key from Supabase → Project Settings → API |
| `VITE_SHARED_WORKSPACE_ID` | Same as local (e.g. `nypd-poc`) when **not** using relational mode |
| `VITE_VC_RELATIONAL_BACKEND` | `true` or `false` — **must match** Android and local |
| `VITE_VC_SITE_URL` | Optional; public `https` origin (e.g. `https://www.cameracanvass.com`) if password-reset `redirectTo` must not rely on `window.location` |
| `VITE_APP_SERVER_ORIGIN` | Same origin for **Capacitor** builds so `/api/geocode/*` hits your deployed web app |

## Netlify

Repo root includes [`netlify.toml`](../netlify.toml) (`npm run build`, publish `dist`).

1. **Add site** → import this repo.
2. **Site configuration → Environment variables** → add the table above for **Production** (and **Deploy previews** if you want previews to hit real Supabase).
3. Trigger **Deploys → Trigger deploy → Clear cache and deploy site** after changing variables.

## Vercel

Repo includes [`vercel.json`](../vercel.json) for Vite output `dist`.

1. **Add New Project** → import this repo.
2. **Settings → Environment Variables** → add the same names for **Production** / **Preview** as needed.
3. **Redeploy** the latest deployment after saving env.

## GitHub Actions (build only)

[`.github/workflows/ci-web-build.yml`](../.github/workflows/ci-web-build.yml) runs `npm run build` without secrets (offline/local-only config in the bundle). To **deploy** from Actions, add a separate workflow that passes `secrets.VITE_*` into the build step and uploads `dist/` to your host (not included by default).
