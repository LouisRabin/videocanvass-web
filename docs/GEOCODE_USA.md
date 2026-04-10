# USA-only forward address search (Photon)

## Baseline (before US restriction — for revert)

- **File:** `src/lib/geocode.ts` → `searchPlaces`
- **Network:** Single `GET` to `https://photon.komoot.io/api/` with query params: `q`, `limit` (caller default 6), `lang=en`, optional `lat` / `lon` (bias). **No** `location_bias_scale`.
- **No** `bbox`, **no** country post-filter.
- **Cache:** in-memory `Map`, key `` `${queryLower}|${limit}` ``, TTL 10 minutes; empty results were not cached.

## Current behavior (after US restriction)

- Same **single Photon request** (no Nominatim forward search — avoids prior slow/fragile patterns). In the **browser**, the client calls **`https://photon.komoot.io/api/`** directly when CORS succeeds (skips the app’s edge proxy hop); otherwise it falls back to **`/api/geocode/photon-api`**.
- **`countrycode`** (and optional **`country`**) on Photon features are parsed; results are **filtered** to the United States.
- **Internal fetch limit** is higher than the UI cap (about 10–24 rows, from `PHOTON_US_FETCH_MIN` / `PHOTON_US_FETCH_CAP`) so we still return up to 6 US rows after filtering.
- **In-memory cache** stores empty results too (same 10m TTL), so repeated identical queries do not re-hit the network.
- **`GEOCODE_SCOPE === 'us'`:** Photon also receives **`bbox`** = continental US (`US_PHOTON_BBOX`) to bias server-side candidates. Alaska/Hawaii still pass via `countrycode` / name / coordinate fallback.
- **`GEOCODE_SCOPE === 'ny'`:** US filter only; **no** `bbox` (NY-specific tightening can be added later).
- **Cache key** includes a `us` segment and a **2-decimal** quantized `lat,lon` suffix when bias is set; the same quantization is sent to Photon so small map drift does not bust the client cache or duplicate requests.
- **Map center bias:** [`useCaseGeocodeSearch`](src/app/case/hooks/useCaseGeocodeSearch.ts) passes Photon `lat`/`lon` from **Locate me** when set, otherwise reads **`mapRef.getCenter()`** when each debounced search runs. Photon also gets **`location_bias_scale=0.32`** whenever bias coordinates are sent.
- **Coordinate fallback:** If Photon omits country fields, a hit is kept only when **lat/lon** falls in rough US boxes (continental + Alaska + Hawaii).

## Revert checklist

1. In `src/lib/geocode.ts`, remove: `US_PHOTON_BBOX`, `PHOTON_FETCH_LIMIT_CAP`, `isUnitedStatesPhotonProperties`, `latLonLikelyUs`, bbox branch, and the `.filter(isUnitedStates...)` step; set Photon `limit` back to the caller’s `limit` only.
2. Restore cache key to `` `${q.toLowerCase()}|${limit}` ``.
3. Remove `countrycode` from the Photon zod schema **only if** you revert all filtering (optional to keep for future).
4. Delete or archive this doc if the feature is fully removed.

## Related (unchanged here)

- **Reverse geocode** (map tap): `src/lib/reverseGeocodeAddressTextStable.ts` — Photon reverse + Nominatim fallback; not used for autocomplete.
- **Footprint / structured Nominatim:** `src/lib/building.ts` — separate `country=us` usage.
