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

- **UI**: Case page layout, map, **unified left toolbar** (canvass filters, map/list, fit/locate, tracks — mode toggle only changes **map tap behavior** between canvass vs subject tracking), add-address flow (suggestion → modal → status), tracking, Git scripts (`StartGit.bat`, `EndGit.bat`), repo on GitHub `LouisRabin/videocanvass-web`. Outline debug panel removed from the case UI.
- **Footprint coloring** (Mar 2026): Building outline fill **appears very quickly** after saving a canvass pin—outline pipeline is tuned (concurrency, sources, vector-building hints, non-blocking save vs geocode). Users can **queue several new locations** while earlier footprints still load (pending-add queue + spinner per pin).
- **Persistence**:
  - If `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set: loads/saves **`vc_app_state`** row keyed by `VITE_SHARED_WORKSPACE_ID` (whole app payload as JSON).
  - If not: falls back to **IndexedDB** (local only).
- **Mock login**: `src/App.tsx` — choose demo user before cases list; **Sign out** on cases page.
- **Dummy users**: seeded in `src/lib/store.tsx` (`ensurePocUsers`) — name, email, tax-style id; schema extended in `src/lib/types.ts` (`users`, `caseCollaborators` placeholders for next step).

## Address & footprint retrieval — preserve unless deliberately retuning

This is the **working configuration** (Mar 2026). Change only with intention; update this table when you do.

### Address (labels & search)

| What | Setting | Where |
|------|---------|--------|
| Autocomplete API | Photon `photon.komoot.io/api/` | `src/lib/geocode.ts` (`searchPlaces`) |
| Forward parse | Zod-validated Photon `Feature` list (same as when “working amazing” UX) | `geocode.ts` `PhotonResponseSchema` |
| Search debounce | **280 ms** before request | `src/app/CasePage.tsx` (address `useEffect`) |
| Forward search cache | **10 min** TTL, key = **query + limit** (bias still sent to Photon, not part of cache key) | `geocode.ts` `TTL_MS` |
| Reverse label order | **Photon reverse** (browser → `photon.komoot.io/reverse`) **only then**, if that returns nothing useful, **Nominatim reverse** via `GET /api/geocode/nominatim-reverse` | `reverseGeocodeAddressTextStable.ts` (`reverseGeocodeAddressText`, re-exported from `geocode.ts`) |
| Reverse cache | **15 min** TTL, key = lat/lon rounded to **5** decimals | `geocode.ts` `REVERSE_TTL_MS` |
| Reverse in-flight | One pending fetch per rounded coordinate (map + queue + save paths share it) | `geocode.ts` `reverseInflight` |
| Scope flag | `GEOCODE_SCOPE` (`us` today — drives copy/behavior in geocode module) | `geocode.ts` |
| Proxied APIs (dev) | Overpass + Nominatim under `/api/geocode/*` | Vite dev server |
| Map-tap add UX | Modal opens immediately with provisional `Lat …, Lon …`; reverse runs in the background and replaces text when done | `AddressesMapLibre.tsx` (`onClick` + `reverseGeocodeAddressText`), `CasePage.tsx` (pending-add queue + `isProvisionalCanvassLabel`) |

#### Why this address stack works (and what *not* to change casually)

**Single “family” for search and reverse.** Forward autocomplete and reverse-from-coordinates both use **Photon** when possible. Users get labels that feel like the same geography product whether they type an address or tap the map, and you avoid stitching mismatched provider styles in the common case.

**Sequential reverse: Photon first, Nominatim only as fallback.**

- The browser talks **directly** to Photon for reverse. That keeps the hot path simple: one client → Komoot CDN, no app server in the middle for the usual hit.
- **Nominatim runs only when Photon fails or returns nothing usable.** That avoids (1) doubling traffic and rate-limit risk on the proxied Nominatim endpoint, and (2) picking between two different address phrasings on every tap when both would succeed—which had produced worse UX in experiments (parallel Photon + Nominatim was tried and **reverted**).
- So: **do not** “optimize” by firing Nominatim in parallel with Photon for every reverse unless you are deliberately redoing provider policy and copy.

**Reverse quality details in code.**

- Photon returns multiple features; we **score** candidates (`photonReverseAddressScore` in `geocode.ts`) to prefer real street lines (housenumber + street) over vague POI-only hits.
- Nominatim uses **`addressdetails`**; we prefer a **structured** line built from `address.*` fields, then fall back to `display_name`.

**Caching.** Reverse uses a **5-decimal / 15-minute** cache plus **in-flight deduplication** so the map tap, pending-add `useEffect`, and post-save hooks do not each open a separate Photon/Nominatim sequence for the same pin. Forward uses **query + limit**; `geoBias` can change Photon ordering for the same typed string without busting the cache (tradeoff from the stable “fast” stack).

#### CasePage — provisional labels must resolve to street text (do not regress)

Street lines are supposed to arrive from the map’s async geocode **and** from `CasePage` backfill. A past bug: the placeholder from the map is a full line like **`Lat 40.71280, Lon -74.00600`**, but detection only used a pattern such as `/^lat\s*-?\d+/i`, which **does not** match that string (there is a **`Lon …`** segment). Nothing triggered background resolution, so many saves kept lat/lon forever.

**`isProvisionalCanvassLabel()`** (`src/app/CasePage.tsx`) must recognize:

- The real map-tap placeholder: `Lat …, Lon …` (comma between segments).
- Older / partial patterns (e.g. leading `lat` + digits) for compatibility.

**Three intentional backfill paths** (footprint / outline / `enqueueOutlineForLocation` / concurrency are **not** changed by this — speed stays separate):

1. **Pending-add queue `useEffect`** — For every queued modal row that still has a provisional label, start **one** reverse geocode per coordinate, **deduped** with `pendingQueueGeoKeysRef`. When `reverseGeocodeAddressText` returns, update that queue row’s `addressText` so the modal shows a street line while you queue more taps or pick categories.
2. **Category save** — After `createLocation`, if the saved `addressText` is still provisional (`isProvisionalCanvassLabel`), run reverse + `updateLocation` so quick-save rows upgrade the same way.
3. **Safety net `useEffect` on `locations`** — Any saved pin in this case that still looks provisional gets a background resolve + `updateLocation`, with **`savedProvisionalGeoIdsRef`** (per-id in-flight) and a fresh read from **`locationsRef`** so we never overwrite an address that was fixed elsewhere.

Map / modal handlers still resolve addresses as before; these hooks are the **reliable second path** when timing or detection would otherwise skip an update.

**Footprint hint refinement** uses a separate **`isLatLonOnlyLabel()`** in `src/lib/building.ts` (regex on `Lat …, Lon …`) when resolving coordinate-only `addressText` before Nominatim search — not the same helper as the CasePage modal, but the line shape matches the map placeholder.

### Footprint (building outline)

| What | Setting | Where |
|------|---------|--------|
| Vector hint | Carto **building** ring from map query; validated in `fetchBuildingFootprint` | `AddressesMapLibre.tsx`, `src/lib/building.ts` |
| NYC | **NYC Open Data** building layer when coordinates are in the five boroughs | `building.ts` |
| Overpass | **Sequential** queries radii **120 → 240 → 400 → 560 → 760** m (avoids public rate limits); QL `[timeout:14]` | `building.ts` `fetchFromOverpass` |
| OSM merge | Overpass + Nominatim footprint fetches in parallel with **race abort** when a good polygon appears | `building.ts` `fetchBuildingFootprint` |
| Address refinement | Lat/lon-only hints resolved via **`reverseGeocodeAddressText`** before Nominatim **search** fallback | `building.ts` |
| Outline workers | **3** concurrent outline fetches | `CasePage.tsx` `OUTLINE_CONCURRENCY` |
| Viewport preload | Debounce **480 ms**, bounds pad **0.14**, max **24** pins — **keep in sync** in `CasePage.tsx` and `AddressesMapLibre.tsx` | both files |
| Tight loading hit target | `OUTLINE_LOADING_PIN_HALF_DEG` | `CasePage.tsx` |

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
| Photon forward search (autocomplete) | `src/lib/geocode.ts` |
| **Stable** coordinate → address label (reverse only) | `src/lib/reverseGeocodeAddressTextStable.ts` — re-exported from `geocode.ts`; do not edit casually |
| Cases list | `src/app/CasesPage.tsx` |
| Supabase setup steps | `SUPABASE_POC_SETUP.md` |
| Broader project notes | `PROJECT.md` |

## User preference

- Uses **Windows**, **PowerShell**, **OneDrive** copy of repo; **start/end** Git batch files for daily sync.
