# VideoCanvass (web + Capacitor)

## Single working project (OneDrive only)

**This folder is the only working codebase.** Do all edits, builds, and Android Studio opens here — for example `C:\Users\<you>\OneDrive\videocanvass-web`.

- Do **not** keep a second “live” copy under `Documents`, `Desktop`, or another clone and switch between them; you will drift out of sync.
- If an old duplicate exists elsewhere, **archive or delete it** after you confirm anything important is already here (or copy missing files in once, then remove the duplicate).
- **Git** (if you use it) should point at **this same folder** — not a separate checkout you edit instead of OneDrive.

Included: full **web** app (`src/`, Vite) and **Capacitor** **`android/`** + **`ios/`**.

- **`npm run cap:sync`** — builds the web app and copies `dist/` into native projects (uses `scripts/cap-copy-web.cjs` so it works when OneDrive breaks `npx cap`).
- **`npm run cap:open:android`** — open in Android Studio and Run on an emulator.

Full steps: [docs/TESTING_WALKTHROUGH.md](docs/TESTING_WALKTHROUGH.md).

**New or second PC (Android tomorrow):** [docs/SETUP_NEW_COMPUTER.md](docs/SETUP_NEW_COMPUTER.md).

For native plugin changes or if you prefer the official tool: **`npm run cap:sync:cli`** (`npx cap sync`) on a machine where the Capacitor CLI runs cleanly.

## For developers

- **Where the code lives:** [docs/CODEMAP.md](docs/CODEMAP.md)
- **Geocode, footprints, and retrieval policy:** [HANDOFF.md](HANDOFF.md)
- **Hosted web + same env as Android:** [docs/HOSTING_QUICKSTART.md](docs/HOSTING_QUICKSTART.md) and [docs/DEPLOY_ENV_CHECKLIST.md](docs/DEPLOY_ENV_CHECKLIST.md)
- **Netlify:** [`netlify.toml`](netlify.toml) · **Vercel:** [`vercel.json`](vercel.json)

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
