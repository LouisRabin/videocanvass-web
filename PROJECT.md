# Camera Canvass — Project Handoff

This file is the “handoff” context so you can move computers and quickly continue development in a new chat.

## Goal
Build a collaborative tool for detectives conducting **video canvasses** to track which locations have been visited and the camera/footage status for each address, per case.

Primary workflow:
- Create/manage **cases**
- Add **addresses** quickly (autocomplete)
- View on a **map** and in a **list**
- Track 3 statuses:
  - **No cameras**
  - **Cameras, no answer** (needs return)
  - **Probative footage** (priority follow-up)

Collaboration/auth will come later (likely Microsoft/Entra ID).

## Current state (implemented)
- **Runs on Windows** as a web app (Vite + React + TypeScript)
- **Offline-first local storage** (IndexedDB via `localforage`)
- **Cases**
  - Create case via **modal UI** (no browser prompts)
  - Search and delete cases
  - Case “number” is treated as **Case Name** (primary display field)
  - Optional description shown under case name
- **Map / locations**
  - Leaflet map with OpenStreetMap tiles
  - 3 status colors + legend with **live counts**
  - Filters per status
  - Fit pins, Locate me
  - Click pin → **right-side drawer** (edit status, notes, mark visited, delete)
- **Add address**
  - Autocomplete via free Photon/OSM (`https://photon.komoot.io/api/`)
  - Performance improvements: debounce, abort stale requests, cache, optional location bias

## Tech stack
- **Vite** + **React 19** + **TypeScript**
- **MapLibre** (`react-map-gl`) + **leaflet** package for lat/lng helper APIs only (no react-leaflet)
- **localforage** for offline persistence
- **zod** for basic runtime validation

## Key folders / files
- `src/App.tsx`: simple route switch (cases list vs case page)
- `src/app/CasesPage.tsx`: cases list + “create case” modal
- `src/app/CasePage.tsx`: map, legend, filters, location drawer, add-address UI
- `src/app/Modal.tsx`: reusable modal overlay
- `src/lib/store.tsx`: in-app store + persistence actions
- `src/lib/db.ts`: load/save data to IndexedDB
- `src/lib/geocode.ts`: Photon autocomplete (with cache + abort)
- `src/lib/types.ts`: data types and status helpers

## How to run (dev)
From the project folder:

```bat
npm.cmd install
npm.cmd run dev
```

If `npm` is blocked in PowerShell, either use `npm.cmd` from CMD, or set:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## Notes / known constraints
- Current data is stored in the **browser’s IndexedDB**, so it does not automatically move between computers.
  - If needed, add **Export/Import JSON** UI later.
- Free Photon/OSM autocomplete can be slow/unreliable at times (no SLA). We improved perceived speed, but a future upgrade could add a fallback provider.

## Suggested next steps
Highest-value next work:
- Add a **List view** for locations (with the same drawer editor) and quick status toggles.
- Add “Needs return” as an explicit field (separate from status) OR keep it implied by “Cameras, no answer”.
- Add **export/import** of case data (JSON) for backups and device switching.
- Prep for collaboration:
  - add `createdBy`, `updatedBy`, audit log entries
  - decide sync backend + Microsoft auth (Entra ID)

## “Continue this project” prompt (copy/paste into a new chat)
Open `PROJECT.md` and continue implementing the next steps. Keep costs low (no paid APIs unless necessary). Prioritize field usability: fast entry, map clarity, offline reliability.

