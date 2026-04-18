import { Capacitor } from '@capacitor/core'

/** Must match `appId` in `capacitor.config.ts` / Android `applicationId`. */
const APP_PACKAGE = 'com.videocanvass.app'

/**
 * Best effort: open the host app’s page in system settings so the user can enable location.
 * (Native apps only; on mobile web this may be a no-op or only open the Settings app on some iOS builds.)
 */
export function openAppLocationInSystemSettings(): void {
  if (typeof window === 'undefined') return
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
    // Opens Settings; user navigates to Camera Canvass → Location (iOS may block deep links in WebView; still best effort).
    try {
      window.location.assign('x-apple-app-settings:')
    } catch {
      /* ignore */
    }
    return
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    // Application details (Permissions → Location).
    const u = `intent:android.settings.APPLICATION_DETAILS_SETTINGS#Intent;data=package%3A${encodeURIComponent(
      APP_PACKAGE,
    )};end`
    try {
      window.location.assign(u)
    } catch {
      /* ignore */
    }
    return
  }
  // Mobile web (Safari, Chrome): iOS can sometimes open the Settings app from `x-apple-app-settings:`
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    try {
      window.location.assign('x-apple-app-settings:')
    } catch {
      /* ignore */
    }
  }
}
