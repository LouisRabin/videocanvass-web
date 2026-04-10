# Data sync contract (local ↔ Supabase)

This document summarizes how the web client merges **local IndexedDB / localforage** state with **remote** data. Use it when extending the backend or adding APIs.

## Layers

| Layer | Role |
|--------|------|
| [`src/lib/db.ts`](../src/lib/db.ts) | Local persistence (`loadData`, `saveData`), normalization, legacy `vc_app_state` blob pull/merge helpers. |
| [`src/lib/relational/sync.ts`](../src/lib/relational/sync.ts) | Maps relational Postgres rows ↔ `AppData`; used when `relationalBackendEnabled()` is true. |
| [`src/lib/store.tsx`](../src/lib/store.tsx) | Optimistic UI updates, `persist()` chain, permission checks. |
| [`src/lib/storeSupabaseSync.tsx`](../src/lib/storeSupabaseSync.tsx) | Realtime subscriptions + **polling** (`REMOTE_SYNC_POLL_MS` in `db.ts`) so throttled WebViews still converge. |

## Authority and merge

- **Writes:** The UI applies changes optimistically to `dataRef` / React state, then `saveData` pushes to Supabase. Failed remote commits keep local state; the next successful pull reconciles.
- **Reads / pull:** `pullAndMergeWithLocal` (from `db.ts`) loads remote payload and merges with the current in-memory snapshot. Identical fingerprints skip a re-render (`appDataSyncFingerprint`).
- **Relational mode:** Postgres changes on watched tables schedule a debounced merge (~120 ms). **Polling** every 8 s backs up Realtime when connections are flaky.
- **Legacy blob mode:** Subscribes to `vc_app_state` for the shared workspace id; same debounce + poll pattern.

## Idempotency expectations

- Entity ids are client-generated (`newId`) where applicable; repeats should upsert or no-op server-side.
- Tombstone / deleted-id lists in `AppData` must stay consistent with relational deletes so merges do not resurrect rows.

## Relational pull scope (known behavior)

- `loadAppDataFromRelational` loads **all** cases (and children) visible under RLS for the signed-in user, not a single case id. That matches Postgres visibility in one round trip; narrowing by case would require new RPCs or filtered queries.
- `myUnitIds` is filled from `vc_user_unit_members` for the session user so the SPA can mirror `vc_case_visible` (unit-assigned cases) in routing and lists.
- Background **footprint / bounds** updates use normal `updateLocation` after a location already exists; they are intentional persistence of geometry, not a second “save” button.

## Adding backend features

1. Prefer extending `relational/sync.ts` row mappers and RLS-aligned queries rather than scattering fetch logic in components.
2. If you add tables, subscribe in `storeSupabaseSync.tsx` (relational channel) and map them in `pullAndMergeWithLocal` / sync pull path.
3. Keep **one** merge entry point so mobile poll + desktop Realtime do not double-apply incompatible rules.
