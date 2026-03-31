# Handoff — videocanvass-web (Case page / full web UI)

Short summary for the next person picking up this repo after the recent Case page work.

## Product behavior (what changed)

### Map address search (full web)
- Floating address search next to mode toggles no longer grows to fill the whole map row.
- **Wide layout:** wrapper uses `flex: 0 1 auto` and `width: min(400px, 100%)` instead of `flex: 1`.
- **Narrow:** unchanged (`flex: 1`).
- **File:** `src/app/CasePage.tsx` (floating `narrowMapAddressRef` wrapper).

### Notes / detail sheet — Video canvassing (wide map drawer)
- **`LocationDrawer`** (`layout === 'wide'` in `CasePageChrome.tsx`):
  - Remove control lives in a **header row** with the address (outside the scroll area) so it does not sit on the scrollbar.
  - **Camera results** use a **compact 2×2** grid (`repeat(2, max-content)`, intrinsic-width pills via `canvassResultsPills(..., true)`) to drop “dead” stretched cells.
  - **Notes** sit in a **row to the right** of the pills; outline messages stay full width below.
  - Notes textarea is **short and wide** (`minHeight` / `maxHeight` caps, `rows={2}` on wide) to limit vertical overflow.

### Notes — Subject tracking (wide map drawer)
- **`TrackPointDrawer`:** same ideas — Remove in header, notes column widened with shorter textarea on wide; column order puts notes **first** in the flex row.

### Subject tracking — map seam / expand control (full web)
- Expand chevron at the **map bottom seam** is **always** available on wide tracking, even when **no step** is selected (parity with Video canvassing map).
- **Logic:** `showWideMapDrawerSeam` includes `caseTab === 'tracking'` without requiring `selectedTrackPoint`. Related flags (`wideMapDrawerSeamBottomTab`, `wideMapDrawerSeamSheetTopTab`, `showMapDetailOverlayShell`) were updated so the overlay shell and toggles work the same way.
- **Empty expanded state:** `WideMapTrackStepPlaceholder` in `CasePage.tsx` mirrors `WideMapNotesPlaceholder` (“select a step on the map…”).
- **Selection vs drawer:** `trackDrawerDetailsOpen` is only forced closed when **`selectedTrackPointId` becomes null** (not on every step change), so switching steps can keep the sheet open like address notes.

## Key files

| Area | File |
|------|------|
| Workspace grid, floating search, seam flags, placeholders | `src/app/CasePage.tsx` |
| `LocationDrawer`, `TrackPointDrawer`, pills, map chrome | `src/app/case/CasePageChrome.tsx` |
| Outside-dismiss / map interaction | `src/app/case/hooks/useMapPaneOutsideDismiss.ts` (unchanged in this handoff; verify if you add new overlay hit targets) |

## Invariants to respect

Code comments around **`mapPaneDetailOverlayStyle`** and **`showWideMapDrawerSeam`** describe stacking and when the overlay is `display: none` vs collapsed (`wideMapDetailCollapsed`). If you change seam behavior, re-check:

- Bottom seam toggle vs top-of-sheet toggle (only one should be the primary affordance for a given expanded state).
- Z-index vs MapLibre markers (~5000 band in `CasePage.tsx`).
- Narrow vs wide: several conditions use `!isNarrow` explicitly so phone layouts are not forced into desktop-only behavior.

## Verification

- `npx tsc -b` — passes as of last change.
- E2E: `npm run test:e2e` — run if you touch dismiss/seam/list stability (`tests/e2e/casepage-stability.spec.ts`).

## Possible follow-ups (not done here)

- Tweak `400px` search cap or notes `maxHeight` if UX still feels tight on very short viewports.
- If tracking **narrow** should also show the seam with no selection, that would be a separate product decision (currently wide-only parity).

---

*Last updated from session handoff — adjust dates/details in git history as needed.*
