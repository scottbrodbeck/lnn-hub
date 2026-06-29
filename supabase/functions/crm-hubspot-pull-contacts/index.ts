// Incremental + cursor-backfill pull of HubSpot contacts into crm_contacts.
//
// Two modes (tracked in crm_sync_state.pull_mode):
//   * incremental (default): Search API filtered by hs_lastmodifieddate >= watermark.
//     Fast and cheap, but capped at 10,000 results per query by HubSpot.
//   * backfill: List API with cursor pagination. No 10K cap, walks the entire
//     contact set. Used to recover from "stuck on first page" / 10K-cap states.
//
// Operator triggers:
//   POST ?mode=backfill&restart=true  → start a fresh backfill from page 1.
//   POST ?mode=backfill               → continue a backfill in progress.
//   POST                              → respect persisted pull_mode (default).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  corsHeaders,
  getPendingEntityIds,
  hsListPage,
  hsSearchSince,
  json,
  logSync,
  runPull,
} from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROPS = [
  "firstname", "lastname", "email", "phone", "jobtitle",
  "hubspot_owner_id", "lastmodifieddate", "hs_lastmodifieddate",
];

// How many list pages (×100 contacts) to fetch per backfill invocation.
// Keeps each run inside edge-function CPU/time budget.
const BACKFILL_PAGES_PER_RUN = 20;

async function loadOwnerMap(admin: any, ownerIds: string[]) {
  const { data: owners } = await admin
    .from("crm_owners")
    .select("hubspot_owner_id,profile_id")
    .in("hubspot_owner_id", ownerIds.length ? ownerIds : [""]);
  return new Map((owners ?? []).map((o: any) => [o.hubspot_owner_id, o.profile_id]));
}

async function loadOrgMap(admin: any, companyHsIds: string[]) {
  const { data: orgs } = await admin
    .from("crm_organizations")
    .select("id,hubspot_id")
    .in("hubspot_id", companyHsIds.length ? companyHsIds : [""]);
  return new Map((orgs ?? []).map((o: any) => [o.hubspot_id, o.id]));
}

function mapContactRow(r: any, ownerMap: Map<string, any>, orgMap: Map<string, any>) {
  const p = r.properties || {};
  const companyHsId = r._associations?.companies?.[0];
  return {
    hubspot_id: String(r.id),
    first_name: p.firstname ?? null,
    last_name: p.lastname ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    title: p.jobtitle ?? null,
    crm_organization_id: companyHsId ? orgMap.get(companyHsId) ?? null : null,
    owner_user_id: p.hubspot_owner_id ? ownerMap.get(String(p.hubspot_owner_id)) ?? null : null,
    hs_updated_at: p.lastmodifieddate ?? p.hs_lastmodifieddate ?? null,
    hs_archived: !!r.archived,
    sync_status: "synced",
    sync_error: null,
    updated_at: new Date().toISOString(),
  };
}

