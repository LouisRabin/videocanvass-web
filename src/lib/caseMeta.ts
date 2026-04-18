/** Max characters for case `description` (case list, case header, new-case modal). */
export const CASE_DESCRIPTION_MAX_CHARS = 200

export function clampCaseDescription(text: string): string {
  if (text.length <= CASE_DESCRIPTION_MAX_CHARS) return text
  return text.slice(0, CASE_DESCRIPTION_MAX_CHARS)
}

/** Single-line name + 2-line description editors share this height for vertical alignment. */
export const CASE_META_INLINE_CONTROL_HEIGHT_PX = 58
