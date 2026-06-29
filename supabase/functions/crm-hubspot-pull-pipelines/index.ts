// Pull HubSpot deal pipelines + stages into crm_pipelines / crm_pipeline_stages.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, hsFetch, json, logSync, runPull } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const result = await runPull(admin, "pipelines", async () => {
      const data = await hsFetch<any>("/crm/v3/pipelines/deals");
      const pipelines = data.results || [];
      let processed = 0;

      for (const p of pipelines) {
        // Upsert pipeline by hubspot_id
        const { data: existing } = await admin
          .from("crm_pipelines")
          .select("id")
          .eq("hubspot_id", String(p.id))
          .maybeSingle();

        let pipelineId = existing?.id;
        if (!pipelineId) {
          const { data: created, error } = await admin
            .from("crm_pipelines")
            .insert({
              name: p.label,
              hubspot_id: String(p.id),
              sort_order: p.displayOrder ?? 0,
              is_default: !!p.default,
              hs_updated_at: p.updatedAt ?? null,
              hs_archived: !!p.archived,
            })
            .select("id")
            .single();
          if (error) throw error;
          pipelineId = created.id;
        } else {
          await admin
            .from("crm_pipelines")
            .update({
              name: p.label,
              sort_order: p.displayOrder ?? 0,
              hs_updated_at: p.updatedAt ?? null,
              hs_archived: !!p.archived,
            })
            .eq("id", pipelineId);
        }

        // Upsert stages
        for (const s of p.stages || []) {
          // HubSpot returns metadata fields as strings ("true"/"false", "1.0"/"0.0").
          // The naive `!!s.metadata?.isClosed` is true for the string "false" too, which
          // previously caused every open stage to be flagged as `is_lost`.
          const rawClosed = s.metadata?.isClosed;
          const isClosed = rawClosed === true ||
            (typeof rawClosed === "string" && rawClosed.toLowerCase() === "true");
          const winProb = parseFloat(s.metadata?.probability ?? "0") || 0;
          const isWon = isClosed && winProb >= 1;
          const isLost = isClosed && !isWon;

          const { data: stageEx } = await admin
            .from("crm_pipeline_stages")
            .select("id")
            .eq("hubspot_id", String(s.id))
            .maybeSingle();

          if (stageEx?.id) {
            await admin
              .from("crm_pipeline_stages")
              .update({
                pipeline_id: pipelineId,
                name: s.label,
                sort_order: s.displayOrder ?? 0,
                win_probability: winProb,
                is_won: isWon,
                is_lost: isLost,
                hs_updated_at: s.updatedAt ?? null,
                hs_archived: !!s.archived,
              })
              .eq("id", stageEx.id);
          } else {
            await admin.from("crm_pipeline_stages").insert({
              pipeline_id: pipelineId,
              hubspot_id: String(s.id),
              name: s.label,
              sort_order: s.displayOrder ?? 0,
              win_probability: winProb,
              is_won: isWon,
              is_lost: isLost,
              hs_updated_at: s.updatedAt ?? null,
              hs_archived: !!s.archived,
            });
          }
        }
        processed++;
      }
      return { processed, lastModified: new Date().toISOString() };
    });
    return json({ ok: !result.error, ...result });
  } catch (e: any) {
    await logSync(admin, {
      direction: "pull",
      entity_type: "pipelines",
      status: "error",
      error: e?.message ?? String(e),
    });
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
