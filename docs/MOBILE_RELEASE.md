# Mobile native release (Capacitor)

VideoCanvass ships one **Vite/React** bundle for **mobile web** and for **Android/iOS** via [Capacitor](https://capacitorjs.com/). Native projects live under `android/` and `ios/`. Keep **narrow mobile web** as the UX reference; native apps load the same `dist/` assets.

## 1. Build web assets

```bash
npm run build
```

Produces `dist/` (see [capacitor.config.ts](../capacitor.config.ts): `webDir: 'dist'`).

### 1.1 `VITE_APP_SERVER_ORIGIN` (native `/api` geocode proxies)

The app calls **`/api/geocode/*`** and **`/api/nyc-open-data`** through your **deployed** site (e.g. Vercel serverless), same as production web. In a **Capacitor** WebView, `window.location.origin` is the app shell (e.g. `capacitor://localhost`), **not** that host — so geocode, reverse geocode, Overpass, and NYC proxy calls will fail unless you bake in your public web origin.

Set at **build time** (same machine/CI as `npm run build` → `cap:sync`):

- **`VITE_APP_SERVER_ORIGIN`** — HTTPS origin only, no path or trailing slash, e.g. `https://your-app.vercel.app`

Implementation: [`src/lib/appServerOrigin.ts`](../src/lib/appServerOrigin.ts). **Hosted web** builds can omit this variable; the client keeps using `window.location.origin`.

To confirm your **deployed** site exposes the geocode proxies (Photon + Nominatim reverse), run from the repo root: **`npm run verify:geocode-proxies -- https://your-public-site.com`** (see [`package.json`](../package.json) script `verify:geocode-proxies`).

If you add strict **CORS** on `/api/*` later, allow the Capacitor WebView origin pattern as needed.

### 1.1b `VITE_VC_SITE_URL` (native password reset `redirectTo`)

[`passwordRecoveryRedirectTo()`](../src/lib/authPasswordReset.ts) must produce an **absolute `https://…` URL** for `resetPasswordForEmail`. In Capacitor, `window.location` is often **not** a normal https origin, so set:

- **`VITE_VC_SITE_URL`** — same value you use for public web, e.g. `https://www.cameracanvass.com` (no trailing slash).

For **store / device** native builds, set **`VITE_APP_SERVER_ORIGIN`** and **`VITE_VC_SITE_URL`** to the **same** production origin whenever both apply.

### 1.2 JS baseline (web + Capacitor)

[`vite.config.ts`](../vite.config.ts) sets **`build.target: 'safari15'`** (Safari / WKWebView on **iOS 15+**) and disables production **sourcemaps** to keep `dist/` smaller for Xcode/Android asset copies. Raise the target only if you intentionally drop older devices.

### 1.3 iOS project: privacy manifest and usage strings

- **[`ios/App/App/PrivacyInfo.xcprivacy`](../ios/App/App/PrivacyInfo.xcprivacy)** — bundled with the app target; declares no tracking. After **Archive**, if App Store Connect or Xcode flags **required-reason APIs** from a dependency, extend this file or follow the SDK vendor’s manifest guidance.
- **`Info.plist`** — `NSPhotoLibraryUsageDescription` and `NSCameraUsageDescription` for case **image** attachments (`<input type="file" accept="image/*">`). **`UIRequiredDeviceCapabilities`** uses **`arm64`** (64-bit only).

## 2. Copy/sync into native projects

**Preferred (runs Capacitor CLI):**

```bash
npm run cap:sync
```

**Fallback (OneDrive / CLI issues):** copies `dist/` into Android and iOS asset folders without `npx cap`:

```bash
node scripts/cap-copy-web.cjs
```

This mirrors config in [scripts/cap-copy-web.cjs](../scripts/cap-copy-web.cjs) (`appId`, `webDir`). After changing [capacitor.config.ts](../capacitor.config.ts), keep that script’s `config` object aligned or prefer `cap sync` when it works.

**Before the first Xcode build** on a fresh clone (or any machine where `ios/App/App/public` is missing), run **`npm run cap:sync`** so **`public`** (web bundle) and **`config.xml`** are generated under `ios/App/App/` — both are gitignored and are required by the Xcode project’s resource list. If the Capacitor CLI works on that machine, **`npm run cap:sync:cli`** is an alternative.

### 2.1 Git / GitHub: what is (and is not) in the repo

- **Ignored under `ios/`** (see [`ios/.gitignore`](../ios/.gitignore)): synced web assets (`App/App/public`), generated `capacitor.config.json` / `config.xml`, build products, `Pods`, `xcuserdata`, and **`capacitor-cordova-ios-plugins`**. Those folders change often; they are meant to be **recreated locally** with `npm run cap:sync` or `npm run cap:sync:cli`, not committed.
- **Tracked under `ios/`**: Xcode project, Swift sources, assets, plist / privacy manifest, SPM package files, etc. Anything **new** here (files Xcode or you add) must be **`git add` + commit** or collaborators and CI will never see it.

**Before you push** (especially after adding plugins, SPM packages, or new native files):

1. Run your usual sync (`npm run cap:sync` or `npm run cap:sync:cli` / `cap:sync:ios` on a Mac when the CLI works).
2. From the repo root: **`npm run verify:ios-git`** — exits with an error if there are untracked (non-ignored) files under `ios/` or uncommitted edits to tracked `ios/` files. Fix by committing those paths.

## 3. Open native IDEs

```bash
npm run cap:open:android   # Android Studio
npm run cap:open          # Xcode (iOS)
```

Build/run from the IDE on a **device or simulator**.

## 4. Versioning (stores)

Before a store submission, align:

- **Android:** `versionName` / `versionCode` in the app module `build.gradle` (or Gradle version catalog if used).
- **iOS:** `CFBundleShortVersionString` / `CFBundleVersion` in Xcode or `Info.plist`.

Optionally tie these to `package.json` `version` in your release process so marketing and binaries stay in sync.

## 5. Pre-submission checklist

- [ ] **`VITE_APP_SERVER_ORIGIN`**: set to your production web URL for **iOS/Android store** builds so `/api/geocode/*` works (see §1.1). Omit for pure web deploys.
- [ ] **`VITE_VC_SITE_URL`**: same HTTPS origin as production web for **forgot-password** `redirectTo` in native builds (see §1.1b).
- [ ] **Supabase / `VITE_*`**: same production env for web and native builds so cloud data matches (see §8).
- [ ] **Icons & splash** updated for both platforms if branding changed.
- [ ] **Display name** matches store listing.
- [ ] **Permissions** only what you use (`AndroidManifest.xml`, `Info.plist`): location, camera, notifications, etc.
- [ ] **API keys** (maps, backend): restricted to bundle id `com.videocanvass.app` (iOS) and Android application id; not scoped to `localhost` only.
- [ ] **Privacy policy** URL and in-app disclosures as required by Play / App Store.
- [ ] **Deep links** (optional): universal links / App Links configured if you open the app from URLs.

## 6. Smoke test after each sync (devices)

Run on a **physical device** when possible (WebView + keyboard + GPS differ from desktop).

**Maps**

- [ ] Map loads; pan, zoom, and rotate behave normally.
- [ ] Canvass polygons / pins / tracking waypoints render and respond to tap as on mobile web.
- [ ] Address search / reverse geocode / building footprint behave like production web (confirms `VITE_APP_SERVER_ORIGIN` if using a release native build).

**Auth / session**

- [ ] Sign-in (or session restore) works inside the WebView.
- [ ] Reload app: session still valid if you expect persistence.

**Files / media (if used)**

- [ ] Attach or pick photos/files works; permissions prompts appear once and succeed.

**Chrome / shell**

- [ ] No blank white screen after splash.
- [ ] Safe areas and keyboard do not permanently obscure primary actions (compare to mobile Safari/Chrome).

If something works in **mobile browser** but fails in the **app**, compare origin/CORS, mixed content, and CSP; confirm the failing build used the latest `dist/` copy.

**Performance (optional):** [`IOS_PROFILING_CHECKLIST.md`](IOS_PROFILING_CHECKLIST.md) — Safari Web Inspector on a device to find JS/layout hotspots before large refactors.

## 7. Android build: `Unable to delete directory` / `AccessDeniedException` (Windows)

Gradle must delete and recreate folders under `android/app/build/` and under `node_modules/@capacitor/android/.../build/`. On **Windows**, **OneDrive** (or Dropbox, antivirus real-time scan) often **keeps files open** or briefly locks them, so `mergeDebugAssets` / `mergeLibDexDebug` fails with *Unable to delete directory*.

**Do this in order:**

1. **Close Android Studio** completely.
2. **Stop Gradle daemons** (from repo root):

   ```powershell
   .\android\gradlew.bat --stop
   ```

3. **Pause OneDrive** for this folder, or exclude the repo from sync (best long-term: clone the project under e.g. `C:\dev\videocanvass-web`, outside OneDrive).
4. After daemons stop, **delete build outputs** if they still exist (File Explorer or PowerShell):

   - `android\app\build\`
   - Optionally `android\build\`
   - If the error mentioned Capacitor: `node_modules\@capacitor\android\capacitor\build\`

5. Reopen Android Studio and run **Build → Clean Project**, then **Run** again.

The Android project sets `org.gradle.vfs.watch=false` in [gradle.properties](../android/gradle.properties) to reduce watcher-related locks on synced drives; it does not replace closing processes that still hold files open.

## 8. Web and Play: same cloud data (Supabase)

The app reads **`VITE_SUPABASE_URL`**, **`VITE_SUPABASE_ANON_KEY`**, **`VITE_APP_SERVER_ORIGIN`** (for native `/api` calls), and related **`VITE_*`** flags at **build time** (Supabase: [`src/lib/supabase.ts`](../src/lib/supabase.ts); API origin: [`src/lib/appServerOrigin.ts`](../src/lib/appServerOrigin.ts)). Whatever is in the environment when you run **`npm run build`** is embedded in `dist/` — and that same folder is what Capacitor copies into the iOS and Android apps.

**Checklist**

- [ ] **One Supabase project** for the environment you care about (staging vs production is fine; web and Android for that environment should match).
- [ ] **Same `.env` / CI secrets** for `npm run build` as you use for your **hosted web** deploy. If the Play AAB was built on a machine without `VITE_SUPABASE_*`, the installed app can run **local-only** and will not show the same cases as the website.
- [ ] **`VITE_VC_RELATIONAL_BACKEND`** and any other feature flags: keep them aligned with what production web uses if you expect identical behavior.
- [ ] After changing env, **rebuild** (`npm run build` → sync → new AAB); env is not read at runtime from a server.

Local template: [`.env.example`](../.env.example) → copy to `.env.local` (gitignored).

## 9. Supabase Auth (dashboard — manual)

Do this in [Supabase Dashboard](https://supabase.com/dashboard) for the same project your builds use.

**Authentication → URL configuration**

- **Site URL**: your production web origin (e.g. `https://your-app.example.com`).
- **Redirect URLs**: add every origin users sign in from (production, preview/staging if used). For **OAuth** or **magic links**, also add any **app deep link** or custom scheme callbacks you configure for `com.videocanvass.app` if applicable.

**Authentication → Providers → Email**

- Enable **Email**; set whether **Confirm email** is required for new sign-ups.
- Set password rules to match your policy.

**Authentication → Multi-factor (optional)**

- Enable **MFA** when you want a second factor. The app implements **TOTP (authenticator app)** for sign-in and enrollment (**Cases → Security / 2FA** when `VITE_VC_RELATIONAL_BACKEND=true`). Phone/SMS-only factors are not supported in the client yet; users with only phone MFA will see an error and can sign out.

**Email + password** to the same project usually works on both web and WebView without extra URLs, as long as the client was built with the correct anon key.

**Copy-paste checklist:** [DEPLOY_ENV_CHECKLIST.md](DEPLOY_ENV_CHECKLIST.md).

## 10. Ship UI or bugfix updates to Play Store

The Play app **does not** pull the latest website automatically; it ships a **frozen copy** of `dist/` inside the AAB. Each app update needs a **new release**.

**Steps (repeat for every code or asset change you want testers/users to get):**

1. **`npm run build`** — use the **same** production `VITE_*` env as web (see §8).
2. **Sync web into native projects:** `npm run cap:sync` or `node scripts/cap-copy-web.cjs`.
3. **Bump Android `versionCode`** (required for every Play upload) in [`android/app/build.gradle`](../android/app/build.gradle) — increment by at least 1; optionally update `versionName` for humans.
4. **Build a release AAB** in Android Studio (**Build → Generate Signed App Bundle / APK**) or `./gradlew bundleRelease` with your release signing config.
5. **Upload** the `.aab` to Play Console (Internal / Closed / Open testing or Production) and roll out the release.

**Hosted web** users get changes as soon as you **deploy** the new static build; **Play** users get them only after this sequence and store processing.
