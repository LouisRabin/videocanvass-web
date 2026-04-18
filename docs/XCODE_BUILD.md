# iOS / Xcode build checklist

Goal: ship the **same** Vite `dist/` that the web app uses, inside the Capacitor iOS shell, with minimal back-and-forth.

## 1. One-time (per machine)

- **Xcode** from the Mac App Store, signed in with your **Apple ID** (and team for signing).
- **Node.js** (match CI if you can — see [`.github/workflows/ci-web-build.yml`](../.github/workflows/ci-web-build.yml)).
- From the repo root: `npm ci` (or `npm install`).

## 2. Every release (or before Archive)

From the **repo root** (`videocanvass-web`):

1. **Production client env** — set the same `VITE_*` values you use on Vercel (at minimum `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VC_RELATIONAL_BACKEND`, and **`VITE_APP_SERVER_ORIGIN`** pointing at your live site so `/api/geocode/*` works in the Capacitor WebView). **Vercel’s Environment Variables UI does not apply to `npm run build` on your Mac** — copy from the dashboard into a local **`.env.production`** (see [`.env.production.example`](../.env.production.example)), or export vars in the shell **before** step 2.
2. **Build web assets:**  
   `npm run build`
3. **Copy into the iOS project** (pick one):
   - **Recommended on a Mac** (updates native wiring if plugins change):  
     **`npm run cap:sync:ios`** (build + `cap sync ios`), or **`npm run cap:sync:cli`** for iOS + Android together.
   - **Windows / OneDrive** when `npx cap` fails:  
     **`npm run cap:sync`** — runs `build` + [`scripts/cap-copy-web.cjs`](../scripts/cap-copy-web.cjs) only. On a Mac, still run `npx cap sync ios` **once** after adding/removing Capacitor plugins so Xcode stays in sync.

## 3. Open Xcode

```bash
npm run cap:open
```

Or open manually: **`ios/App/App.xcodeproj`**.

- Select the **App** scheme, a **real device** or simulator, press **Run** to smoke-test.
- For TestFlight / App Store: **Product → Archive**, then distribute through Organizer.

## 4. Signing gotchas (short)

- Set **Team** on the App target → *Signing & Capabilities*.
- Use a unique **Bundle Identifier** if Apple complains about conflicts (must match `appId` in [`capacitor.config.ts`](../capacitor.config.ts) unless you change both places deliberately).

## 5. Web vs iOS cadence

- **Web:** still deploys from Git → Vercel ([`vercel.json`](../vercel.json)).
- **iOS:** each store build embeds whatever was in `dist/` at `cap sync` / `cap:sync` time. To ship new UI to the App Store, repeat section 2 and archive again.

## 6. Performance profiling (optional)

Use [`IOS_PROFILING_CHECKLIST.md`](IOS_PROFILING_CHECKLIST.md) with Safari **Develop** → device WebView to capture where CPU time goes before larger refactors.

## 7. Verify geocode / address resolution (map tap → street address)

**Hosted production (no phone):** from the repo root, hit the same `/api/geocode/*` routes the app uses after a map tap:

```bash
npm run verify:geocode-proxies -- https://www.your-deployed-site.com
```

**iOS still shows `Lat …, Lon …`:** attach **Safari → Develop →** *your simulator or device* **→** *VideoCanvass* (WKWebView). In the **Console**, search for **`VITE_APP_SERVER_ORIGIN is unset`** ([`src/lib/appServerOrigin.ts`](../src/lib/appServerOrigin.ts)). In the **Network** tab, confirm requests go to **`https://your-site.com/api/geocode/photon-reverse`** (not `capacitor://` alone). With **`VITE_VC_DEBUG=true`** in the build, the fixed footer shows **`api_origin_host=…`** or an empty-origin warning ([`src/lib/buildDebug.ts`](../src/lib/buildDebug.ts)).

See also [`docs/MOBILE_RELEASE.md`](MOBILE_RELEASE.md) §1.1 (`VITE_APP_SERVER_ORIGIN`).
