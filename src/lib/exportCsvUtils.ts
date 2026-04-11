/** Escape a CSV field (RFC-style). */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function safeFileSlug(label: string): string {
  return (
    label
      .trim()
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'case'
  )
}
