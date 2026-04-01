import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

export type MobileOS = 'ios' | 'android'

/**
 * Best-effort OS hint for tuning native controls. Desktop / unknown mobile UAs return null.
 */
export function getMobileOS(): MobileOS | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  const iPadDesktopUA = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  if (/iPhone|iPad|iPod/i.test(ua) || iPadDesktopUA) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return null
}

/** Prefer OS-native keyboard behavior on phone layouts. */
export function nativeMobileTextInputProps(os: MobileOS | null): Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'autoComplete' | 'autoCorrect' | 'autoCapitalize' | 'spellCheck'
> {
  const off = { autoComplete: 'off' as const }
  if (os === 'ios') {
    return { ...off, autoCorrect: 'off', autoCapitalize: 'sentences', spellCheck: false }
  }
  if (os === 'android') {
    return { ...off, autoCorrect: 'off' }
  }
  return off
}

export function nativeMobileSearchInputProps(os: MobileOS | null): Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'autoComplete' | 'autoCorrect' | 'autoCapitalize' | 'spellCheck' | 'enterKeyHint' | 'inputMode'
> {
  return {
    ...nativeMobileTextInputProps(os),
    enterKeyHint: 'search',
    inputMode: 'text',
  }
}

export function nativeMobileTextareaProps(os: MobileOS | null): Pick<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'autoCorrect' | 'autoCapitalize' | 'spellCheck'
> {
  if (os === 'ios') {
    return { autoCorrect: 'off', autoCapitalize: 'sentences', spellCheck: false }
  }
  if (os === 'android') {
    return { autoCorrect: 'off' }
  }
  return {}
}
