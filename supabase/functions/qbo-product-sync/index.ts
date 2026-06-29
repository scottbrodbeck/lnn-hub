// QBO product sync edge function.
// Actions:
//   list-income-accounts → returns income accounts for setup
//   match               → fuzzy-match unlinked crm_products to QBO items, return suggestions
//   link                → link a crm_product to a qbo_item_id
//   unlink              → clear qbo_item_id from a crm_product
//   push                → create QBO items for sync_enabled products without qbo_item_id
//   update              → sparse-update QBO items where local product differs

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  qbo,
  qboQuery,
  escapeSqlString,
  normalizeName,
  assertQboConfigured,
} from "../_shared/qbo.ts";

const QBO_ENVIRONMENT = (Deno.env.get("QBO_ENVIRONMENT") ?? "production").toLowerCase();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authorize(req: Request, body: any): Promise<{ userId: string | null; isCron: boolean }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.slice("Bearer ".length).trim();
  // Service-role or explicit cron secret = cron
  const cronSecret = Deno.env.get("QBO_CRON_SECRET");
  if (token === SERVICE_ROLE_KEY || (cronSecret && token === cronSecret)) {
    return { userId: null, isCron: true };
  }
  // Anon-role JWT + body.source === 'cron' = cron (matches pg_cron pattern used elsewhere)
  if (token === ANON_KEY && body?.source === "cron") {
    return { userId: null, isCron: true };
  }
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error } = await sb.auth.getUser();
  if (error || !userData?.user) throw new Error("Unauthorized");
  const userId = userData.user.id;
  // Require CRM access (sales/admin/super_admin)
  const { data: hasAccess } = await admin().rpc("has_crm_access", { _user_id: userId });
  if (!hasAccess) throw new Error("Forbidden: CRM access required");
  return { userId, isCron: false };
}

async function isGlobalQboSyncEnabled(): Promise<boolean> {
  const { data } = await admin()
    .from("crm_settings")
    .select("value")
    .eq("key", "qbo_sync_globally_enabled")
    .maybeSingle();
  return data?.value === true;
}

async function startRun(kind: string, triggered_by = "manual"): Promise<string> {
  const { data, error } = await admin()
    .from("qbo_sync_runs")
    .insert({ kind, triggered_by, status: "running" })
    .select("id")
    .single();
  if (error) throw new Error(`run create failed: ${error.message}`);
  return data.id as string;
}

async function finishRun(id: string, patch: Record<string, unknown>) {
  await admin()
    .from("qbo_sync_runs")
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq("id", id);
}

// ───────────────────────────────────────────────────────────
// Action handlers
// ───────────────────────────────────────────────────────────

async function listIncomeAccounts() {
  const res = await qboQuery<{ Account?: any[] }>(
    `SELECT Id, Name, AccountType, AccountSubType, Active FROM Account WHERE AccountType = 'Income' MAXRESULTS 100`,
  );
  return { accounts: (res.Account ?? []).map((a) => ({ id: a.Id, name: a.Name, subType: a.AccountSubType })) };
}

async function fetchAllQboItems(): Promise<any[]> {
  const all: any[] = [];
  let start = 1;
  const page = 500;
  for (;;) {
    const res = await qboQuery<{ Item?: any[] }>(
      `SELECT Id, Name, FullyQualifiedName, Sku, UnitPrice, Description, Active, SyncToken, Type FROM Item WHERE Active = true STARTPOSITION ${start} MAXRESULTS ${page}`,
    );
    const batch = res.Item ?? [];
    all.push(...batch);
    if (batch.length < page) break;
    start += page;
  }
  return all;
}

async function matchAction() {
  const runId = await startRun("product_match");
  try {
    const items = await fetchAllQboItems();
    const sb = admin();
    const { data: products, error } = await sb
      .from("crm_products")
      .select("id, name, unit_price, qbo_item_id")
      .eq("is_active", true)
      .is("qbo_item_id", null);
    if (error) throw new Error(error.message);

    const itemsByNorm = new Map<string, any>();
    for (const it of items) {
      itemsByNorm.set(normalizeName(it.Name), it);
      if (it.FullyQualifiedName) itemsByNorm.set(normalizeName(it.FullyQualifiedName), it);
    }

    const exact: Array<{ product_id: string; product_name: string; qbo_item_id: string; qbo_name: string; qbo_price: number }> = [];
    const fuzzy: Array<{ product_id: string; product_name: string; suggestions: any[] }> = [];

    for (const p of products ?? []) {
      const norm = normalizeName(p.name);
      const hit = itemsByNorm.get(norm);
      if (hit) {
        exact.push({
          product_id: p.id,
          product_name: p.name,
          qbo_item_id: hit.Id,
          qbo_name: hit.Name,
          qbo_price: Number(hit.UnitPrice ?? 0),
        });
      } else {
        // Token-overlap fuzzy
        const tokens = new Set(norm.split(" ").filter((t) => t.length > 2));
        if (tokens.size === 0) continue;
        const scored = items
          .map((it) => {
            const itNorm = normalizeName(it.Name);
            const itTokens = new Set(itNorm.split(" "));
            let overlap = 0;
            for (const t of tokens) if (itTokens.has(t)) overlap++;
            return { it, score: overlap / tokens.size };
          })
          .filter((s) => s.score >= 0.6)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((s) => ({
            qbo_item_id: s.it.Id,
            qbo_name: s.it.Name,
            qbo_price: Number(s.it.UnitPrice ?? 0),
            score: Math.round(s.score * 100),
          }));
        if (scored.length) fuzzy.push({ product_id: p.id, product_name: p.name, suggestions: scored });
      }
    }

    await finishRun(runId, {
      status: "success",
      matched_count: exact.length,
      detail: { exact_count: exact.length, fuzzy_count: fuzzy.length, qbo_items: items.length },
    });

    return { exact, fuzzy, qbo_item_count: items.length };
  } catch (e: any) {
    await finishRun(runId, { status: "error", error: e.message });
    throw e;
  }
}

