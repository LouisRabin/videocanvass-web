# Handoff — pick up here next session

Short context for Cursor / future chats so work can resume quickly.

## Product goals (updated)

1. **Video canvassing + subject tracking** — map-first case workflow (already in app).
2. **Collaboration (eventually)** — multiple detectives on a case; add people by **email** or **department “tax number”** once IT provides Microsoft Entra / directory access.
3. **Proof of concept now** — **no real auth**, **no real NYPD data**:
   - Mock sign-in (pick a dummy user).
   - Shared cloud state via **Supabase** so different machines can see the same demo data.
   - Later: replace mock login with **Entra ID** and real directory lookup.

## What’s implemented already

- **UI**: Case page layout, map, toolbar, add-address flow (suggestion → modal → status), tracking, Git scripts (`StartGit.bat`, `EndGit.bat`), repo on GitHub `LouisRabin/videocanvass-web`.
- **Persistence**:
  - If `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set: loads/saves **`vc_app_state`** row keyed by `VITE_SHARED_WORKSPACE_ID` (whole app payload as JSON).
  - If not: falls back to **IndexedDB** (local only).
- **Mock login**: `src/App.tsx` — choose demo user before cases list; **Sign out** on cases page.
- **Dummy users**: seeded in `src/lib/store.tsx` (`ensurePocUsers`) — name, email, tax-style id; schema extended in `src/lib/types.ts` (`users`, `caseCollaborators` placeholders for next step).

## Local setup reminders

- **Env**: `.env.local` (gitignored via `*.local`) — see `SUPABASE_POC_SETUP.md`.
- **Supabase SQL**: create `vc_app_state`; POC used `disable row level security` — **demo only**.
- **Dev**: `npm install` then `npm run dev`.

## Security note

- An **anon** key was shared in chat once; for anything beyond toy data, **rotate** the anon key in Supabase and keep keys only in `.env.local`.

## Errors / troubleshooting to continue if needed

- `{"error":"requested path is invalid"}` — usually wrong browser URL (don’t open bare `*.supabase.co` as a website) or env not loaded — restart `npm run dev` after `.env` changes.
- If table missing / empty: run SQL in `SUPABASE_POC_SETUP.md` again; confirm row appears after editing a case.

## Recommended next steps (tomorrow)

1. Confirm **Table Editor → `vc_app_state`** updates when using the app (shared sync).
2. **Collaborators UI** (not built yet):
   - On case: search dummy `users` by **email** or **taxNumber**.
   - Add/remove **case collaborators** (`caseCollaborators`) with role `viewer` | `editor`.
   - Optional: hide edit actions for `viewer` in POC.
3. Tighten Supabase when moving past POC: **RLS + auth** instead of wide open table.

## Key files

| Area | Path |
|------|------|
| Mock login / router | `src/App.tsx` |
| Store + dummy users | `src/lib/store.tsx` |
| Load/save Supabase + local | `src/lib/db.ts` |
| Supabase client + workspace id | `src/lib/supabase.ts` |
| Types + collaborators schema | `src/lib/types.ts` |
| Case / map UI | `src/app/CasePage.tsx` |
| Cases list | `src/app/CasesPage.tsx` |
| Supabase setup steps | `SUPABASE_POC_SETUP.md` |
| Broader project notes | `PROJECT.md` |

## User preference

- Uses **Windows**, **PowerShell**, **OneDrive** copy of repo; **start/end** Git batch files for daily sync.
