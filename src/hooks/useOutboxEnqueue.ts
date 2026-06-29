// Helper for enqueueing outbound HubSpot operations to crm_sync_outbox.
// The push worker drains this table and writes back hubspot_id + sync_status.
// A pg trigger (notify_crm_outbox_push) fires the push edge function on insert.

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Note: 'archive'/'delete' is intentionally NOT supported. The system never deletes
// or archives HubSpot records — destructive cleanup must be done by users in HubSpot
// itself. The DB also enforces this via a CHECK constraint on op.
export type OutboxOp = 'create' | 'update' | 'associate';

export type OutboxEntityType = 'organization' | 'contact' | 'deal' | 'note' | 'task';

export type EnqueueInput = {
  entity_type: OutboxEntityType;
  entity_id?: string | null;
  hubspot_id?: string | null;
  op: OutboxOp;
  payload?: any;
  associations?: any;
};

// Deterministic idempotency key. Identical logical operations enqueued in quick
// succession collapse to one row (DB has UNIQUE(idempotency_key)). The minute
// bucket lets the same op repeat later if a user genuinely re-edits.
function makeIdempotencyKey(input: EnqueueInput): string {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const payloadHash = hashString(JSON.stringify(input.payload ?? {}));
  return [
    input.entity_type,
    input.op,
    input.entity_id ?? 'new',
    input.hubspot_id ?? 'nohs',
    payloadHash,
    minuteBucket,
  ].join(':');
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/**
 * Insert a row into crm_sync_outbox. Failures are logged but never thrown —
 * push is a background concern and shouldn't break the local mutation UX.
 * Local row is also marked sync_status='pending' if entity table is provided.
 */
export async function enqueueOutbox(input: EnqueueInput): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('crm_sync_outbox').insert({
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      hubspot_id: input.hubspot_id ?? null,
      op: input.op,
      payload: input.payload ?? {},
      associations: input.associations ?? {},
      idempotency_key: makeIdempotencyKey(input),
      created_by: u.user?.id ?? null,
    });
    if (error) {
      // Dedupe collision (same idempotency key) is benign — silently swallow.
      const code = (error as any).code;
      const msg = error.message || '';
      if (code === '23505' || msg.includes('crm_sync_outbox_idem_unique')) {
        return;
      }
      // Rate limit (per-user-per-min cap) — surface a friendly toast.
      if (msg.includes('rate limit exceeded')) {
        toast.warning("You're making changes very fast — give the sync a moment to catch up.");
        return;
      }
      console.warn('[outbox] enqueue failed', error);
      return;
    }
    // Mark local row as pending so the UI can show a sync badge.
    if (input.entity_id) {
      const tableMap: Record<OutboxEntityType, string> = {
        organization: 'crm_organizations',
        contact: 'crm_contacts',
        deal: 'crm_deals',
        note: 'crm_activities',
        task: 'crm_activities',
      };
      const table = tableMap[input.entity_type];
      if (table) {
        await supabase
          .from(table as any)
          .update({ sync_status: 'pending', sync_error: null } as any)
          .eq('id', input.entity_id);
      }
    }
  } catch (e) {
    console.warn('[outbox] enqueue threw', e);
  }
}

/**
 * Look up the HubSpot stage id for a local stage row. Used when enqueueing deal updates
 * because HubSpot's `dealstage` property expects the HubSpot stage id, not ours.
 */
export async function getStageHubspotId(stageId: string | null | undefined): Promise<string | null> {
  if (!stageId) return null;
  const { data } = await supabase
    .from('crm_pipeline_stages')
    .select('hubspot_id')
    .eq('id', stageId)
    .maybeSingle();
  return data?.hubspot_id ?? null;
}

export async function getPipelineHubspotId(pipelineId: string | null | undefined): Promise<string | null> {
  if (!pipelineId) return null;
  const { data } = await supabase
    .from('crm_pipelines')
    .select('hubspot_id')
    .eq('id', pipelineId)
    .maybeSingle();
  return data?.hubspot_id ?? null;
}

/**
 * Resolve a local profile id to its mapped external CRM owner id, if any.
 * Returns null when the profile has no mapping (caller decides whether to warn).
 */
export async function getOwnerHubspotId(profileId: string | null | undefined): Promise<string | null> {
  if (!profileId) return null;
  const { data } = await supabase
    .from('crm_owners')
    .select('hubspot_owner_id')
    .eq('profile_id', profileId)
    .order('match_method', { ascending: true }) // 'email_auto' < 'manual' < 'unmatched'; any concrete row wins
    .limit(1)
    .maybeSingle();
  return data?.hubspot_owner_id ?? null;
}
