/** Persisted per layout variant (web vs mobile) so users get an accurate tour if they resize or switch device. */
export function tourCasesDoneKey(variant: 'web' | 'mobile'): string {
  return `vc_tour_cases_v1_${variant}`
}

export function tourCaseDoneKey(variant: 'web' | 'mobile'): string {
  return `vc_tour_case_v1_${variant}`
}

export const TOUR_CASES_PROMPT_DISMISSED_KEY = 'vc_tour_cases_prompt_v1'

export function readTourFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeTourFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
