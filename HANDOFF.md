# Handoff — videocanvass-web

Consolidated notes for whoever picks up **Case page**, **geocoding**, **sync**, and related **web toolbar** work. Update this file when behavior changes materially.

---

## Case page — web toolbar (wide) and list

### Accordion sections
- **Views, Filters, Tracks, Photos, DVR calculator** share one active section: `mapLeftToolSection` in [`src/app/CasePage.tsx`](src/app/CasePage.tsx). Tapping the same label again collapses to **only** the five buttons.
- **DVR calculator** is a section like the others (not a modal for the standalone `dvr_only` toolbar path). Uses [`DvrCalculatorStep`](src/app/ProbativeDvrFlow.tsx) with `toolbarEmbed` (no **Back** wizard step). Probative flows from a pin can still use [`ProbativeDvrFlowModals`](src/app/ProbativeDvrFlow.tsx).
- Opening **DVR** clears `probativeFlow` if set; starting a probative modal clears the DVR section.

### Views panel + List view
- **Map / List / Fit / Locate** in the Views panel: on **wide** web, each action calls `setMapLeftToolSection(null)` so the panel collapses after use (narrow still uses `closeMapToolsDock()` where applicable).
- **`wideSidebarListReveal`:** the **Locations** strip in the left column appears only after an explicit **List view** click (`setWideSidebarListReveal(true)`). Any other toolbar action (including opening **Views**, **Filters**, etc.) sets it **false**. Closing Filters alone does **not** bring the list back until **List view** is pressed again.
- **`wideWebListInToolbar`:** requires `viewMode === 'list'`, `mapLeftToolSection === null`, and `wideSidebarListReveal`.

### Map + list (Video canvassing)
- **Addresses tab:** map stays visible for both map and list mode (`showMapInMapColumn`).
- **Narrow + list:** address list is a **bottom sheet** over the map (not a full replacement). Top floating strip (mode toggles, search, tracks, ☰) stays visible (`zIndex` 45 vs list 35).
- **Wide:** drawer seam / full-bleed map / address detail overlay for addresses no longer depend on “list vs map” for hiding chrome.

### Floating address search (layout)
- **Wide:** wrapper `flex: 0 1 auto`, `width: min(400px, 100%)` (does not eat the whole map row).
- **Narrow:** `flex: 1` unchanged.

### Notes / drawers (wide)
- **`LocationDrawer` / `TrackPointDrawer`:** Remove in header; compact camera pills; notes row / short textarea — see [`src/app/case/CasePageChrome.tsx`](src/app/case/CasePageChrome.tsx).

### Subject tracking — map seam (wide)
- Bottom seam expand is available on tracking even with **no step** selected; empty state uses **`WideMapTrackStepPlaceholder`**. **`trackDrawerDetailsOpen`** only resets when selection clears, not on every step change.

---

## Forward geocoding (Photon)

| Topic | Where |
|--------|--------|
| USA filter, `bbox`, cache keys, revert | [docs/GEOCODE_USA.md](docs/GEOCODE_USA.md) |
| `searchPlaces`, `US_PHOTON_BBOX`, `appDataSyncFingerprint` not here | [`src/lib/geocode.ts`](src/lib/geocode.ts) |
| Debounced search, **Locate me** bias vs **map center** fallback | [`src/app/case/hooks/useCaseGeocodeSearch.ts`](src/app/case/hooks/useCaseGeocodeSearch.ts) |
| `getCenter()` on map ref | [`src/app/AddressesMapLibre.tsx`](src/app/AddressesMapLibre.tsx) (`UnifiedCaseMapHandle`) |
| Wiring `mapRef` + `mapSearchCenterFallback` | [`src/app/CasePage.tsx`](src/app/CasePage.tsx) (early `mapRef` so hooks can use it) |

**Behavior summary:** Single Photon `GET` per search. US-only via post-filter + continental `bbox` when `GEOCODE_SCOPE === 'us'`. When **Locate me** has not set `geoBias`, each search uses **current map center** as Photon `lat`/`lon` with `location_bias_scale=0.32`. Cache keys include rounded bias so panning does not reuse wrong suggestions.