async function linkAction(body: { product_id: string; qbo_item_id: string }) {
  if (!body.product_id || !body.qbo_item_id) throw new Error("product_id and qbo_item_id required");
  // Fetch SyncToken so subsequent updates work
  const item = await qbo<{ Item: any }>(`/item/${body.qbo_item_id}`);
  const { error } = await admin()
    .from("crm_products")
    .update({
      qbo_item_id: body.qbo_item_id,
      qbo_item_name: item.Item.Name,
      qbo_sync_token: item.Item.SyncToken,
      qbo_synced_at: new Date().toISOString(),
      qbo_sync_error: null,
      qbo_environment: QBO_ENVIRONMENT,
    })
    .eq("id", body.product_id);
  if (error) throw new Error(error.message);
  return { ok: true, qbo_name: item.Item.Name, environment: QBO_ENVIRONMENT };
}

// Backfill qbo_item_name for already-linked products that are missing it.
// Uses the full QBO item list (already fetched by the panel) and writes
// the names back so future loads can render labels instantly from local data.
async function backfillQboNamesAction() {
  const db = admin();
  const { data: linked, error: e1 } = await db
    .from("crm_products")
    .select("id, qbo_item_id, qbo_item_name")
    .not("qbo_item_id", "is", null);
  if (e1) throw new Error(e1.message);

  const needing = (linked ?? []).filter((p: any) => !p.qbo_item_name);
  if (needing.length === 0) return { ok: true, updated: 0 };

  const items = await fetchAllQboItems();
  const byId = new Map<string, string>(items.map((it) => [String(it.Id), it.Name as string]));

  let updated = 0;
  for (const p of needing) {
    const name = byId.get(String(p.qbo_item_id));
    if (!name) continue;
    const { error } = await db
      .from("crm_products")
      .update({ qbo_item_name: name })
      .eq("id", p.id);
    if (!error) updated += 1;
  }
  return { ok: true, updated };
}

