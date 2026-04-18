import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const capacitorState = vi.hoisted(() => ({ isNative: false, platform: 'web' as string }))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capacitorState.isNative,
    getPlatform: () => capacitorState.platform,
  },
}))

import { isMobileProximityClient } from '../src/lib/mobilePlatform'

function stubNav(ua: string, platform: string, maxTouchPoints = 0) {
  vi.stubGlobal('navigator', {
    userAgent: ua,
    platform,
    maxTouchPoints,
  } as Navigator)
  vi.stubGlobal('window', {} as Window)
}

describe('isMobileProximityClient', () => {
  beforeEach(() => {
    capacitorState.isNative = false
    capacitorState.platform = 'web'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true for Capacitor iOS regardless of UA', () => {
    capacitorState.isNative = true
    capacitorState.platform = 'ios'
    stubNav('Mozilla/5.0 (Windows NT 10.0)', 'Win32')
    expect(isMobileProximityClient()).toBe(true)
  })

  it('returns true for Capacitor Android', () => {
    capacitorState.isNative = true
    capacitorState.platform = 'android'
    stubNav('Mozilla/5.0 (Windows NT 10.0)', 'Win32')
    expect(isMobileProximityClient()).toBe(true)
  })

  it('returns false for desktop browser UA when not native', () => {
    stubNav(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Win32',
    )
    expect(isMobileProximityClient()).toBe(false)
  })

  it('returns true for iPhone mobile web', () => {
    stubNav(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'iPhone',
      5,
    )
    expect(isMobileProximityClient()).toBe(true)
  })

  it('returns true for Android mobile web', () => {
    stubNav(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Linux armv8l',
    )
    expect(isMobileProximityClient()).toBe(true)
  })

  it('returns true for iPad desktop-mode UA hint (MacIntel + touch)', () => {
    stubNav(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'MacIntel',
      5,
    )
    expect(isMobileProximityClient()).toBe(true)
  })
})
