// Read-only sync status check for HubSpot pull workers.
// Reports per-object: watermark, last run time/status, records_processed,
// current local row count, and whether new rows were inserted since the
// previous status check (delta tracked via crm_settings:sync_status_snapshot).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, json } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Map sync_state object_type -> local table name.
const OBJECT_TABLES: Record<string, string> = {
  contacts: "crm_contacts",
  companies: "crm_organizations",
  deals: "crm_deals",
  owners: "crm_owners",
};

const SNAPSHOT_KEY = "sync_status_snapshot";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Optional ?object=contacts filter; default to all known objects.
    const url = new URL(req.url);
    const filterObj = url.searchParams.get("object");
    const persist = url.searchParams.get("persist") !== "false"; // default true
    const objects = filterObj
      ? [filterObj]
      : Object.keys(OBJECT_TABLES);

    // Load all sync_state rows in one query.
    const { data: stateRows, error: stateErr } = await admin
      .from("crm_sync_state")
      .select("object_type,last_modified_watermark,last_run_at,last_run_status,last_error,records_processed,pull_mode,pull_cursor,backfill_started_at,backfill_completed_at")
      .in("object_type", objects);
    if (stateErr) throw stateErr;
    const stateMap = new Map((stateRows ?? []).map((r: any) => [r.object_type, r]));

    // Load previous snapshot for delta computation.
    const { data: snapRow } = await admin
      .from("crm_settings")
      .select("value")
      .eq("key", SNAPSHOT_KEY)
      .maybeSingle();
    const prevSnapshot: Record<string, { count: number; checked_at: string }> =
      (snapRow?.value && typeof snapRow.value === "object") ? snapRow.value as any : {};

    const results: any[] = [];
    const newSnapshot: Record<string, { count: number; checked_at: string }> = { ...prevSnapshot };
    const nowIso = new Date().toISOString();

    for (const obj of objects) {
      const table = OBJECT_TABLES[obj];
      let count: number | null = null;
      if (table) {
        const { count: c, error: cErr } = await admin
          .from(table)
          .select("*", { count: "exact", head: true });
        if (cErr) {
          results.push({ object_type: obj, error: cErr.message });
          continue;
        }
        count = c ?? 0;
      }

      const state = stateMap.get(obj) || {};
      const prev = prevSnapshot[obj];
      const inserted_since_previous_check = prev && count !== null
        ? count - prev.count
        : null;

      results.push({
        object_type: obj,
        local_count: count,
        watermark: state.last_modified_watermark ?? null,
        last_run_at: state.last_run_at ?? null,
        last_run_status: state.last_run_status ?? null,
        last_error: state.last_error ?? null,
        records_processed_last_run: state.records_processed ?? null,
        pull_mode: state.pull_mode ?? "incremental",
        pull_cursor: state.pull_cursor ? String(state.pull_cursor).slice(0, 32) : null,
        backfill_started_at: state.backfill_started_at ?? null,
        backfill_completed_at: state.backfill_completed_at ?? null,
        previous_check: prev ?? null,
        inserted_since_previous_check,
        new_records_since_previous_check:
          inserted_since_previous_check !== null && inserted_since_previous_check > 0,
      });

      if (count !== null) {
        newSnapshot[obj] = { count, checked_at: nowIso };
      }
    }

    if (persist) {
      await admin
        .from("crm_settings")
        .upsert(
          { key: SNAPSHOT_KEY, value: newSnapshot, updated_at: nowIso },
          { onConflict: "key" },
        );
    }

    return json({ ok: true, checked_at: nowIso, results });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