async function unlinkAction(body: { product_id: string }) {
  if (!body.product_id) throw new Error("product_id required");
  const { error } = await admin()
    .from("crm_products")
    .update({ qbo_item_id: null, qbo_sync_token: null, qbo_sync_error: null, qbo_environment: null })
    .eq("id", body.product_id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// List all active QBO items (for dropdown selection in the Product Sync panel)
async function listItemsAction() {
  const items = await fetchAllQboItems();
  return {
    environment: QBO_ENVIRONMENT,
    items: items.map((it) => ({
      id: String(it.Id),
      name: it.Name,
      fullyQualifiedName: it.FullyQualifiedName ?? null,
      sku: it.Sku ?? null,
      unitPrice: Number(it.UnitPrice ?? 0),
      type: it.Type ?? null,
    })),
  };
}

// Detect and optionally clear product links that were made under a different
// QBO environment than the one currently active (e.g. sandbox → production switch).
async function staleLinksAction(body: { clear?: boolean }) {
  const sb = admin();
  const { data: stale, error } = await sb
    .from("crm_products")
    .select("id, name, qbo_item_id, qbo_environment")
    .not("qbo_item_id", "is", null)
    .or(`qbo_environment.is.null,qbo_environment.neq.${QBO_ENVIRONMENT}`);
  if (error) throw new Error(error.message);

  if (body.clear && (stale ?? []).length > 0) {
    const ids = (stale ?? []).map((s) => s.id);
    const { error: clearErr } = await sb
      .from("crm_products")
      .update({
        qbo_item_id: null,
        qbo_sync_token: null,
        qbo_sync_error: null,
        qbo_environment: null,
        qbo_synced_at: null,
      })
      .in("id", ids);
    if (clearErr) throw new Error(clearErr.message);
    return { current_environment: QBO_ENVIRONMENT, cleared: ids.length, items: stale };
  }

  return {
    current_environment: QBO_ENVIRONMENT,
    cleared: 0,
    items: stale ?? [],
  };
}

async function getDefaultIncomeAccount(): Promise<{ id: string; name: string }> {
  const { data, error } = await admin()
    .from("crm_settings")
    .select("value")
    .eq("key", "qbo_settings")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const v = (data?.value ?? {}) as any;
  if (!v.default_income_account_id) {
    throw new Error("No default income account configured. Set one in Sales Settings → QuickBooks.");
  }
  return { id: v.default_income_account_id, name: v.default_income_account_name ?? "Income" };
}

// pushAction removed: items are now created in QBO only via explicit one-off
// linking, never as a blanket "push all unlinked" operation.

async function updateAction(body: { product_ids?: string[]; triggered_by?: string }) {
  const runId = await startRun("product_update", body.triggered_by ?? "manual");
  try {
    const sb = admin();

    // Global sync-fields mode (applies to all linked products)
    const { data: modeRow } = await sb
      .from("crm_settings")
      .select("value")
      .eq("key", "qbo_sync_fields_default")
      .maybeSingle();
    const globalMode =
      (typeof modeRow?.value === "string" ? modeRow.value : null) ?? "price";

    let q = sb
      .from("crm_products")
      .select("id, name, description, unit_price, qbo_item_id, qbo_sync_token")
      .not("qbo_item_id", "is", null);
    if (body.product_ids?.length) q = q.in("id", body.product_ids);
    const { data: products, error } = await q;
    if (error) throw new Error(error.message);

    let updated = 0;
    let unchanged = 0;
    let errors = 0;
    const results: any[] = [];

    for (const p of products ?? []) {
      try {
        const mode = globalMode;
        const syncName = mode === "price_name" || mode === "price_name_description";
        const syncDesc = mode === "price_name_description";

        // Always re-fetch to get current SyncToken + remote state
        const fresh = await qbo<{ Item: any }>(`/item/${p.qbo_item_id}`);
        const it = fresh.Item;
        const remotePrice = Number(it.UnitPrice ?? 0);
        const remoteName = it.Name ?? "";
        const remoteDesc = it.Description ?? "";
        const localName = p.name.slice(0, 100);
        const localDesc = p.description ?? "";
        const localPrice = Number(p.unit_price);

        const priceDiffers = remotePrice !== localPrice;
        const nameDiffers = syncName && remoteName !== localName;
        const descDiffers = syncDesc && (remoteDesc || "") !== (localDesc || "");
        const needsUpdate = priceDiffers || nameDiffers || descDiffers;

        if (!needsUpdate) {
          await sb.from("crm_products").update({
            qbo_sync_token: it.SyncToken,
            qbo_synced_at: new Date().toISOString(),
            qbo_sync_error: null,
          }).eq("id", p.id);
          unchanged++;
          results.push({ product_id: p.id, status: "unchanged", mode });
          continue;
        }

        const payload: Record<string, unknown> = {
          Id: p.qbo_item_id,
          SyncToken: it.SyncToken,
          sparse: true,
          UnitPrice: localPrice,
        };
        if (syncName) payload.Name = localName;
        if (syncDesc) payload.Description = localDesc || undefined;

        const data = await qbo<{ Item: any }>("/item", "POST", payload);

        await sb.from("crm_products").update({
          qbo_sync_token: data.Item.SyncToken,
          qbo_synced_at: new Date().toISOString(),
          qbo_sync_error: null,
        }).eq("id", p.id);
        updated++;
        results.push({ product_id: p.id, status: "updated", mode });
      } catch (e: any) {
        errors++;
        await sb.from("crm_products").update({ qbo_sync_error: e.message?.slice(0, 1000) ?? "unknown" }).eq("id", p.id);
        results.push({ product_id: p.id, status: "error", error: e.message });
      }
    }

    await finishRun(runId, {
      status: errors === 0 ? "success" : "error",
      updated_count: updated,
      unchanged_count: unchanged,
      error_count: errors,
      detail: { results },
    });

    return { updated, unchanged, errors, results };
  } catch (e: any) {
    await finishRun(runId, { status: "error", error: e.message });
    throw e;
  }
}

// ───────────────────────────────────────────────────────────
// HTTP entry
// ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const action = body.action as string;
    const { isCron } = await authorize(req, body);
    assertQboConfigured();

    // Cron-triggered updates: only run if global QBO sync is enabled
    if (isCron) {
      if (action !== "update") {
        throw new Error("Cron caller may only invoke action=update");
      }
      const enabled = await isGlobalQboSyncEnabled();
      if (!enabled) {
        return new Response(
          JSON.stringify({ ok: true, result: { skipped: true, reason: "qbo_sync_globally_disabled" } }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const result = await updateAction({ ...body, triggered_by: "cron" });
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: unknown;
    switch (action) {
      case "list-income-accounts": result = await listIncomeAccounts(); break;
      case "list-items":           result = await listItemsAction(); break;
      case "match":                result = await matchAction(); break;
      case "link":                 result = await linkAction(body); break;
      case "unlink":               result = await unlinkAction(body); break;
      case "stale-links":          result = await staleLinksAction(body); break;
      case "backfill-qbo-names":   result = await backfillQboNamesAction(); break;
      case "update":               result = await updateAction(body); break;
      default: throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = msg.includes("Unauthorized") ? 401 : msg.includes("Forbidden") ? 403 : 500;
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
