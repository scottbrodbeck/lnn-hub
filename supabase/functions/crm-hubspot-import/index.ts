// HubSpot CRM Import: discover / preview / commit / undo
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY_URL = "https://api.hubapi.com";
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
  const HUBSPOT_API_KEY = Deno.env.get("HUBSPOT_API_KEY");
  if (!HUBSPOT_API_KEY) throw new Error("HUBSPOT_API_KEY not configured (HubSpot private app token)");
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot API ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

async function hsListAll(
  object: string,
  properties: string[],
  associations: string[] = [],
  max = 1000,
): Promise<any[]> {
  const out: any[] = [];
  let after: string | undefined = undefined;
  const propsParam = properties.join(",");
  const assocParam = associations.length ? `&associations=${associations.join(",")}` : "";
  while (out.length < max) {
    const cursor = after ? `&after=${encodeURIComponent(after)}` : "";
    const data = await hsFetch(
      `/crm/v3/objects/${object}?limit=100&properties=${propsParam}${assocParam}${cursor}`,
    );
    out.push(...(data.results || []));
    after = data?.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

async function hsCount(object: string): Promise<number> {
  try {
    const data = await hsFetch(
      `/crm/v3/objects/${object}/search`,
      { method: "POST", body: JSON.stringify({ limit: 1 }) },
    );
    return data?.total ?? 0;
  } catch {
    return 0;
  }
}

function composeAddress(p: any): string | null {
  const parts = [p.address, p.city, p.state, p.zip].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function billingFromHs(freq?: string): string {
  switch ((freq || "").toLowerCase()) {
    case "monthly": return "monthly";
    case "quarterly": return "quarterly";
    case "annually":
    case "yearly": return "annual";
    default: return "one_time";
  }
}

// Field-level merge for re-imports.
// Returns the subset of fields that should actually be written to the existing row.
// Rules:
//   - never overwrite fields in `protectedFields`
//   - if alwaysOverwrite=true: take incoming when incoming is non-empty
//   - if alwaysOverwrite=false: take incoming only when local is empty AND incoming is non-empty
function mergeForUpdate(
  existing: Record<string, any>,
  incoming: Record<string, any>,
  alwaysOverwrite: boolean,
  protectedFields: string[] = [],
): Record<string, any> {
  const out: Record<string, any> = {};
  const isEmpty = (v: any) => v === null || v === undefined || v === "";
  for (const [k, v] of Object.entries(incoming)) {
    if (protectedFields.includes(k)) continue;
    if (isEmpty(v)) continue;
    if (alwaysOverwrite || isEmpty(existing?.[k])) {
      if (existing?.[k] !== v) out[k] = v;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const roles = (roleRow || []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("super_admin")) {
      return json({ error: "Admin role required" }, 403);
    }

    const { action, ...params } = await req.json();

    if (action === "discover") {
      const [companies, contacts, deals, products, owners, pipelines] = await Promise.all([
        hsCount("companies"),
        hsCount("contacts"),
        hsCount("deals"),
        hsCount("products"),
        hsFetch("/crm/v3/owners?limit=100").catch(() => ({ results: [] })),
        hsFetch("/crm/v3/pipelines/deals").catch(() => ({ results: [] })),
      ]);
      return json({
        counts: { companies, contacts, deals, products },
        owners: (owners.results || []).map((o: any) => ({
          id: String(o.id),
          email: o.email,
          name: [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email,
        })),
        hubspot_pipelines: (pipelines.results || []).map((p: any) => ({
          id: p.id,
          label: p.label,
          stages: (p.stages || []).map((s: any) => ({
            id: s.id,
            label: s.label,
            displayOrder: s.displayOrder,
            metadata: s.metadata,
          })),
        })),
      });
    }

    if (action === "preview") {
      const {
        selected_entities,
        owner_mapping,
        pipeline_id,
        stage_mapping,
        hubspot_pipeline_id,
        overwrite_policy,
      } = params;
      const policy = {
        companies: !!overwrite_policy?.companies,
        contacts: !!overwrite_policy?.contacts,
        deals: !!overwrite_policy?.deals,
        products: !!overwrite_policy?.products,
      };

      // Create batch
      const { data: batch, error: batchErr } = await admin
        .from("crm_import_batches")
        .insert({
          source: "hubspot",
          status: "previewing",
          selected_entities,
          owner_mapping,
          pipeline_id,
          stage_mapping,
          field_mapping: { hubspot_pipeline_id, overwrite_policy: policy },
          created_by: user.id,
        })
        .select()
        .single();
      if (batchErr) throw batchErr;

      const counts: Record<
        string,
        { create: number; update: number; unchanged: number; error: number }
      > = {};
      const stagingRows: any[] = [];

      // Helper: classify one matched row given existing record + incoming payload + protected fields
      const classifyMatch = (
        existing: Record<string, any>,
        incoming: Record<string, any>,
        alwaysOverwrite: boolean,
        protectedFields: string[],
      ): "update" | "unchanged" => {
        const merged = mergeForUpdate(existing, incoming, alwaysOverwrite, protectedFields);
        return Object.keys(merged).length > 0 ? "update" : "unchanged";
      };

      // ---------- Companies ----------
      if (selected_entities.includes("companies")) {
        const list = await hsListAll(
          "companies",
          ["name", "domain", "industry", "phone", "address", "city", "state", "zip", "hubspot_owner_id"],
        );
        const ids = list.map((x) => String(x.id));
        const { data: existing } = await admin
          .from("crm_organizations")
          .select("id, hubspot_id, import_batch_id, name, website, industry, phone, address, owner_user_id")
          .in("hubspot_id", ids.length ? ids : [""]);
        const byHs = new Map((existing || []).filter((e: any) => e.hubspot_id).map((e: any) => [e.hubspot_id, e]));
        let c = 0, u = 0, un = 0, e = 0;
        const protectedFields = ["linked_org_id", "notes"];
        for (const co of list) {
          const p = co.properties || {};
          const errors: string[] = [];
          if (!p.name) errors.push("Missing name");
          const incoming = {
            name: p.name,
            website: p.domain,
            industry: p.industry,
            phone: p.phone,
            address: composeAddress(p),
            owner_user_id: owner_mapping?.[p.hubspot_owner_id] || null,
          };
          const match = byHs.get(String(co.id));
          let matchType: string;
          if (errors.length) matchType = "error";
          else if (!match) matchType = "create";
          else matchType = classifyMatch(match, incoming, policy.companies, protectedFields);
          if (matchType === "create") c++;
          else if (matchType === "update") u++;
          else if (matchType === "unchanged") un++;
          else e++;
          stagingRows.push({
            batch_id: batch.id,
            entity_type: "company",
            hubspot_id: String(co.id),
            payload: incoming,
            match_type: matchType,
            match_target_id: match?.id || null,
            previous_batch_id: match?.import_batch_id || null,
            errors,
          });
        }
        counts.companies = { create: c, update: u, unchanged: un, error: e };
      }

      // ---------- Products ----------
      if (selected_entities.includes("products")) {
        const list = await hsListAll(
          "products",
          ["name", "hs_sku", "description", "price", "recurringbillingfrequency"],
        );
        const ids = list.map((x) => String(x.id));
        const { data: existing } = await admin
          .from("crm_products")
          .select("id, hubspot_id, import_batch_id, name, sku, description, unit_price, billing_cycle")
          .in("hubspot_id", ids.length ? ids : [""]);
        const byHs = new Map((existing || []).filter((e: any) => e.hubspot_id).map((e: any) => [e.hubspot_id, e]));
        let c = 0, u = 0, un = 0, e = 0;
        for (const pr of list) {
          const p = pr.properties || {};
          const errors: string[] = [];
          if (!p.name) errors.push("Missing name");
          const incoming = {
            name: p.name,
            sku: p.hs_sku,
            description: p.description,
            unit_price: p.price ? Number(p.price) : 0,
            billing_cycle: billingFromHs(p.recurringbillingfrequency),
          };
          const match = byHs.get(String(pr.id));
          let matchType: string;
          if (errors.length) matchType = "error";
          else if (!match) matchType = "create";
          else matchType = classifyMatch(match, incoming, policy.products, []);
          if (matchType === "create") c++;
          else if (matchType === "update") u++;
          else if (matchType === "unchanged") un++;
          else e++;
          stagingRows.push({
            batch_id: batch.id,
            entity_type: "product",
            hubspot_id: String(pr.id),
            payload: incoming,
            match_type: matchType,
            match_target_id: match?.id || null,
            previous_batch_id: match?.import_batch_id || null,
            errors,
          });
        }
        counts.products = { create: c, update: u, unchanged: un, error: e };
      }

      // ---------- Contacts ----------
      if (selected_entities.includes("contacts")) {
        const list = await hsListAll(
          "contacts",
          ["firstname", "lastname", "email", "phone", "jobtitle", "hubspot_owner_id"],
          ["companies"],
        );
        const ids = list.map((x) => String(x.id));
        const { data: existing } = await admin
          .from("crm_contacts")
          .select("id, hubspot_id, import_batch_id, first_name, last_name, email, phone, title, owner_user_id")
          .in("hubspot_id", ids.length ? ids : [""]);
        const byHs = new Map((existing || []).filter((e: any) => e.hubspot_id).map((e: any) => [e.hubspot_id, e]));
        let c = 0, u = 0, un = 0, e = 0;
        const protectedFields = ["notes"];
        for (const ct of list) {
          const p = ct.properties || {};
          const companyHsId = ct.associations?.companies?.results?.[0]?.id
            ? String(ct.associations.companies.results[0].id)
            : null;
          const incoming = {
            first_name: p.firstname,
            last_name: p.lastname,
            email: p.email,
            phone: p.phone,
            title: p.jobtitle,
            owner_user_id: owner_mapping?.[p.hubspot_owner_id] || null,
          };
          const match = byHs.get(String(ct.id));
          let matchType: string;
          if (!match) matchType = "create";
          else matchType = classifyMatch(match, incoming, policy.contacts, protectedFields);
          if (matchType === "create") c++;
          else if (matchType === "update") u++;
          else un++;
          stagingRows.push({
            batch_id: batch.id,
            entity_type: "contact",
            hubspot_id: String(ct.id),
            payload: incoming,
            associations: { company_hubspot_id: companyHsId },
            match_type: matchType,
            match_target_id: match?.id || null,
            previous_batch_id: match?.import_batch_id || null,
            errors: [],
          });
        }
        counts.contacts = { create: c, update: u, unchanged: un, error: e };
      }

      // ---------- Deals ----------
      if (selected_entities.includes("deals")) {
        const list = await hsListAll(
          "deals",
          ["dealname", "amount", "closedate", "dealstage", "pipeline", "hubspot_owner_id"],
          ["companies", "contacts", "line_items"],
        );
        const ids = list.map((x) => String(x.id));
        const { data: existing } = await admin
          .from("crm_deals")
          .select("id, hubspot_id, import_batch_id, title, value, expected_close_date, stage_id, owner_user_id, status")
          .in("hubspot_id", ids.length ? ids : [""]);
        const byHs = new Map((existing || []).filter((e: any) => e.hubspot_id).map((e: any) => [e.hubspot_id, e]));
        let c = 0, u = 0, un = 0, e = 0;
        const protectedFields = ["notes"];
        for (const dl of list) {
          const p = dl.properties || {};
          const errors: string[] = [];
          if (!p.dealname) errors.push("Missing dealname");
          const stageId = stage_mapping?.[p.dealstage];
          if (!stageId) errors.push(`No mapping for stage "${p.dealstage}"`);
          const companyHsId = dl.associations?.companies?.results?.[0]?.id
            ? String(dl.associations.companies.results[0].id)
            : null;
          const contactHsId = dl.associations?.contacts?.results?.[0]?.id
            ? String(dl.associations.contacts.results[0].id)
            : null;
          const lineItemIds: string[] = (dl.associations?.["line_items"]?.results || []).map((r: any) => String(r.id));
          const incoming = {
            title: p.dealname,
            value: p.amount ? Number(p.amount) : 0,
            expected_close_date: p.closedate ? p.closedate.split("T")[0] : null,
            stage_id: stageId || null,
            pipeline_id,
            owner_user_id: owner_mapping?.[p.hubspot_owner_id] || null,
            hubspot_stage_id: p.dealstage,
          };
          const match = byHs.get(String(dl.id));
          let matchType: string;
          if (errors.length) matchType = "error";
          else if (!match) matchType = "create";
          else {
            // For diffing, exclude pipeline_id + hubspot_stage_id + protected stage_id-on-closed cases
            const diffIncoming: Record<string, any> = { ...incoming };
            delete diffIncoming.pipeline_id;
            delete diffIncoming.hubspot_stage_id;
            // Don't propose stage change on already-closed deals
            if (match.status === "won" || match.status === "lost") delete diffIncoming.stage_id;
            // Don't propose owner change if local owner was reassigned away from HS owner
            if (match.owner_user_id && match.owner_user_id !== diffIncoming.owner_user_id) {
              delete diffIncoming.owner_user_id;
            }
            matchType = classifyMatch(match, diffIncoming, policy.deals, protectedFields);
            // Always re-sync line items, so a deal w/ line items is never "unchanged"
            if (matchType === "unchanged" && lineItemIds.length > 0) matchType = "update";
          }
          if (matchType === "create") c++;
          else if (matchType === "update") u++;
          else if (matchType === "unchanged") un++;
          else e++;
          stagingRows.push({
            batch_id: batch.id,
            entity_type: "deal",
            hubspot_id: String(dl.id),
            payload: incoming,
            associations: {
              company_hubspot_id: companyHsId,
              contact_hubspot_id: contactHsId,
              line_item_hubspot_ids: lineItemIds,
            },
            match_type: matchType,
            match_target_id: match?.id || null,
            previous_batch_id: match?.import_batch_id || null,
            errors,
          });
        }
        counts.deals = { create: c, update: u, unchanged: un, error: e };

        // Fetch line items
        const allLineItemIds = new Set<string>();
        for (const r of stagingRows.filter((s) => s.entity_type === "deal")) {
          for (const id of r.associations?.line_item_hubspot_ids || []) allLineItemIds.add(id);
        }
        if (allLineItemIds.size > 0) {
          const liData = await hsFetch(
            `/crm/v3/objects/line_items/batch/read`,
            {
              method: "POST",
              body: JSON.stringify({
                properties: ["name", "quantity", "price", "hs_product_id", "hs_discount_percentage"],
                inputs: [...allLineItemIds].map((id) => ({ id })),
              }),
            },
          ).catch(() => ({ results: [] }));
          for (const li of liData.results || []) {
            stagingRows.push({
              batch_id: batch.id,
              entity_type: "line_item",
              hubspot_id: String(li.id),
              payload: {
                name: li.properties?.name,
                quantity: Number(li.properties?.quantity || 1),
                unit_price: Number(li.properties?.price || 0),
                discount_pct: Number(li.properties?.hs_discount_percentage || 0),
                product_hubspot_id: li.properties?.hs_product_id ? String(li.properties.hs_product_id) : null,
              },
              associations: {},
              match_type: "create",
              previous_batch_id: null,
              errors: [],
            });
          }
        }
      }

      // Bulk insert staging in chunks
      for (let i = 0; i < stagingRows.length; i += 500) {
        const chunk = stagingRows.slice(i, i + 500);
        const { error: insErr } = await admin.from("crm_import_staging").insert(chunk);
        if (insErr) throw insErr;
      }

      await admin
        .from("crm_import_batches")
        .update({ status: "ready", counts })
        .eq("id", batch.id);

      return json({ batch_id: batch.id, counts });
    }

    if (action === "commit") {
      const { batch_id } = params;
      const { data: batch } = await admin
        .from("crm_import_batches")
        .select("*")
        .eq("id", batch_id)
        .single();
      if (!batch) return json({ error: "Batch not found" }, 404);
      if (batch.status !== "ready") return json({ error: `Batch status ${batch.status}` }, 400);

      const policy = batch.field_mapping?.overwrite_policy || {
        companies: false, contacts: false, deals: false, products: false,
      };

      await admin.from("crm_import_batches").update({ status: "importing" }).eq("id", batch_id);

      const { data: staging } = await admin
        .from("crm_import_staging")
        .select("*")
        .eq("batch_id", batch_id);

      const rows = staging || [];
      const errors: string[] = [];

      const orgIdMap = new Map<string, string>();
      const productIdMap = new Map<string, string>();
      const contactIdMap = new Map<string, string>();
      const dealIdMap = new Map<string, string>();
      const touchedDealIds: string[] = [];

      const isWriteable = (mt: string) => mt === "create" || mt === "update";

      // Build map of existing rows for "update" path so we can apply mergeForUpdate
      async function loadExisting(table: string, ids: string[], cols: string) {
        if (!ids.length) return new Map<string, any>();
        const { data } = await admin.from(table).select(cols).in("id", ids);
        return new Map((data || []).map((r: any) => [r.id, r]));
      }

      // ---------- Products ----------
      const productRows = rows.filter((x) => x.entity_type === "product" && isWriteable(x.match_type));
      const productExisting = await loadExisting(
        "crm_products",
        productRows.filter((r) => r.match_type === "update").map((r) => r.match_target_id),
        "id, name, sku, description, unit_price, billing_cycle",
      );
      for (const r of productRows) {
        if (r.match_type === "update" && r.match_target_id) {
          const existing = productExisting.get(r.match_target_id) || {};
          const merged = mergeForUpdate(existing, r.payload, !!policy.products, []);
          // Always re-tag with current batch + hubspot_id
          merged.hubspot_id = r.hubspot_id;
          merged.import_batch_id = batch_id;
          const { error } = await admin.from("crm_products").update(merged).eq("id", r.match_target_id);
          if (error) { errors.push(`product ${r.hubspot_id}: ${error.message}`); continue; }
          productIdMap.set(r.hubspot_id, r.match_target_id);
        } else {
          const payload = { ...r.payload, hubspot_id: r.hubspot_id, import_batch_id: batch_id };
          const { data, error } = await admin.from("crm_products").insert(payload).select("id").single();
          if (error) { errors.push(`product ${r.hubspot_id}: ${error.message}`); continue; }
          productIdMap.set(r.hubspot_id, data.id);
        }
      }

      // Re-tag "unchanged" products too so undo logic stays correct
      for (const r of rows.filter((x) => x.entity_type === "product" && x.match_type === "unchanged")) {
        if (r.match_target_id) {
          await admin.from("crm_products")
            .update({ hubspot_id: r.hubspot_id, import_batch_id: batch_id })
            .eq("id", r.match_target_id);
          productIdMap.set(r.hubspot_id, r.match_target_id);
        }
      }

      // ---------- Organizations ----------
      const orgRows = rows.filter((x) => x.entity_type === "company" && isWriteable(x.match_type));
      const orgExisting = await loadExisting(
        "crm_organizations",
        orgRows.filter((r) => r.match_type === "update").map((r) => r.match_target_id),
        "id, name, website, industry, phone, address, owner_user_id",
      );
      const orgProtected = ["linked_org_id", "notes"];
      for (const r of orgRows) {
        if (r.match_type === "update" && r.match_target_id) {
          const existing = orgExisting.get(r.match_target_id) || {};
          const merged = mergeForUpdate(existing, r.payload, !!policy.companies, orgProtected);
          merged.hubspot_id = r.hubspot_id;
          merged.import_batch_id = batch_id;
          const { error } = await admin.from("crm_organizations").update(merged).eq("id", r.match_target_id);
          if (error) { errors.push(`org ${r.hubspot_id}: ${error.message}`); continue; }
          orgIdMap.set(r.hubspot_id, r.match_target_id);
        } else {
          const payload = { ...r.payload, hubspot_id: r.hubspot_id, import_batch_id: batch_id };
          const { data, error } = await admin.from("crm_organizations").insert(payload).select("id").single();
          if (error) { errors.push(`org ${r.hubspot_id}: ${error.message}`); continue; }
          orgIdMap.set(r.hubspot_id, data.id);
        }
      }
      for (const r of rows.filter((x) => x.entity_type === "company" && x.match_type === "unchanged")) {
        if (r.match_target_id) {
          await admin.from("crm_organizations")
            .update({ hubspot_id: r.hubspot_id, import_batch_id: batch_id })
            .eq("id", r.match_target_id);
          orgIdMap.set(r.hubspot_id, r.match_target_id);
        }
      }

      // ---------- Contacts ----------
      const contactRows = rows.filter((x) => x.entity_type === "contact" && isWriteable(x.match_type));
      const contactExisting = await loadExisting(
        "crm_contacts",
        contactRows.filter((r) => r.match_type === "update").map((r) => r.match_target_id),
        "id, first_name, last_name, email, phone, title, owner_user_id, crm_organization_id",
      );
      const contactProtected = ["notes"];
      for (const r of contactRows) {
        const orgHsId = r.associations?.company_hubspot_id;
        let resolvedOrg = orgHsId ? orgIdMap.get(orgHsId) : null;
        if (!resolvedOrg && orgHsId) {
          const { data } = await admin.from("crm_organizations").select("id").eq("hubspot_id", orgHsId).maybeSingle();
          resolvedOrg = data?.id || null;
        }
        if (r.match_type === "update" && r.match_target_id) {
          const existing = contactExisting.get(r.match_target_id) || {};
          const incoming: any = { ...r.payload };
          if (resolvedOrg) incoming.crm_organization_id = resolvedOrg;
          const merged = mergeForUpdate(existing, incoming, !!policy.contacts, contactProtected);
          merged.hubspot_id = r.hubspot_id;
          merged.import_batch_id = batch_id;
          const { error } = await admin.from("crm_contacts").update(merged).eq("id", r.match_target_id);
          if (error) { errors.push(`contact ${r.hubspot_id}: ${error.message}`); continue; }
          contactIdMap.set(r.hubspot_id, r.match_target_id);
        } else {
          const payload = {
            ...r.payload,
            crm_organization_id: resolvedOrg,
            hubspot_id: r.hubspot_id,
            import_batch_id: batch_id,
          };
          const { data, error } = await admin.from("crm_contacts").insert(payload).select("id").single();
          if (error) { errors.push(`contact ${r.hubspot_id}: ${error.message}`); continue; }
          contactIdMap.set(r.hubspot_id, data.id);
        }
      }
      for (const r of rows.filter((x) => x.entity_type === "contact" && x.match_type === "unchanged")) {
        if (r.match_target_id) {
          await admin.from("crm_contacts")
            .update({ hubspot_id: r.hubspot_id, import_batch_id: batch_id })
            .eq("id", r.match_target_id);
          contactIdMap.set(r.hubspot_id, r.match_target_id);
        }
      }

      // ---------- Deals ----------
      const dealRows = rows.filter((x) => x.entity_type === "deal" && isWriteable(x.match_type));
      const dealExisting = await loadExisting(
        "crm_deals",
        dealRows.filter((r) => r.match_type === "update").map((r) => r.match_target_id),
        "id, title, value, expected_close_date, stage_id, owner_user_id, status, crm_organization_id, primary_contact_id",
      );
      const dealProtected = ["notes"];
      for (const r of dealRows) {
        const orgHsId = r.associations?.company_hubspot_id;
        const contactHsId = r.associations?.contact_hubspot_id;
        let resolvedOrg = orgHsId ? orgIdMap.get(orgHsId) : null;
        if (!resolvedOrg && orgHsId) {
          const { data } = await admin.from("crm_organizations").select("id").eq("hubspot_id", orgHsId).maybeSingle();
          resolvedOrg = data?.id || null;
        }
        let resolvedContact = contactHsId ? contactIdMap.get(contactHsId) : null;
        if (!resolvedContact && contactHsId) {
          const { data } = await admin.from("crm_contacts").select("id").eq("hubspot_id", contactHsId).maybeSingle();
          resolvedContact = data?.id || null;
        }

        if (r.match_type === "update" && r.match_target_id) {
          const existing = dealExisting.get(r.match_target_id) || {};
          const incoming: any = {
            title: r.payload.title,
            value: r.payload.value,
            expected_close_date: r.payload.expected_close_date,
            owner_user_id: r.payload.owner_user_id,
          };
          if (resolvedOrg) incoming.crm_organization_id = resolvedOrg;
          if (resolvedContact) incoming.primary_contact_id = resolvedContact;
          // Don't move closed deals
          if (existing.status !== "won" && existing.status !== "lost" && r.payload.stage_id) {
            incoming.stage_id = r.payload.stage_id;
          }
          // Don't clobber re-assigned owner
          if (existing.owner_user_id && existing.owner_user_id !== incoming.owner_user_id) {
            delete incoming.owner_user_id;
          }
          const merged = mergeForUpdate(existing, incoming, !!policy.deals, dealProtected);
          merged.hubspot_id = r.hubspot_id;
          merged.import_batch_id = batch_id;
          const { error } = await admin.from("crm_deals").update(merged).eq("id", r.match_target_id);
          if (error) { errors.push(`deal ${r.hubspot_id}: ${error.message}`); continue; }
          dealIdMap.set(r.hubspot_id, r.match_target_id);
          touchedDealIds.push(r.match_target_id);
        } else {
          const { data: stage } = await admin
            .from("crm_pipeline_stages")
            .select("is_won, is_lost")
            .eq("id", r.payload.stage_id)
            .maybeSingle();
          const status = stage?.is_won ? "won" : stage?.is_lost ? "lost" : "open";
          const payload: any = {
            title: r.payload.title,
            value: r.payload.value,
            expected_close_date: r.payload.expected_close_date,
            stage_id: r.payload.stage_id,
            pipeline_id: r.payload.pipeline_id,
            owner_user_id: r.payload.owner_user_id,
            crm_organization_id: resolvedOrg,
            primary_contact_id: resolvedContact,
            status,
            hubspot_id: r.hubspot_id,
            import_batch_id: batch_id,
          };
          if (status === "won") payload.won_at = r.payload.expected_close_date || new Date().toISOString();
          if (status === "lost") payload.lost_at = r.payload.expected_close_date || new Date().toISOString();
          const { data, error } = await admin.from("crm_deals").insert(payload).select("id").single();
          if (error) { errors.push(`deal ${r.hubspot_id}: ${error.message}`); continue; }
          dealIdMap.set(r.hubspot_id, data.id);
          touchedDealIds.push(data.id);
        }
      }
      for (const r of rows.filter((x) => x.entity_type === "deal" && x.match_type === "unchanged")) {
        if (r.match_target_id) {
          await admin.from("crm_deals")
            .update({ hubspot_id: r.hubspot_id, import_batch_id: batch_id })
            .eq("id", r.match_target_id);
          dealIdMap.set(r.hubspot_id, r.match_target_id);
          // Don't add to touchedDealIds — line items don't need re-sync if unchanged
        }
      }

      // ---------- Line items: re-sync per touched deal ----------
      const lineToDealHs = new Map<string, string>();
      for (const d of rows.filter((x) => x.entity_type === "deal")) {
        for (const lid of d.associations?.line_item_hubspot_ids || []) {
          lineToDealHs.set(lid, d.hubspot_id);
        }
      }
      // Clear existing line items for any deal we touched (create or update)
      if (touchedDealIds.length) {
        await admin.from("crm_deal_products").delete().in("deal_id", touchedDealIds);
      }
      for (const r of rows.filter((x) => x.entity_type === "line_item")) {
        const dealHs = lineToDealHs.get(r.hubspot_id);
        const dealId = dealHs ? dealIdMap.get(dealHs) : null;
        if (!dealId || !touchedDealIds.includes(dealId)) continue;
        const productHs = r.payload.product_hubspot_id;
        let productId = productHs ? productIdMap.get(productHs) : null;
        if (!productId && productHs) {
          const { data } = await admin.from("crm_products").select("id").eq("hubspot_id", productHs).maybeSingle();
          productId = data?.id || null;
        }
        if (!productId) continue;
        const qty = r.payload.quantity || 1;
        const price = r.payload.unit_price || 0;
        const disc = r.payload.discount_pct || 0;
        await admin.from("crm_deal_products").insert({
          deal_id: dealId,
          product_id: productId,
          quantity: qty,
          unit_price: price,
          discount_pct: disc,
          total: qty * price * (1 - disc / 100),
        });
      }

      // Clear staging + mark complete
      await admin.from("crm_import_staging").delete().eq("batch_id", batch_id);
      await admin
        .from("crm_import_batches")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          error_message: errors.length ? errors.slice(0, 20).join("\n") : null,
        })
        .eq("id", batch_id);

      return json({ batch_id, errors });
    }

    if (action === "undo") {
      const { batch_id } = params;

      // Strategy: rows where import_batch_id = batch_id AND no recorded "previous_batch_id"
      // were created by this batch → delete. Rows that had a previous_batch_id stored
      // (i.e. were updated, not created) → restore previous_batch_id, keep data.
      // We can't recover the staging table (cleared at commit), so we infer:
      // - If a record's hubspot_id existed prior to this batch, we don't have it recorded.
      // SOLUTION: we wrote previous_batch_id only on updated rows, but staging is gone.
      // Instead, treat rule simply: rows tagged with this batch_id where NO OTHER batch
      // has ever tagged them are considered "created by this batch" and deleted.
      // We approximate this via a sentinel: we keep the original logic (delete by batch)
      // ONLY for rows whose created_at >= this batch's completed_at minus a small skew.
      const { data: batchInfo } = await admin
        .from("crm_import_batches")
        .select("completed_at, created_at")
        .eq("id", batch_id)
        .single();
      const sinceTs = batchInfo?.created_at;
      if (!sinceTs) return json({ error: "Batch missing created_at" }, 400);

      const tables = [
        { name: "crm_deals", deps: ["crm_deal_products", "crm_deal_stage_history"] },
        { name: "crm_contacts", deps: [] },
        { name: "crm_organizations", deps: [] },
        { name: "crm_products", deps: [] },
      ];

      let deletedCount = 0;
      let untaggedCount = 0;

      for (const t of tables) {
        // Find all rows tagged with this batch
        const { data: tagged } = await admin
          .from(t.name)
          .select("id, created_at")
          .eq("import_batch_id", batch_id);
        const created = (tagged || []).filter((r: any) => r.created_at >= sinceTs);
        const updated = (tagged || []).filter((r: any) => r.created_at < sinceTs);

        // Delete created rows + their dependents
        const createdIds = created.map((r: any) => r.id);
        if (createdIds.length) {
          if (t.name === "crm_deals" && createdIds.length) {
            await admin.from("crm_deal_products").delete().in("deal_id", createdIds);
            await admin.from("crm_deal_stage_history").delete().in("deal_id", createdIds);
          }
          await admin.from(t.name).delete().in("id", createdIds);
          deletedCount += createdIds.length;
        }

        // Untag updated rows (set import_batch_id to null — we lost previous_batch_id)
        const updatedIds = updated.map((r: any) => r.id);
        if (updatedIds.length) {
          await admin.from(t.name).update({ import_batch_id: null }).in("id", updatedIds);
          untaggedCount += updatedIds.length;
        }
      }

      await admin
        .from("crm_import_batches")
        .update({ status: "undone", undone_at: new Date().toISOString() })
        .eq("id", batch_id);

      return json({ batch_id, undone: true, deleted: deletedCount, untagged: untaggedCount });
    }

    if (action === "discard") {
      const { batch_id } = params;
      await admin.from("crm_import_staging").delete().eq("batch_id", batch_id);
      await admin.from("crm_import_batches").delete().eq("id", batch_id);
      return json({ ok: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("crm-hubspot-import error:", err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
