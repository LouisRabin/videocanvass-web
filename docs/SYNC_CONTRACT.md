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
- **`vc_profiles`:** The client loads profiles only for **user ids referenced** by the pulled graph (case owners, collaborators, and `created_by_user_id` on locations, tracks, track points, attachments) plus the session user. It does **not** download the entire `vc_profiles` table. Collaborator **search** still uses `vc_search_profiles_for_case_team` (RPC) when adding people by email.
- `myUnitIds` is filled from `vc_user_unit_members` for the session user so the SPA can mirror `vc_case_visible` (unit-assigned cases) in routing and lists.
- Background **footprint / bounds** updates use normal `updateLocation` after a location already exists; they are intentional persistence of geometry, not a second “save” button.

## Observability (relational pull)

With **`VITE_VC_DEBUG=true`** or in **Vite dev** (`import.meta.env.DEV`), the client logs `[vc_sync_pull]` lines for `vc_cases`, the parallel child-table fetch, each `vc_profiles` batch, and the total `loadAppDataFromRelational` duration inside `pullAndMergeWithLocal`. Use this to compare latency and row counts before/after backend or query changes.

## Future: incremental relational pull (not implemented)

To move from **O(all visible rows)** to **O(changes)** on each poll/realtime tick:

1. **Watermarks** — Persist per-table `max(updated_at_ms)` (or server clock) the client has merged; store in memory + optional IndexedDB.
2. **Delta queries or RPC** — `WHERE case_id = ANY($1) AND updated_at_ms > $cursor` (plus tombstone/deletes via `deleted_*` ids or a changes feed).
3. **Merge** — Apply deltas through the same `mergeAppData` / tombstone rules so behavior stays consistent with full pulls.
4. **Contract** — Extend this doc and RLS tests whenever new tables join the relational channel in [`storeSupabaseSync.tsx`](../src/lib/storeSupabaseSync.tsx).

Until then, the app relies on **Realtime + 8s poll** full pulls, **narrow `select()` column lists**, **scoped profiles**, **debounced relational saves** (see [`store.tsx`](../src/lib/store.tsx)), and a short **auth-id cache** in [`db.ts`](../src/lib/db.ts) to limit redundant work.

## Adding backend features

1. Prefer extending `relational/sync.ts` row mappers and RLS-aligned queries rather than scattering fetch logic in components.
2. If you add tables, subscribe in `storeSupabaseSync.tsx` (relational channel) and map them in `pullAndMergeWithLocal` / sync pull path.
3. Keep **one** merge entry point so mobile poll + desktop Realtime do not double-apply incompatible rules.