async function upsertContacts(admin: any, results: any[]) {
  if (!results.length) return 0;
  const pending = await getPendingEntityIds(admin, "contact");
  const ownerIds = Array.from(new Set(
    results.map((r: any) => r.properties?.hubspot_owner_id).filter(Boolean).map(String),
  ));
  const companyHsIds = Array.from(new Set(
    results.flatMap((r: any) => r._associations?.companies ?? []),
  ));
  const [ownerMap, orgMap] = await Promise.all([
    loadOwnerMap(admin, ownerIds),
    loadOrgMap(admin, companyHsIds),
  ]);
  const rows = results
    .filter((r: any) => !pending.has(String(r.id)))
    .map((r: any) => mapContactRow(r, ownerMap, orgMap));

  let processed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100);
    const { error } = await admin
      .from("crm_contacts")
      .upsert(slice, { onConflict: "hubspot_id" });
    if (error) throw error;
    processed += slice.length;
  }
  return processed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const requestedMode = url.searchParams.get("mode");
  const restart = url.searchParams.get("restart") === "true";

  try {
    // Load existing sync state to determine effective mode + cursor.
    const { data: stateRow } = await admin
      .from("crm_sync_state")
      .select("pull_mode,pull_cursor,backfill_started_at")
      .eq("object_type", "contacts")
      .maybeSingle();

    let mode: "incremental" | "backfill" =
      (requestedMode === "backfill" || stateRow?.pull_mode === "backfill")
        ? "backfill"
        : "incremental";

    let cursor: string | null = restart ? null : (stateRow?.pull_cursor ?? null);

    // Operator-triggered backfill restart: clear state up front.
    if (mode === "backfill" && (requestedMode === "backfill" || restart) &&
        (restart || stateRow?.pull_mode !== "backfill")) {
      await admin
        .from("crm_sync_state")
        .upsert(
          {
            object_type: "contacts",
            pull_mode: "backfill",
            pull_cursor: null,
            backfill_started_at: new Date().toISOString(),
            backfill_completed_at: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "object_type" },
        );
      cursor = null;
    }

    // ---------------- Backfill mode ----------------
    if (mode === "backfill") {
      const start = Date.now();
      let totalProcessed = 0;
      let pagesFetched = 0;
      let nextAfter: string | null = cursor;
      let exhausted = false;

      try {
        for (let i = 0; i < BACKFILL_PAGES_PER_RUN; i++) {
          const { results, nextAfter: na } = await hsListPage(
            "contacts",
            PROPS,
            ["companies"],
            nextAfter ?? undefined,
            100,
          );
          pagesFetched++;
          totalProcessed += await upsertContacts(admin, results);
          nextAfter = na;
          // Persist cursor after each page so a crash mid-run resumes cleanly.
          await admin
            .from("crm_sync_state")
            .upsert(
              {
                object_type: "contacts",
                pull_mode: "backfill",
                pull_cursor: nextAfter,
                last_run_at: new Date().toISOString(),
                last_run_status: "ok",
                last_error: null,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "object_type" },
            );
          if (!nextAfter) {
            exhausted = true;
            break;
          }
        }
      } catch (e: any) {
        const msg = e?.message || String(e);
        await admin
          .from("crm_sync_state")
          .upsert(
            {
              object_type: "contacts",
              last_run_at: new Date().toISOString(),
              last_run_status: "error",
              last_error: msg,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "object_type" },
          );
        await logSync(admin, {
          direction: "pull",
          entity_type: "contacts",
          op: "backfill",
          status: "error",
          records_processed: totalProcessed,
          latency_ms: Date.now() - start,
          error: msg,
        });
        return json({ ok: false, mode: "backfill", processed: totalProcessed, error: msg }, 500);
      }

      // Cursor exhausted → flip back to incremental, snap watermark to now.
      if (exhausted) {
        await admin
          .from("crm_sync_state")
          .upsert(
            {
              object_type: "contacts",
              pull_mode: "incremental",
              pull_cursor: null,
              backfill_completed_at: new Date().toISOString(),
              last_modified_watermark: new Date().toISOString(),
              last_run_at: new Date().toISOString(),
              last_run_status: "ok",
              last_error: null,
              records_processed: totalProcessed,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "object_type" },
          );
      }

      await logSync(admin, {
        direction: "pull",
        entity_type: "contacts",
        op: exhausted ? "backfill:complete" : "backfill:page",
        status: "ok",
        records_processed: totalProcessed,
        latency_ms: Date.now() - start,
      });

      return json({
        ok: true,
        mode: "backfill",
        pages_fetched: pagesFetched,
        processed: totalProcessed,
        cursor: nextAfter,
        backfill_complete: exhausted,
      });
    }

    // ---------------- Incremental mode ----------------
    const result = await runPull(admin, "contacts", async (since) => {
      const { results, lastModified } = await hsSearchSince(
        "contacts", PROPS, since, ["companies"], 200, admin, "hs_lastmodifieddate",
      );
      if (!results.length) return { processed: 0, lastModified };
      const processed = await upsertContacts(admin, results);
      return { processed, lastModified };
    });
    return json({ ok: !result.error, mode: "incremental", ...result });
  } catch (e: any) {
    await logSync(admin, {
      direction: "pull",
      entity_type: "contacts",
      status: "error",
      error: e?.message ?? String(e),
    });
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
