// Incremental pull of HubSpot companies into crm_organizations.
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
  "name", "domain", "industry", "phone", "address", "city", "state", "zip",
  "hubspot_owner_id", "lifecyclestage", "description", "numberofemployees",
  "hs_lastmodifieddate",
];

function composeAddress(p: any): string | null {
  const parts = [p.address, p.city, p.state, p.zip].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const result = await runPull(admin, "companies", async (since) => {
      const { results, lastModified } = await hsSearchSince("companies", PROPS, since);
      if (!results.length) return { processed: 0, lastModified };

      // Skip rows with pending outbox writes
      const pending = await getPendingEntityIds(admin, "company");

      // Map HubSpot owner IDs -> local profile IDs
      const ownerHsIds = Array.from(
        new Set(
          results
            .map((r: any) => r.properties?.hubspot_owner_id)
            .filter(Boolean)
            .map(String),
        ),
      );
      const { data: owners } = await admin
        .from("crm_owners")
        .select("id,hubspot_owner_id,profile_id")
        .in("hubspot_owner_id", ownerHsIds.length ? ownerHsIds : [""]);
      const ownerMap = new Map(
        (owners ?? []).map((o: any) => [o.hubspot_owner_id, o.profile_id]),
      );
      const ownerRowIdMap = new Map(
        (owners ?? []).map((o: any) => [o.hubspot_owner_id, o.id]),
      );

      const rows = results
        .filter((r: any) => !pending.has(String(r.id)))
        .map((r: any) => {
          const p = r.properties || {};
          return {
            hubspot_id: String(r.id),
            name: p.name || "(unnamed)",
            website: p.domain ?? null,
            industry: p.industry ?? null,
            phone: p.phone ?? null,
            address: composeAddress(p),
            owner_user_id: p.hubspot_owner_id ? ownerMap.get(String(p.hubspot_owner_id)) ?? null : null,
            crm_owner_id: p.hubspot_owner_id ? ownerRowIdMap.get(String(p.hubspot_owner_id)) ?? null : null,
            source: "hubspot",
            hs_updated_at: p.hs_lastmodifieddate ?? null,
            hs_archived: !!r.archived,
            sync_status: "synced",
            sync_error: null,
            updated_at: new Date().toISOString(),
          };
        });

      let processed = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const slice = rows.slice(i, i + 100);
        const { error } = await admin
          .from("crm_organizations")
          .upsert(slice, { onConflict: "hubspot_id" });
        if (error) throw error;
        processed += slice.length;
      }
      return { processed, lastModified };
    });
    return json({ ok: !result.error, ...result });
  } catch (e: any) {
    await logSync(admin, {
      direction: "pull",
      entity_type: "companies",
      status: "error",
      error: e?.message ?? String(e),
    });
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
