import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'case-attachments'

/** Default lifetime for signed attachment URLs (seconds). */
export const CASE_ATTACHMENT_SIGNED_URL_EXPIRES_SEC = 4 * 60 * 60

function dataUrlToBlob(dataUrl: string): { blob: Blob; contentType: string } {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim())
  if (!m) throw new Error('Invalid data URL')
  const contentType = m[1] ?? 'application/octet-stream'
  const binary = atob(m[2]!)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { blob: new Blob([bytes], { type: contentType }), contentType }
}

/** Upload image; returns storage path `{caseId}/{attachmentId}`. */
export async function uploadCaseAttachmentFromDataUrl(
  supabase: SupabaseClient,
  caseId: string,
  attachmentId: string,
  dataUrl: string,
): Promise<{ path: string; contentType: string }> {
  const { blob, contentType } = dataUrlToBlob(dataUrl)
  const path = `${caseId}/${attachmentId}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  })
  if (error) throw error
  return { path, contentType }
}

export async function deleteCaseAttachmentFromStorage(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<void> {
  if (!storagePath.trim()) return
  await supabase.storage.from(BUCKET).remove([storagePath])
}

export async function createCaseAttachmentSignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresSec = CASE_ATTACHMENT_SIGNED_URL_EXPIRES_SEC,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresSec)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
