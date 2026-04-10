# Code map

Short orientation for humans and tooling. **Policy and tuning** for geocoding, footprints, and retrieval live in [HANDOFF.md](../HANDOFF.md); this file only points to code locations.

## Entry points

- [`src/main.tsx`](../src/main.tsx) — React root, global styles.
- [`src/App.tsx`](../src/App.tsx) — Session gate (mock vs Supabase auth), MFA step, routing, `hasCaseAccess`.

## Screens and layout

- [`src/app/tour/`](../src/app/tour/) — Product tour (`TourProvider`, `ProductTour`, `tourSteps`); UI anchors use `data-vc-tour`.
- [`src/app/CasesPage.tsx`](../src/app/CasesPage.tsx) — Case list.
- [`src/app/CasePage.tsx`](../src/app/CasePage.tsx) — Single case: map, list, tracking, modals, attachments.
- [`src/app/Layout.tsx`](../src/app/Layout.tsx) — App chrome / shell.

## Map

- [`src/app/AddressesMapLibre.tsx`](../src/app/AddressesMapLibre.tsx) — Case map: MapLibre via `react-map-gl`, layers, markers, interactions.
- [`TrackWaypointMarkers`](../src/app/addressesMapLibre/TrackWaypointMarkers.tsx) — One numbered pin per visible `TrackPoint` on the subject map. **Video canvassing** taps and address search use [`casePageHelpers.ts`](../src/app/casePageHelpers.ts) and `resolveCanvassTapLocation` in `AddressesMapLibre`.
- **Leaflet `L`** is used for **bounds/helpers** in [`CasePage.tsx`](../src/app/CasePage.tsx) (via [`casePageHelpers.ts`](../src/app/casePageHelpers.ts)) and related map code, not as the primary map renderer.

## Data and types

- [`src/lib/store.tsx`](../src/lib/store.tsx) — React context: loads and mutates persisted case data.
- [`src/lib/db.ts`](../src/lib/db.ts) — Local persistence layer.
- [`src/lib/types.ts`](../src/lib/types.ts) — Shared domain types and small UI helpers (e.g. status labels/colors).
- [`src/lib/supabase.ts`](../src/lib/supabase.ts) — Supabase client and remote sync.
- [`supabase/templates/recovery.html`](../supabase/templates/recovery.html) — Branded password-reset email for Supabase Auth (`recovery` template).
- [`docs/RESEND_CAMERACANVASS.md`](../docs/RESEND_CAMERACANVASS.md) — Resend SMTP + `cameracanvass.com` for Supabase Auth email.
- [`src/lib/mfaAuth.ts`](../src/lib/mfaAuth.ts) — TOTP MFA helpers (`sessionNeedsTotpStep`, `verifyTotpChallenge`).
- [`src/app/LoginPage.tsx`](../src/app/LoginPage.tsx) — Email/password sign-up, sign-in, and forgot-password (relational mode).
- [`src/app/PasswordRecoveryPage.tsx`](../src/app/PasswordRecoveryPage.tsx) — New password after opening the reset link (`PASSWORD_RECOVERY`).
- [`src/lib/authPasswordReset.ts`](../src/lib/authPasswordReset.ts) — `redirectTo` URL and hash detection for Supabase reset flow.
- [`src/app/MfaTotpChallengePanel.tsx`](../src/app/MfaTotpChallengePanel.tsx) / [`MfaEnrollmentModal.tsx`](../src/app/MfaEnrollmentModal.tsx) — TOTP challenge at sign-in; optional enrollment from Cases.

## Permissions

- [`src/lib/casePermissions.ts`](../src/lib/casePermissions.ts) — Who can edit/delete locations, tracks, attachments, etc.

## Geocode and building outlines

- [`src/lib/geocode.ts`](../src/lib/geocode.ts) — Forward/reverse geocode and place search.
- [`src/lib/reverseGeocodeAddressTextStable.ts`](../src/lib/reverseGeocodeAddressTextStable.ts) — Stable address text from coordinates where relevant.
- [`src/lib/building.ts`](../src/lib/building.ts) — Building footprint fetch.
- Tune endpoints, debounces, and concurrency in **HANDOFF.md** tables — do not duplicate long policy here.

## Native (Capacitor)

- [`capacitor.config.ts`](../capacitor.config.ts) — App id, web dir, plugins.
- **`npm run cap:sync`** — Builds the web app and copies `dist/` into `android/` and `ios/` (uses [`scripts/cap-copy-web.cjs`](../scripts/cap-copy-web.cjs) when the Capacitor CLI is awkward).

## Case screen splits (readability)

- [`src/app/casePageHelpers.ts`](../src/app/casePageHelpers.ts) — Pure helpers used by `CasePage` (bounds, map focus storage, hit testing, etc.).
- [`src/app/case/CasePageChrome.tsx`](../src/app/case/CasePageChrome.tsx) — Presentational widgets and shared style objects for the case UI.
