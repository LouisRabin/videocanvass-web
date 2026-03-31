# Target Request Template

Use this format when asking for changes so scope is explicit:

- `Target:` `WEB` or `MOBILE`
- `Screen:` e.g. `CasePage map`, `Cases list`, `Login`
- `Native-only:` optional `IOS` or `ANDROID`
- `Do not change:` optional guardrails
- `Acceptance:` 2-5 bullets

## Target meanings

- `WEB`: desktop browser layout/features.
- `MOBILE`: iOS app, Android app, and mobile browser layout/features.
- `Native-only: IOS/ANDROID`: platform-specific behavior inside MOBILE.

## Example

- `Target: MOBILE`
- `Screen: CasePage map tools`
- `Native-only: IOS`
- `Do not change: WEB map toolbar layout`
- `Acceptance: add haptic feedback on long press; Android unchanged; no map pin regressions`
