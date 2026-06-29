// HubSpot product sync — list/link/unlink/push to HubSpot
// Source of truth: crm_products (driven by LNN pricing API). HubSpot is the destination.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/hubspot";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hsFetch(path: string, init?: RequestInit) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const HUBSPOT_API_KEY = Deno.env.get("HUBSPOT_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  if (!HUBSPOT_API_KEY) throw new Error("HUBSPOT_API_KEY not configured (connect HubSpot)");
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": HUBSPOT_API_KEY,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HubSpot ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : {};
}

// Map our billing cycle to HubSpot's recurringbillingfrequency enum.
function billingCycleToHs(cycle: string | null): string | null {
  switch (cycle) {
    case "monthly":
      return "monthly";
    case "quarterly":
      return "quarterly";
    case "annual":
      return "annually";
    case "one_time":
      return null; // HubSpot one-time = no recurring frequency
    default:
      return null;
  }
}

async function hsListAllProducts(): Promise<any[]> {
  const out: any[] = [];
  let after: string | undefined = undefined;
  const props = "name,price,description,hs_sku,recurringbillingfrequency";
  while (true) {
    const cursor = after ? `&after=${encodeURIComponent(after)}` : "";
    const data = await hsFetch(
      `/crm/v3/objects/products?limit=100&properties=${props}${cursor}`,
    );
    out.push(...(data.results || []));
    after = data?.paging?.next?.after;
    if (!after) break;
    if (out.length > 5000) break; // safety
  }
  return out;
}

async function pushOne(admin: any, crmProductId: string) {
  const { data: link, error: linkErr } = await admin
    .from("crm_product_hubspot_links")
    .select("*")
    .eq("crm_product_id", crmProductId)
    .maybeSingle();
  if (linkErr) throw linkErr;
  if (!link) throw new Error("No HubSpot link for this product");

  const { data: product, error: prodErr } = await admin
    .from("crm_products")
    .select("*")
    .eq("id", crmProductId)
    .single();
  if (prodErr) throw prodErr;

  // Shared field-mode selector (also used by QBO). 'price' is the safe default.
  const { data: modeRow } = await admin
    .from("crm_settings")
    .select("value")
    .eq("key", "qbo_sync_fields_default")
    .maybeSingle();
  const modeRaw = (modeRow?.value as unknown) ?? "price";
  const mode: "price" | "price_name" | "price_name_description" =
    modeRaw === "price_name" || modeRaw === "price_name_description" ? modeRaw : "price";

  const properties: Record<string, any> = {
    price: String(product.unit_price ?? 0),
  };
  if (mode === "price_name" || mode === "price_name_description") {
    properties.name = product.name;
  }
  if (mode === "price_name_description") {
    properties.description = product.description ?? "";
  }
  const freq = billingCycleToHs(product.billing_cycle);
  if (freq) properties.recurringbillingfrequency = freq;

  try {
    await hsFetch(`/crm/v3/objects/products/${link.hubspot_product_id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
    await admin
      .from("crm_product_hubspot_links")
      .update({
        last_pushed_at: new Date().toISOString(),
        last_push_status: "success",
        last_push_error: null,
      })
      .eq("id", link.id);
    return { ok: true };
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    await admin
      .from("crm_product_hubspot_links")
      .update({
        last_pushed_at: new Date().toISOString(),
        last_push_status: "error",
        last_push_error: msg.slice(0, 1000),
      })
      .eq("id", link.id);
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;
    const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY;
    // pg_cron pattern: anon JWT + body.source === 'cron'
    const isCron = isServiceRole || (token === SUPABASE_ANON_KEY && body?.source === "cron");

    let callerUserId: string | null = null;
    if (!isCron) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userRes } = await userClient.auth.getUser();
      if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
      callerUserId = userRes.user.id;

      const { data: hasAccess, error: accessErr } = await userClient.rpc("has_crm_access", {
        _user_id: userRes.user.id,
      });
      if (accessErr) return json({ error: accessErr.message }, 500);
      if (!hasAccess) return json({ error: "Forbidden" }, 403);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === "list_hubspot_products") {
      const items = await hsListAllProducts();
      // Also return existing links so UI can show what's mapped.
      const { data: links } = await admin
        .from("crm_product_hubspot_links")
        .select("hubspot_product_id, crm_product_id");
      const linkedIds = new Set((links ?? []).map((l: any) => l.hubspot_product_id));
      return json({
        items: items.map((it: any) => ({
          id: String(it.id),
          name: it.properties?.name ?? "(unnamed)",
          price: it.properties?.price ?? null,
          description: it.properties?.description ?? null,
          sku: it.properties?.hs_sku ?? null,
          recurring: it.properties?.recurringbillingfrequency ?? null,
          linked: linkedIds.has(String(it.id)),
        })),
        total: items.length,
      });
    }

    if (action === "link") {
      const crmProductId = body?.crm_product_id as string;
      const hubspotProductId = String(body?.hubspot_product_id ?? "");
      const hubspotName = body?.hubspot_name ?? null;
      const hubspotPrice = body?.hubspot_price ?? null;
      if (!crmProductId || !hubspotProductId) return json({ error: "missing fields" }, 400);
      const { error } = await admin
        .from("crm_product_hubspot_links")
        .insert({
          crm_product_id: crmProductId,
          hubspot_product_id: hubspotProductId,
          hubspot_name: hubspotName,
          hubspot_price: hubspotPrice,
          linked_by: callerUserId,
        });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "unlink") {
      const crmProductId = body?.crm_product_id as string;
      if (!crmProductId) return json({ error: "missing crm_product_id" }, 400);
      const { error } = await admin
        .from("crm_product_hubspot_links")
        .delete()
        .eq("crm_product_id", crmProductId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "push_one") {
      const crmProductId = body?.crm_product_id as string;
      if (!crmProductId) return json({ error: "missing crm_product_id" }, 400);
      const result = await pushOne(admin, crmProductId);
      return json(result, result.ok ? 200 : 502);
    }

    if (action === "push_all") {
      // Check global toggle.
      const { data: setting } = await admin
        .from("crm_settings")
        .select("value")
        .eq("key", "hubspot_sync_globally_enabled")
        .maybeSingle();
      const globalOn = setting?.value === true;
      if (!globalOn) return json({ error: "Global HubSpot sync is disabled" }, 400);

      const { data: rows, error } = await admin
        .from("crm_product_hubspot_links")
        .select("crm_product_id, crm_products!inner(hubspot_sync_enabled, is_active)")
        .eq("crm_products.hubspot_sync_enabled", true);
      if (error) return json({ error: error.message }, 500);

      let success = 0;
      let failed = 0;
      const errors: string[] = [];
      for (const r of rows ?? []) {
        const res = await pushOne(admin, (r as any).crm_product_id);
        if (res.ok) success++;
        else {
          failed++;
          errors.push(`${(r as any).crm_product_id}: ${res.error}`);
        }
      }
      return json({ success, failed, errors });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
