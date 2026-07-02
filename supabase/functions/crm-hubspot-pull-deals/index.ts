// Incremental pull of HubSpot deals into crm_deals.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  corsHeaders,
  getPendingEntityIds,
  hsSearchSince,
  json,
  logSync,
  runPull,
} from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROPS = [
  "dealname", "amount", "pipeline", "dealstage", "closedate",
  "hubspot_owner_id", "dealtype", "description",
  "hs_lastmodifieddate", "hs_is_closed_won", "hs_is_closed_lost",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const result = await runPull(admin, "deals", async (since) => {
      const { results, lastModified } = await hsSearchSince(
        "deals", PROPS, since, ["companies", "contacts"], 200, admin,
      );
      if (!results.length) return { processed: 0, lastModified };

      const pending = await getPendingEntityIds(admin, "deal");

      const ownerIds = Array.from(new Set(
        results.map((r: any) => r.properties?.hubspot_owner_id).filter(Boolean).map(String),
      ));
      const { data: owners } = await admin
        .from("crm_owners")
        .select("hubspot_owner_id,profile_id")
        .in("hubspot_owner_id", ownerIds.length ? ownerIds : [""]);
      const ownerMap = new Map((owners ?? []).map((o: any) => [o.hubspot_owner_id, o.profile_id]));

      // Pipeline + stage lookups
      const pipelineHsIds = Array.from(new Set(results.map((r: any) => r.properties?.pipeline).filter(Boolean)));
      const stageHsIds = Array.from(new Set(results.map((r: any) => r.properties?.dealstage).filter(Boolean)));
      const { data: pipelines } = await admin
        .from("crm_pipelines").select("id,hubspot_id")
        .in("hubspot_id", pipelineHsIds.length ? pipelineHsIds : [""]);
      const { data: stages } = await admin
        .from("crm_pipeline_stages").select("id,hubspot_id")
        .in("hubspot_id", stageHsIds.length ? stageHsIds : [""]);
      const pipelineMap = new Map((pipelines ?? []).map((p: any) => [p.hubspot_id, p.id]));
      const stageMap = new Map((stages ?? []).map((s: any) => [s.hubspot_id, s.id]));

      // Default pipeline fallback
      const { data: defaultPipeline } = await admin
        .from("crm_pipelines").select("id").eq("is_default", true).maybeSingle();

      // Companies + contacts
      const companyHsIds = Array.from(new Set(results.flatMap((r: any) => r._associations?.companies ?? [])));
      const contactHsIds = Array.from(new Set(results.flatMap((r: any) => r._associations?.contacts ?? [])));
      const { data: orgs } = await admin
        .from("crm_organizations").select("id,hubspot_id")
        .in("hubspot_id", companyHsIds.length ? companyHsIds : [""]);
      const { data: contacts } = await admin
        .from("crm_contacts").select("id,hubspot_id")
        .in("hubspot_id", contactHsIds.length ? contactHsIds : [""]);
      const orgMap = new Map((orgs ?? []).map((o: any) => [o.hubspot_id, o.id]));
      const contactMap = new Map((contacts ?? []).map((c: any) => [c.hubspot_id, c.id]));

      const rows: any[] = [];
      let earliestSkipped: string | null = null;
      for (const r of results) {
        if (pending.has(String(r.id))) continue;
        const p = r.properties || {};
        const pipelineId = pipelineMap.get(p.pipeline) ?? defaultPipeline?.id;
        const stageId = stageMap.get(p.dealstage);
        if (!pipelineId || !stageId) {
          // Pipeline/stage not synced yet. Record the timestamp so we can hold the
          // watermark before this deal — otherwise it advances past and the deal is
          // never re-pulled (until an unrelated future edit bumps its modified date).
          const lm = p.hs_lastmodifieddate;
          if (lm && (!earliestSkipped || new Date(lm).getTime() < new Date(earliestSkipped).getTime())) {
            earliestSkipped = lm;
          }
          continue;
        }

        const isWon = p.hs_is_closed_won === "true" || p.hs_is_closed_won === true;
        const isLost = p.hs_is_closed_lost === "true" || p.hs_is_closed_lost === true;
        const status = isWon ? "won" : isLost ? "lost" : "open";

        rows.push({
          hubspot_id: String(r.id),
          title: p.dealname || "(untitled)",
          value: parseFloat(p.amount || "0") || 0,
          pipeline_id: pipelineId,
          stage_id: stageId,
          status,
          won_at: isWon ? (p.closedate ?? new Date().toISOString()) : null,
          lost_at: isLost ? (p.closedate ?? new Date().toISOString()) : null,
          expected_close_date: p.closedate?.split("T")[0] ?? null,
          owner_user_id: p.hubspot_owner_id ? ownerMap.get(String(p.hubspot_owner_id)) ?? null : null,
          crm_organization_id: r._associations?.companies?.[0]
            ? orgMap.get(r._associations.companies[0]) ?? null
            : null,
          primary_contact_id: r._associations?.contacts?.[0]
            ? contactMap.get(r._associations.contacts[0]) ?? null
            : null,
          source: "hubspot",
          notes: p.description ?? null,
          hs_updated_at: p.hs_lastmodifieddate ?? null,
          hs_archived: !!r.archived,
          sync_status: "synced",
          sync_error: null,
          updated_at: new Date().toISOString(),
        });
      }

      let processed = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const slice = rows.slice(i, i + 100);
        const { error } = await admin
          .from("crm_deals")
          .upsert(slice, { onConflict: "hubspot_id" });
        if (error) throw error;
        processed += slice.length;
      }
      // If any deals were skipped for unsynced pipeline/stage, hold the watermark
      // just before the earliest skipped deal so they retry once pipelines/stages
      // sync (pipelines pull only ~every 30 min). Safe: re-pulled deals upsert-dedupe.
      let effectiveLastModified = lastModified;
      if (earliestSkipped) {
        const clampMs = new Date(earliestSkipped).getTime() - 1;
        if (!effectiveLastModified || clampMs < new Date(effectiveLastModified).getTime()) {
          effectiveLastModified = new Date(clampMs).toISOString();
        }
        console.warn(`[pull-deals] held watermark before an unsynced-pipeline deal (${earliestSkipped})`);
      }
      return { processed, lastModified: effectiveLastModified };
    });
    return json({ ok: !result.error, ...result });
  } catch (e: any) {
    await logSync(admin, {
      direction: "pull",
      entity_type: "deals",
      status: "error",
      error: e?.message ?? String(e),
    });
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
