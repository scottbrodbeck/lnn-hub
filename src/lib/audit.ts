import { supabase } from '@/integrations/supabase/client';

/**
 * Per-entity allowlist of fields worth tracking in audit diffs.
 * Anything not listed is silently dropped to keep rows small and meaningful.
 */
const FIELD_ALLOWLIST: Record<string, string[]> = {
  email_blast: [
    'title',
    'subject_line',
    'preview_text',
    'headline',
    'scheduled_date',
    'status',
    'click_url',
    'cta_button_text',
    'cta_button_url',
    'main_image_url',
    'secondary_image_url',
    'body_content',
  ],
  email_sponsorship: [
    'start_date',
    'end_date',
    'status',
    'sponsor_name',
    'click_url',
    'image_url',
    'headline',
  ],
  display_ad_campaign: [
    'name',
    'ad_type',
    'start_date',
    'end_date',
    'is_active',
    'site_id',
    'broadstreet_advertiser_id',
    'broadstreet_campaign_id',
  ],
  display_ad_placement: [
    'ad_name',
    'ad_image_url',
    'click_url',
    'ad_width',
    'ad_height',
    'is_active',
    'started_at',
    'ended_at',
  ],
  assignment: [
    'assignment_name',
    'title',
    'content_category',
    'post_type',
    'due_date',
    'cadence',
    'recurrence_type',
    'recurrence_day_of_week',
    'recurrence_end_date',
    'is_active',
    'site_id',
    'organization_id',
    'notes',
    'email_notifications_enabled',
  ],
  assignment_instance: [
    'instance_date',
    'overridden_due_date',
    'overridden_assignment_name',
    'is_completed',
    'is_skipped',
    'skip_type',
    'exception_notes',
  ],
  post: [
    'title',
    'headline',
    'status',
    'scheduled_date',
    'cta_text',
    'cta_url',
    'cta_button_text',
    'cta_button_url',
    'featured_image_url',
    'content',
    'author_name',
    'author_bio',
    'author_photo_url',
    'logo_url',
    'logo_link_url',
    'logo_author_name',
    'youtube_url',
  ],
  organization: [
    'name',
    'client_code',
    'is_active',
    'default_sponsor_id',
    'sales_rep_user_id',
    'broadstreet_advertiser_id',
    'broadstreet_advertiser_name',
  ],
  user_organization: [
    'role',
    'is_primary',
  ],
};

const MAX_SUMMARY_LEN = 200;

function capSummary(s: string): string {
  if (!s) return s;
  return s.length <= MAX_SUMMARY_LEN ? s : s.slice(0, MAX_SUMMARY_LEN - 1) + '…';
}

/**
 * Snapshot a single row by id, returning only allowlisted columns for the
 * given entity type. Convenience wrapper for the common "fetch before
 * mutating" pattern. Returns null on error or missing row.
 */
export async function snapshotRow(
  table: string,
  id: string,
  entityType: keyof typeof FIELD_ALLOWLIST | string,
): Promise<Record<string, unknown> | null> {
  try {
    const cols = FIELD_ALLOWLIST[entityType as string];
    if (!cols || cols.length === 0) return null;
    const { data, error } = await (supabase as any)
      .from(table)
      .select(cols.join(','))
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

const MAX_FIELD_BYTES = 2048;
const PREVIEW_LEN = 500;

function truncateValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value.length <= MAX_FIELD_BYTES) return value;
  return {
    __truncated: true,
    length: value.length,
    preview: value.slice(0, PREVIEW_LEN),
  };
}

function filterAllowed(
  entityType: string,
  payload: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!payload) return {};
  const allow = FIELD_ALLOWLIST[entityType];
  const out: Record<string, unknown> = {};
  if (!allow) {
    if (import.meta.env.DEV) {
      console.warn(`[audit] entityType "${entityType}" missing from FIELD_ALLOWLIST — diff will be empty`);
    }
    return out;
  }
  for (const key of allow) {
    if (key in payload) out[key] = truncateValue(payload[key]);
  }
  return out;
}


function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'date_changed'
  | 'scheduled'
  | 'rescheduled'
  | 'cancelled'
  | 'completed'
  | 'reset'
  | 'role_changed'
  | 'added'
  | 'removed'
  | (string & {});

export interface RecordAuditOptions {
  organizationId: string;
  /** Short action verb, e.g. "campaign.created", "blast.rescheduled" */
  action: string;
  /** Entity kind, must exist in FIELD_ALLOWLIST for diff to be captured */
  entityType: keyof typeof FIELD_ALLOWLIST | string;
  entityId?: string | null;
  /** Human-readable one-liner shown in the list view */
  summary: string;
  /** Previous state (for updates/deletes) */
  before?: Record<string, unknown> | null;
  /** New state (for creates/updates) */
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit write. Never throws — audit failures must not break
 * the user-facing action.
 */
export async function recordAudit(opts: RecordAuditOptions): Promise<void> {
  try {
    if (!opts.organizationId || !opts.action || !opts.summary) return;

    const filteredBefore = filterAllowed(opts.entityType, opts.before);
    const filteredAfter = filterAllowed(opts.entityType, opts.after);

    let diff: Record<string, unknown> | null = null;
    const hasBefore = opts.before != null;
    const hasAfter = opts.after != null;

    if (hasBefore && hasAfter) {
      // Update: only record fields that actually changed
      const changedBefore: Record<string, unknown> = {};
      const changedAfter: Record<string, unknown> = {};
      const keys = new Set([
        ...Object.keys(filteredBefore),
        ...Object.keys(filteredAfter),
      ]);
      for (const k of keys) {
        if (!shallowEqual(filteredBefore[k], filteredAfter[k])) {
          changedBefore[k] = filteredBefore[k] ?? null;
          changedAfter[k] = filteredAfter[k] ?? null;
        }
      }
      if (Object.keys(changedAfter).length === 0) {
        // No-op update; skip writing entirely
        return;
      }
      diff = { before: changedBefore, after: changedAfter };
    } else if (hasAfter) {
      diff = { after: filteredAfter };
    } else if (hasBefore) {
      diff = { before: filteredBefore };
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('admin_audit_logs').insert({
      organization_id: opts.organizationId,
      actor_user_id: user?.id ?? null,
      action: opts.action,
      entity_type: opts.entityType as string,
      entity_id: opts.entityId ?? null,
      summary: capSummary(opts.summary),
      diff: diff as never,
      metadata: (opts.metadata ?? {}) as never,
    } as never);

    if (error) {
      console.error('[audit] insert failed', {
        code: error.code,
        message: error.message,
        details: error.details,
        action: opts.action,
        entityType: opts.entityType,
      });
    }
  } catch (err) {
    // Audit must never break the calling flow
    console.error('[audit] recordAudit threw', err);
  }
}

