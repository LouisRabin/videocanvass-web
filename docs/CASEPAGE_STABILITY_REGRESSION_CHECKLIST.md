# CasePage Stability Regression Checklist

This checklist captures the current `CasePage` behavior baseline to verify parity after cleanup refactors.

## Baseline Intent

- Keep UI/interaction behavior unchanged while reducing in-file duplication.
- Keep map search/outside-dismiss behavior routed through shared hooks.
- Keep dock/control rendering structure stable across web and mobile modes.

## Regression Checks

Run these checks in both default data and realistic case data:

- Web left collapsible toolbar is present in map mode, opens/closes reliably, and section toggles (`Views`, `Filters`, `Tracks`, `Photos`) still work.
- Toolbar and notes spacing remains stable across 3 viewport heights (short, medium, tall) without overlap/clipping.
- Mobile click-off behavior still applies grace timing/dead-zone behavior (dock does not instantly close after open, and outside taps dismiss correctly).
- DVR flow entry points remain functional from control pane and map tools dock.

## Verification Loop

For every cleanup pass:

1. `npx tsc -b --clean`
2. `npm run build`
3. Re-run the 4 regression checks above
