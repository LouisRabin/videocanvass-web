import type { TargetMode } from './targetMode'

export type NativePlatform = 'ios' | 'android' | 'none'

export type NativeCapabilities = {
  platform: NativePlatform
  supportsHaptics: boolean
  supportsBackgroundLocation: boolean
  supportsNativeCamera: boolean
}

function detectNativePlatform(): NativePlatform {
  if (typeof navigator === 'undefined') return 'none'
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
