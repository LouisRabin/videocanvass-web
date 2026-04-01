import type { SupabaseClient } from '@supabase/supabase-js'

export type VcAuditAction =
  | 'case.delete'
  | 'case_collaborator.add'
  | 'case_collaborator.remove'
  | 'attachment.delete'
  | 'location.delete'

export async function logVcAudit(
  supabase: SupabaseClient,
  input: {
    actorUserId: string
    action: VcAuditAction
    entityType?: string
    entityId?: string
    caseId?: string | null
    meta?: Record<string, unknown>
  },
): Promise<void> {
  try {
    await supabase.from('vc_audit_log').insert({
      actor_user_id: input.actorUserId,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      case_id: input.caseId ?? null,
      meta: input.meta ?? null,
    })
  } catch {
    // Non-blocking; audit must not break user flows
  }
}
