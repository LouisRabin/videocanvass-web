# Testing walkthrough — VideoCanvass (OneDrive / Windows)

**Only this OneDrive folder is the working project** (`…\OneDrive\videocanvass-web`). Use it on every PC; do not maintain a parallel copy in `Documents` or another path.

It includes the full **web app** (Vite + React + MapLibre, Supabase, etc.) plus **`android/`** and **`ios/`** Capacitor shells.

---

## OneDrive and Capacitor CLI

Microsoft OneDrive can cause **`npx cap`** to crash with `UNKNOWN: unknown error, read` while reading `node_modules`. This repo avoids that for day‑to‑day work:

- **`npm run cap:sync`** runs `npm run build` and then **`node scripts/cap-copy-web.cjs`**, which copies `dist/` into the native projects **without** calling the Capacitor CLI.

Use **`npm run cap:sync:cli`** (`npx cap sync`) only on a machine where it works, for example after adding a **native plugin** (rare).

**Xcode (iOS):** run **`npm run cap:sync`** before opening the project the first time so **`ios/App/App/public`** and **`config.xml`** exist (gitignored; the copy script creates them). Without them, Xcode reports missing `public` / `config.xml`.

**Tips if anything under OneDrive misbehaves**

1. **Right‑click the project folder → Always keep on this device**, wait until sync finishes.  
2. Or **pause OneDrive** briefly while running `npm install`.  
3. On a second PC: open the same OneDrive path, **`npm install`**, then **`npm run cap:sync`**.

---

## Part 1 — Web app (fastest check)

```powershell
cd C:\Users\Louis\OneDrive\videocanvass-web
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). Dev‑server **proxies** (`/api/geocode/...`) only apply here; the **Android app** talks to real HTTPS URLs from the device.

---

## Part 2 — Android (Android Studio on Windows 11)

### Environment (once per PC)

- **`ANDROID_HOME`** — usually `C:\Users\<you>\AppData\Local\Android\Sdk` (see Android Studio → Settings → Android SDK).  
- **`JAVA_HOME`** — e.g. `C:\Program Files\Android\Android Studio\jbr`  
- Optional: add **`%ANDROID_HOME%\platform-tools`** to **Path** (`adb`).

### Emulator

Android Studio → **Device Manager** → create/start a virtual phone.

### Build web assets + copy into Android

```powershell
cd C:\Users\Louis\OneDrive\videocanvass-web
npm run cap:sync
```

### Run

```powershell
npm run cap:open:android
```

In Android Studio: wait for Gradle sync, select the **emulator**, **Run**. Grant **location** if you test GPS; emulator **⋯ → Location** sets a test position.

---

## Part 3 — Debug APK (e.g. Appetize)

```powershell
npm run appetize:android
```

Output: **`dist-appetize\VideoCanvass-android-debug.apk`** → upload at [appetize.io/upload](https://appetize.io/upload).

---

## Part 4 — iOS (Mac + Xcode)

On a Mac, in this same folder:

```bash
npm install
npm run cap:sync
npm run cap:open
```

**Appetize (iOS Simulator .zip only):** `npm run appetize:ios` — see [Appetize iOS docs](https://docs.appetize.io/platform/app-management/uploading-apps/ios).

---

## Command reference

| Command | Purpose |
|--------|---------|
| `npm run dev` | Web app + dev proxies |
| `npm run build` | Production `dist/` only |
| `npm run cap:sync` | Build + copy `dist` → Android/iOS (OneDrive‑safe) |
| `npm run cap:sync:cli` | Build + `npx cap sync` (when CLI works) |
| `npm run cap:open:android` | Open `android` in Android Studio |
| `npm run cap:open` | Open iOS project (Mac) |
| `npm run appetize:android` | APK → `dist-appetize/` |
| `npm run appetize:ios` | Simulator zip (Mac) |

---

## Don’t run this by mistake

`cd path\to\videocanvass-web` was only a **placeholder** in old docs. Your real path is **`C:\Users\Louis\OneDrive\videocanvass-web`** (or whatever OneDrive shows).
