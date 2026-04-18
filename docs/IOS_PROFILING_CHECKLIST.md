# iOS profiling checklist (Safari Web Inspector)

Use this on a **real device** or the **iOS Simulator** with your Capacitor build or mobile Safari. Numbers below are filled in during a session — the goal is a short list of **top 1–3 hotspots** before changing code.

## Setup

1. On the **Mac**: Safari → Settings → Advanced → enable **Show features for web developers**.
2. On the **iPhone**: Settings → Safari → Advanced → **Web Inspector** ON.
3. Connect USB → open **Safari** on Mac → menu **Develop** → pick the device → select the **VideoCanvass** page / `capacitor://` WebView.

## What to record

| Step | Action | Notes (CPU spikes, long tasks, dropped frames) |
|------|--------|--------------------------------------------------|
| 1 | Cold open app → **Login** (if shown) | Initial parse / layout |
| 2 | Sign in → **Cases** list, scroll quickly | List layout / scroll jank |
| 3 | Open a **Case** → map idle ~5s | MapLibre / tile / GeoJSON cost |
| 4 | Pan/zoom map continuously ~10s | `moveend` / layer updates |
| 5 | Switch **Addresses / Tracking** tabs | Remount / layer churn |
| 6 | Background app 10s → foreground | Resume / resize behavior |
| 7 | Rotate **landscape** → **portrait** | `resize` / layout thrash |

## Inspector panes

- **Timelines** (or Performance): long yellow blocks on the main thread; note **call stacks** if symbolicated.
- **Layers / Rendering**: excessive repaints (less common with MapLibre GL).
- **Memory**: growth while repeating steps 3–4 (leaks vs expected tile cache).

## Likely code touchpoints (after you see hotspots)

- Map: [`src/app/AddressesMapLibre.tsx`](../src/app/AddressesMapLibre.tsx) (`flushPreload`, `onMoveEnd`, resize).
- Case shell: [`src/app/CasePage.tsx`](../src/app/CasePage.tsx) (very large; optimize only what the profiler names).
- List: [`src/app/CasesPage.tsx`](../src/app/CasesPage.tsx).

## Result template (copy and fill)

```
Date:
Device / iOS version:

Longest tasks (approx ms + action):
1.
2.
3.

Regress / next code change:
```