**Reverse geocode** (map tap, pending-add modal, saved-pin backfill): [`src/lib/reverseGeocodeAddressTextStable.ts`](src/lib/reverseGeocodeAddressTextStable.ts) — separate from autocomplete; do not casually duplicate logic. **Photon** (`photon.komoot.io/reverse`) and **Nominatim** (`/api/geocode/nominatim-reverse`) run **in parallel** with per-provider timeouts; the **first non-null** label wins and the other request is aborted to limit load. Cached and deduped per rounded lat/lon (5 decimals). Callers may pass `AbortSignal` (combined with an internal coordinator so both sub-requests cancel together).

**DVR toolbar (web):** `hideManualOffset` on wide; panel max-height + inner scroll in `CasePage.tsx` (`mapToolsDockDvrPanel`).

---

## Sync / store (Supabase)

| Change | File |
|--------|------|
| Avoid `JSON.stringify` of full `AppData` after pulls | [`src/lib/db.ts`](src/lib/db.ts) — `appDataSyncFingerprint()` |
| Serialize concurrent pull/merge | [`src/lib/store.tsx`](src/lib/store.tsx) — `syncPullInFlightRef` |
| Poll interval | [`src/lib/db.ts`](src/lib/db.ts) — `REMOTE_SYNC_POLL_MS` (8s) |

Relational and JSON-blob merge paths both use the fingerprint for “no change → skip `setState` / IndexedDB”.

---

## Key files (quick index)

| Area | File |
|------|------|
| Case shell, toolbar, list reveal, map column, DVR panel, seam flags | [`src/app/CasePage.tsx`](src/app/CasePage.tsx) |
| Drawers, pills, map chrome | [`src/app/case/CasePageChrome.tsx`](src/app/case/CasePageChrome.tsx) |
| Geocode hook | [`src/app/case/hooks/useCaseGeocodeSearch.ts`](src/app/case/hooks/useCaseGeocodeSearch.ts) |
| Map ref / `getCenter` | [`src/app/AddressesMapLibre.tsx`](src/app/AddressesMapLibre.tsx) |
| DVR calculator step + modals | [`src/app/ProbativeDvrFlow.tsx`](src/app/ProbativeDvrFlow.tsx) |
| Store + sync effects | [`src/lib/store.tsx`](src/lib/store.tsx) |
| Persist / fingerprint | [`src/lib/db.ts`](src/lib/db.ts) |
| Outside-dismiss | [`src/app/case/hooks/useMapPaneOutsideDismiss.ts`](src/app/case/hooks/useMapPaneOutsideDismiss.ts) |

---

## Invariants / gotchas

- **`mapPaneDetailOverlayStyle`** / **`showWideMapDrawerSeam`:** comments in `CasePage.tsx` describe z-order and `display: none` vs collapsed; re-check seam vs markers (~5000) if you change overlays.
- **Narrow vs wide:** many branches use `!isNarrow` explicitly; do not assume one layout.
- **Hooks order in `CasePage`:** `mapRef` and `mapSearchCenterFallback` must be declared **before** `useCaseGeocodeSearch` calls that need `mapCenterFallback`.
- **Geocode “stable” module:** `reverseGeocodeAddressTextStable.ts` is marked stable — coordinate with `HANDOFF.md` / `GEOCODE_USA.md` if you change provider behavior.

---

## Verification

- `npm run build` (or `npx tsc -b`) after touching Case page / geocode / store.
- E2E: `npm run test:e2e` if you change dismiss, seam, or list stability — [`tests/e2e/casepage-stability.spec.ts`](tests/e2e/casepage-stability.spec.ts).

---

## Possible follow-ups

- **Autocomplete:** client-side re-ranking (e.g. boost labels matching typed letters after hyphenated house numbers) if Photon + map bias is still weak for NYC-style addresses.
- **400px** search cap or notes `maxHeight` on very short viewports.
- **Tracking narrow:** seam with no selection (currently wide-focused parity).

---

*Last updated: handoff pass (Case toolbar, list reveal, geocode US + map bias, sync fingerprint, DVR toolbar). Adjust from git history as needed.*
