// Cleanup cold engagement bodies: clears body_html/body_text on activities
// where body_fetched_at < 90 days ago. Lazy fetch will repopulate on demand.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, json, logSync } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const start = Date.now();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Update in pages to keep payloads small.
    let totalCleared = 0;
    for (let page = 0; page < 50; page++) {
      const { data: ids, error: selErr } = await admin
        .from("crm_activities")
        .select("id")
        .lt("body_fetched_at", cutoff)
        .or("body_html.not.is.null,body_text.not.is.null")
        .limit(500);
      if (selErr) throw selErr;
      if (!ids || ids.length === 0) break;
      const { error: updErr } = await admin
        .from("crm_activities")
        .update({
          body_html: null,
          body_text: null,
          body_fetched_at: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", ids.map((r: any) => r.id));
      if (updErr) throw updErr;
      totalCleared += ids.length;
      if (ids.length < 500) break;
    }

    await logSync(admin, {
      direction: "pull",
      entity_type: "engagement_body_cleanup",
      status: "ok",
      records_processed: totalCleared,
      latency_ms: Date.now() - start,
      detail: { cutoff },
    });
    return json({ ok: true, cleared: totalCleared, cutoff });
  } catch (e: any) {
    await logSync(admin, {
      direction: "pull",
      entity_type: "engagement_body_cleanup",
      status: "error",
      latency_ms: Date.now() - start,
      error: e?.message ?? String(e),
    });
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
