import { Capacitor } from '@capacitor/core'

import type { TargetMode } from './targetMode'

type NativePlatform = 'ios' | 'android' | 'none'

type NativeCapabilities = {
  platform: NativePlatform
  supportsHaptics: boolean
  supportsBackgroundLocation: boolean
  supportsNativeCamera: boolean
}

function detectNativePlatform(): NativePlatform {
  if (typeof navigator === 'undefined') return 'none'
  if (Capacitor.isNativePlatform()) {
    const p = Capacitor.getPlatform()
    if (p === 'ios' || p === 'android') return p
  }
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'none'
}

export function getNativeCapabilities(targetMode: TargetMode): NativeCapabilities {
  if (targetMode !== 'mobile') {
    return {
      platform: 'none',
      supportsHaptics: false,
      supportsBackgroundLocation: false,
      supportsNativeCamera: false,
    }
  }
  const platform = detectNativePlatform()
  return {
    platform,
    supportsHaptics: platform !== 'none',
    supportsBackgroundLocation: platform !== 'none',
    supportsNativeCamera: platform !== 'none',
  }
}
