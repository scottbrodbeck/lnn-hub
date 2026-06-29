// Maps local CRM rows → HubSpot property payloads for the outbox push.
// Stage IDs require a stage->hubspot_id lookup; callers pass `stageHubspotId` if available.

export type HsProperties = Record<string, string | number | null>;

export function mapDealToHs(
  row: any,
  opts: {
    stageHubspotId?: string | null;
    pipelineHubspotId?: string | null;
    ownerHubspotId?: string | null;
    /** When true, include the owner property even if it's null (used to clear the owner). */
    includeOwner?: boolean;
  } = {},
): HsProperties {
  const props: HsProperties = {
    dealname: row.title ?? null,
    amount: row.value != null ? String(row.value) : null,
    closedate: row.expected_close_date
      ? new Date(row.expected_close_date).toISOString()
      : null,
    description: row.notes ?? null,
  };
  if (opts.pipelineHubspotId) props.pipeline = opts.pipelineHubspotId;
  if (opts.stageHubspotId) props.dealstage = opts.stageHubspotId;
  if (opts.includeOwner) {
    // Empty string clears the owner in HubSpot; a value sets it.
    props.hubspot_owner_id = opts.ownerHubspotId ?? '';
  }
  // Strip nulls so we don't blank fields the user didn't touch (owner handled above).
  return Object.fromEntries(
    Object.entries(props).filter(([k, v]) => k === 'hubspot_owner_id' || (v !== null && v !== undefined)),
  ) as HsProperties;
}

export function mapContactToHs(row: any): HsProperties {
  const props: HsProperties = {
    firstname: row.first_name ?? null,
    lastname: row.last_name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    jobtitle: row.title ?? null,
  };
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined)) as HsProperties;
}

export function mapOrgToHs(row: any): HsProperties {
  const props: HsProperties = {
    name: row.name ?? null,
    domain: row.website ?? null,
    industry: row.industry ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    description: row.notes ?? null,
  };
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined)) as HsProperties;
}

export function mapNoteToHs(row: any): HsProperties {
  return {
    hs_note_body: row.body ?? row.body_html ?? row.subject ?? "",
    hs_timestamp: new Date().toISOString(),
  };
}

export function mapTaskToHs(row: any): HsProperties {
  const props: HsProperties = {
    hs_task_subject: row.subject ?? "(no subject)",
    hs_task_body: row.body ?? null,
    hs_task_status: row.completed_at ? "COMPLETED" : "NOT_STARTED",
    hs_timestamp: row.due_at
      ? new Date(row.due_at).toISOString()
      : new Date().toISOString(),
  };
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== null && v !== undefined)) as HsProperties;
}
