# Cleanup log (2026-04-11)

## Removed / dead code

- [`src/app/case/CaseInlineSyncBar.tsx`](../src/app/case/CaseInlineSyncBar.tsx) — unused component (knip).
- [`hasAnyPdfMapSelection`](../src/lib/caseExportOptions.ts) — unused helper.
- [`viewModeBtn`](../src/app/case/CasePageChrome.tsx) — unused export (CasePage uses local glass variants).

## Docs

- Canonical handoff: [`docs/HANDOFF.md`](HANDOFF.md) (merged former root deep-dive). Root [`HANDOFF.md`](../HANDOFF.md) is a pointer only.

## Dependencies

- Removed unused **`@vis.gl/react-maplibre`** from `package.json`.
- **`knip.json`** / **`.depcheckrc.json`** — ignore lists extended for packages required by Supabase transitive resolution, Vite/Windows `ensure-deps`, `tslib` alias, and `postinstall` (`@rollup/wasm-node`).

## Bundle / load

- PDF export: [`caseExportPdfCore.ts`](../src/lib/caseExportPdfCore.ts) loaded via dynamic `import()` from [`caseExportPdf.ts`](../src/lib/caseExportPdf.ts) so **jspdf** ships only when exporting PDF.
- Excel workbook: [`downloadCaseAddressesTracksWorkbook`](../src/lib/caseExportWorkbook.ts) uses dynamic **`xlsx`** import.

## Lint

- Ignore [`___BACKUPDONOTTOUCH___`](../eslint.config.js) in ESLint; **`react-hooks/purity`** off (session idle clock reads `Date.now()` by design).

## API

- [`decideCanvassSaveTarget`](../src/app/casePageHelpers.ts) — dropped unused third argument (`Set`).

## Build chunks (post-change, `npm run build`)

- **`CasePage-*.js`** ~235 kB gzip ~68 kB — case UI without PDF/XLSX stacks in the same file.
- **`caseExportPdfCore-*.js`** ~420 kB gzip ~137 kB — loaded when the user runs a **PDF** export.
- **`xlsx-*.js`** ~429 kB gzip ~143 kB — loaded when the user runs **both CSV sheets** as one workbook.
