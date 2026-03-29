# New computer — Android setup (pick up here)

Use this when you open **VideoCanvass** on a **different PC** after OneDrive has synced. **Only work in the OneDrive folder** — no second copy.

---

## 1. Wait for OneDrive

- Sign in to the same Microsoft account.
- Wait until **`videocanvass-web`** has fully synced (check the OneDrive icon in the taskbar).
- Recommended: **right‑click the project folder → Always keep on this device** so files are local before you run `npm install`.

---

## 2. Install (once per machine)

| Software | Get it from |
|----------|-------------|
| **Node.js** (LTS, e.g. 20.x) | https://nodejs.org/ |
| **Android Studio** | https://developer.android.com/studio |

Open **Android Studio** once and finish the setup wizard (SDK download). Create or reuse an **Android Virtual Device (AVD)** in **Device Manager** when you’re ready to run the app.

---

## 3. Open the project folder

Your path will look like:

```text
C:\Users\<YourName>\OneDrive\videocanvass-web
```

Open **PowerShell** or **Terminal** **in that folder** (Shift+right‑click in Explorer → “Open in Terminal”, or `cd` there).

Do **not** use a copy under `Documents` or elsewhere unless you’ve moved the project on purpose.

---

## 4. Install npm dependencies

```powershell
cd C:\Users\<YourName>\OneDrive\videocanvass-web
npm install
```

---

## 5. Environment variables (Android builds)

Set **User** environment variables (Windows: Settings → System → About → Advanced system settings → Environment variables):

| Variable | Typical value |
|----------|----------------|
| `ANDROID_HOME` | `C:\Users\<YourName>\AppData\Local\Android\Sdk` (confirm in Android Studio → **Settings → Languages & Frameworks → Android SDK**) |
| `JAVA_HOME` | `C:\Program Files\Android\Android Studio\jbr` (or `%LOCALAPPDATA%\Programs\Android\Android Studio\jbr`) |

Close and reopen the terminal after saving.

Quick check:

```powershell
echo $env:ANDROID_HOME
echo $env:JAVA_HOME
```

---

## 6. Build the web app and sync into Android

```powershell
npm run cap:sync
```

This runs `npm run build` and copies `dist/` into the **`android/`** project (OneDrive‑safe script, no `npx cap` required for this step).

If this fails, see **Troubleshooting** below.

---

## 7. Run on the emulator

1. Start your **emulator** from Android Studio (**Device Manager** → Play).
2. In the project folder:

   ```powershell
   npm run cap:open:android
   ```

3. In Android Studio: wait for **Gradle sync**, select the emulator, click **Run** (green triangle).

First run can take a few minutes while Gradle downloads dependencies.

---

## 8. When you chat with the AI tomorrow

Paste something like:

> I’m on my other PC, OneDrive synced. I’m following `docs/SETUP_NEW_COMPUTER.md` for Android. I’m stuck at: [step / error message].

That file path helps pick up without re‑explaining the whole setup.

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| `npm` / `node` not found | Reopen terminal after installing Node; confirm `node -v` works. |
| OneDrive / `UNKNOWN` read errors | **Always keep on this device** on the project folder; pause sync briefly; run `npm install` again. |
| `JAVA_HOME` / `ANDROID_HOME` | Set as above; restart terminal; confirm paths exist in File Explorer. |
| Gradle sync failed | Open **Android Studio → SDK Manager**; install suggested **Android SDK** / **Build-Tools**; **File → Invalidate Caches** if needed. |
| Blank screen in app | Run `npm run cap:sync` again; in Android Studio **Build → Clean Project**, then **Rebuild**. |

More detail: [TESTING_WALKTHROUGH.md](TESTING_WALKTHROUGH.md).

---

## Quick command cheat sheet

```powershell
cd C:\Users\<YourName>\OneDrive\videocanvass-web
npm install
npm run cap:sync
npm run cap:open:android
```

Optional debug APK for Appetize: `npm run appetize:android` (after env vars are set).
