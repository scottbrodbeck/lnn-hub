// Pull HubSpot owners and auto-map by email to local profiles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, hsListAll, json, logSync, runPull } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const result = await runPull(admin, "owners", async () => {
      const owners = await hsListAll("/crm/v3/owners?limit=100");
      if (!owners.length) return { processed: 0, lastModified: null };

      // Build email -> profile_id map
      const emails = owners.map((o: any) => (o.email || "").toLowerCase()).filter(Boolean);
      const { data: profiles } = await admin
        .from("profiles")
        .select("id,email")
        .in("email", emails.length ? emails : [""]);
      const profileByEmail = new Map(
        (profiles ?? []).map((p: any) => [(p.email || "").toLowerCase(), p.id]),
      );

      // Get existing rows so we don't overwrite manual mappings
      const ownerIds = owners.map((o: any) => String(o.id));
      const { data: existing } = await admin
        .from("crm_owners")
        .select("hubspot_owner_id,match_method,profile_id")
        .in("hubspot_owner_id", ownerIds);
      const existingByHs = new Map((existing ?? []).map((r: any) => [r.hubspot_owner_id, r]));

      const rows = owners.map((o: any) => {
        const email = (o.email || "").toLowerCase() || null;
        const ex = existingByHs.get(String(o.id));
        const isManual = ex?.match_method === "manual";
        const autoMatch = email ? profileByEmail.get(email) ?? null : null;
        return {
          hubspot_owner_id: String(o.id),
          email,
          first_name: o.firstName ?? null,
          last_name: o.lastName ?? null,
          full_name: [o.firstName, o.lastName].filter(Boolean).join(" ") || email,
          archived: !!o.archived,
          profile_id: isManual ? ex.profile_id : autoMatch,
          match_method: isManual
            ? "manual"
            : autoMatch
              ? "email_auto"
              : "unmatched",
          hs_updated_at: o.updatedAt ?? null,
        };
      });

      // Upsert in batches of 100
      let processed = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const slice = rows.slice(i, i + 100);
        const { error } = await admin
          .from("crm_owners")
          .upsert(slice, { onConflict: "hubspot_owner_id" });
        if (error) throw error;
        processed += slice.length;
      }
      return { processed, lastModified: new Date().toISOString() };
    });
    return json({ ok: !result.error, ...result });
  } catch (e: any) {
    await logSync(admin, {
      direction: "pull",
      entity_type: "owners",
      status: "error",
      error: e?.message ?? String(e),
    });
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
