// Incremental pull of HubSpot engagements (notes, emails, calls, meetings, tasks).
// Stores metadata only — body content is fetched lazily by crm-hubspot-engagement-body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  corsHeaders,
  hsSearchSince,
  json,
  logSync,
  runPull,
} from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Per HubSpot Engagements API: each engagement is its own object.
// We pull metadata + a short subject; bodies fetched on demand.
const ENGAGEMENT_TYPES: Record<string, {
  hsObject: string;
  type: "note" | "email" | "call" | "meeting" | "task";
  props: string[];
  subjectFrom: (p: any) => string;
  directionFrom?: (p: any) => string | null;
  timestampFrom: (p: any) => string | null;
}> = {
  notes: {
    hsObject: "notes",
    type: "note",
    props: ["hs_note_body", "hs_timestamp", "hubspot_owner_id", "hs_lastmodifieddate"],
    subjectFrom: (p) => stripHtml(p.hs_note_body || "").slice(0, 120) || "Note",
    timestampFrom: (p) => p.hs_timestamp ?? null,
  },
  emails: {
    hsObject: "emails",
    type: "email",
    props: [
      "hs_email_subject", "hs_email_direction", "hs_email_status",
      "hs_email_from_email", "hs_email_to_email",
      "hs_timestamp", "hubspot_owner_id", "hs_lastmodifieddate",
    ],
    subjectFrom: (p) => p.hs_email_subject || "(no subject)",
    directionFrom: (p) => {
      const d = (p.hs_email_direction || "").toUpperCase();
      // HubSpot values: EMAIL (sent), INCOMING_EMAIL, FORWARDED_EMAIL.
      if (d.includes("INCOMING")) return "incoming";
      if (d === "EMAIL" || d.includes("FORWARDED")) return "outgoing";
      return null;
    },
    timestampFrom: (p) => p.hs_timestamp ?? null,
  },
  calls: {
    hsObject: "calls",
    type: "call",
    props: [
      "hs_call_title", "hs_call_direction", "hs_call_duration",
      "hs_call_disposition", "hs_call_status",
      "hs_timestamp", "hubspot_owner_id", "hs_lastmodifieddate",
    ],
    subjectFrom: (p) => p.hs_call_title || "Call",
    directionFrom: (p) => {
      const d = (p.hs_call_direction || "").toUpperCase();
      if (d === "INBOUND") return "incoming";
      if (d === "OUTBOUND") return "outgoing";
      return null;
    },
    timestampFrom: (p) => p.hs_timestamp ?? null,
  },
  meetings: {
    hsObject: "meetings",
    type: "meeting",
    props: [
      "hs_meeting_title", "hs_meeting_start_time", "hs_meeting_end_time",
      "hs_timestamp", "hubspot_owner_id", "hs_lastmodifieddate",
    ],
    subjectFrom: (p) => p.hs_meeting_title || "Meeting",
    timestampFrom: (p) => p.hs_meeting_start_time ?? p.hs_timestamp ?? null,
  },
  tasks: {
    hsObject: "tasks",
    type: "task",
    props: [
      "hs_task_subject", "hs_task_status", "hs_task_priority", "hs_task_type",
      "hs_timestamp", "hubspot_owner_id", "hs_lastmodifieddate",
    ],
    subjectFrom: (p) => p.hs_task_subject || "Task",
    timestampFrom: (p) => p.hs_timestamp ?? null,
  },
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    let totalProcessed = 0;
    const perTypeResults: Record<string, any> = {};

    // Resolve owner map once (reused across types)
    const { data: ownersAll } = await admin
      .from("crm_owners").select("hubspot_owner_id,profile_id");
    const ownerMap = new Map((ownersAll ?? []).map((o: any) => [o.hubspot_owner_id, o.profile_id]));

    for (const [key, cfg] of Object.entries(ENGAGEMENT_TYPES)) {
      const stateKey = `engagements_${key}`;
      const result = await runPull(admin, stateKey, async (since) => {
        const { results, lastModified } = await hsSearchSince(
          cfg.hsObject, cfg.props, since,
          ["companies", "contacts", "deals"], 200, admin,
        );
        if (!results.length) return { processed: 0, lastModified };

        // Lookup associated entities
        const companyHsIds = Array.from(new Set(results.flatMap((r: any) => r._associations?.companies ?? [])));
        const contactHsIds = Array.from(new Set(results.flatMap((r: any) => r._associations?.contacts ?? [])));
        const dealHsIds = Array.from(new Set(results.flatMap((r: any) => r._associations?.deals ?? [])));

        const [orgsRes, contactsRes, dealsRes] = await Promise.all([
          admin.from("crm_organizations").select("id,hubspot_id").in("hubspot_id", companyHsIds.length ? companyHsIds : [""]),
          admin.from("crm_contacts").select("id,hubspot_id").in("hubspot_id", contactHsIds.length ? contactHsIds : [""]),
          admin.from("crm_deals").select("id,hubspot_id").in("hubspot_id", dealHsIds.length ? dealHsIds : [""]),
        ]);
        const orgMap = new Map((orgsRes.data ?? []).map((o: any) => [o.hubspot_id, o.id]));
        const contactMap = new Map((contactsRes.data ?? []).map((c: any) => [c.hubspot_id, c.id]));
        const dealMap = new Map((dealsRes.data ?? []).map((d: any) => [d.hubspot_id, d.id]));

        const rows = results.map((r: any) => {
          const p = r.properties || {};
          const orgHs = r._associations?.companies?.[0];
          const contactHs = r._associations?.contacts?.[0];
          const dealHs = r._associations?.deals?.[0];
          const subject = cfg.subjectFrom(p);
          const direction = cfg.directionFrom?.(p) ?? null;
          const ts = cfg.timestampFrom(p);

          const metadata: Record<string, any> = {};
          // Snapshot type-specific meta
          for (const key of cfg.props) {
            if (p[key] != null && key !== "hs_timestamp" && key !== "hs_lastmodifieddate" && key !== "hubspot_owner_id") {
              metadata[key] = p[key];
            }
          }

          return {
            hubspot_id: String(r.id),
            type: cfg.type, // existing crm_activity_type enum: call|meeting|task|email|note
            engagement_type: cfg.type,
            subject,
            body: null,           // legacy column kept null; use body_text/body_html
            direction,
            owner_user_id: p.hubspot_owner_id ? ownerMap.get(String(p.hubspot_owner_id)) ?? null : null,
            crm_organization_id: orgHs ? orgMap.get(orgHs) ?? null : null,
            contact_id: contactHs ? contactMap.get(contactHs) ?? null : null,
            deal_id: dealHs ? dealMap.get(dealHs) ?? null : null,
            due_at: cfg.type === "task" ? ts : null,
            hs_timestamp: ts,
            hs_updated_at: p.hs_lastmodifieddate ?? null,
            hs_archived: !!r.archived,
            metadata,
            sync_status: "synced",
            sync_error: null,
            updated_at: new Date().toISOString(),
          };
        });

        let processed = 0;
        for (let i = 0; i < rows.length; i += 100) {
          const slice = rows.slice(i, i + 100);
          const { error } = await admin
            .from("crm_activities")
            .upsert(slice, { onConflict: "hubspot_id" });
          if (error) throw error;
          processed += slice.length;
        }
        return { processed, lastModified };
      });
      perTypeResults[key] = result;
      totalProcessed += result.processed;
    }
    return json({ ok: true, total: totalProcessed, byType: perTypeResults });
  } catch (e: any) {
    await logSync(admin, {
      direction: "pull",
      entity_type: "engagements",
      status: "error",
      error: e?.message ?? String(e),
    });
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
