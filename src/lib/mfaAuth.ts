import type { SupabaseClient } from '@supabase/supabase-js'

/** True when the session must complete MFA (TOTP) before reaching AAL2. */
export async function sessionNeedsTotpStep(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return false
  return data.currentLevel === 'aal1' && data.nextLevel === 'aal2'
}

/** First verified TOTP factor id, if any. */
export async function getPreferredTotpFactorId(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.auth.mfa.listFactors()
  if (error || !data?.totp?.length) return null
  const id = data.totp[0]?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

export async function verifyTotpChallenge(client: SupabaseClient, factorId: string, code: string): Promise<void> {
  const trimmed = code.replace(/\s/g, '')
  const { data: ch, error: chErr } = await client.auth.mfa.challenge({ factorId })
  if (chErr) throw chErr
  if (!ch?.id) throw new Error('MFA challenge failed')
  const { error: vErr } = await client.auth.mfa.verify({
    factorId,
    challengeId: ch.id,
    code: trimmed,
  })
  if (vErr) throw vErr
}
