// HubSpot diagnostics edge function
// Runs Create -> Read -> Update -> Read -> Archive round-trips against HubSpot
// to verify connector + write scopes for each object type.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, hsFetch, json } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Step = {
  name: string;
  ok: boolean;
  ms: number;
  status?: number;
  request?: any;
  response?: any;
  error?: string;
};

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("missing auth");
  const sb = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) throw new Error("unauthenticated");
  const admin = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", u.user.id);
  const allowed = (roles ?? []).some((r: any) =>
    ["admin", "super_admin", "sales"].includes(r.role),
  );
  if (!allowed) throw new Error("forbidden");
  return u.user;
}

// Wrapper that captures status + body for diagnostics rather than throwing.
async function rawHs(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: any; ms: number }> {
  const t0 = Date.now();
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const HUBSPOT_API_KEY = Deno.env.get("HUBSPOT_API_KEY");
  if (!LOVABLE_API_KEY || !HUBSPOT_API_KEY) {
    return { ok: false, status: 0, body: { error: "Connector not configured" }, ms: Date.now() - t0 };
  }
  const res = await fetch(`https://connector-gateway.lovable.dev/hubspot${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": HUBSPOT_API_KEY,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, body, ms: Date.now() - t0 };
}

const DIAG_TAG = "LNN-DIAG";
const tag = () => `${DIAG_TAG}-${Date.now()}`;

type Entity = "company" | "contact" | "deal" | "line_item" | "note" | "task";

const OBJECT_PATH: Record<Entity, string> = {
  company: "/crm/v3/objects/companies",
  contact: "/crm/v3/objects/contacts",
  deal: "/crm/v3/objects/deals",
  line_item: "/crm/v3/objects/line_items",
  note: "/crm/v3/objects/notes",
  task: "/crm/v3/objects/tasks",
};

function buildCreatePayload(entity: Entity, t: string): { properties: Record<string, any> } {
  switch (entity) {
    case "company":
      return { properties: { name: t, domain: `${t.toLowerCase()}.lnn-diag.test`, description: "Diagnostics test record" } };
    case "contact":
      return { properties: { firstname: DIAG_TAG, lastname: t, email: `test+${t.toLowerCase()}@lnn.co` } };
    case "deal":
      return { properties: { dealname: t, amount: "100", pipeline: "default" } };
    case "line_item":
      return { properties: { name: t, price: "9.99", quantity: "1" } };
    case "note":
      return { properties: { hs_note_body: `${t} body`, hs_timestamp: Date.now().toString() } };
    case "task":
      return { properties: { hs_task_subject: t, hs_task_body: `${t} body`, hs_timestamp: Date.now().toString(), hs_task_status: "NOT_STARTED" } };
  }
}

function buildUpdatePayload(entity: Entity, t: string): { properties: Record<string, any> } {
  const updated = `${t}-UPDATED`;
  switch (entity) {
    case "company":   return { properties: { name: updated, description: "Updated by diagnostics" } };
    case "contact":   return { properties: { lastname: updated } };
    case "deal":      return { properties: { dealname: updated, amount: "200" } };
    case "line_item": return { properties: { name: updated, price: "19.99" } };
    case "note":      return { properties: { hs_note_body: `${updated} body` } };
    case "task":      return { properties: { hs_task_subject: updated } };
  }
}

function readProps(entity: Entity): string {
  switch (entity) {
    case "company":   return "name,domain,description";
    case "contact":   return "firstname,lastname,email";
    case "deal":      return "dealname,amount,pipeline,dealstage";
    case "line_item": return "name,price,quantity";
    case "note":      return "hs_note_body,hs_timestamp";
    case "task":      return "hs_task_subject,hs_task_body,hs_task_status,hs_timestamp";
  }
}

async function roundtrip(entity: Entity): Promise<{ steps: Step[]; created_id: string | null; cleaned_up: boolean; summary: string }> {
  const steps: Step[] = [];
  const t = tag();
  const path = OBJECT_PATH[entity];
  let createdId: string | null = null;
  let cleanedUp = false;

  // Step 1: Create
  const createReq = buildCreatePayload(entity, t);
  const c = await rawHs(path, { method: "POST", body: JSON.stringify(createReq) });
  steps.push({
    name: "Create", ok: c.ok, ms: c.ms, status: c.status,
    request: createReq, response: c.body,
    error: c.ok ? undefined : (c.body?.message || `HTTP ${c.status}`),
  });
  if (!c.ok) {
    return { steps, created_id: null, cleaned_up: false, summary: `Create failed: ${c.body?.message ?? c.status}` };
  }
  createdId = String(c.body?.id ?? "");
  if (!createdId) {
    return { steps, created_id: null, cleaned_up: false, summary: "Create returned no id" };
  }

  // Step 2: Read
  const props = readProps(entity);
  const r1 = await rawHs(`${path}/${createdId}?properties=${encodeURIComponent(props)}`);
  steps.push({
    name: "Read after create", ok: r1.ok, ms: r1.ms, status: r1.status,
    response: r1.body,
    error: r1.ok ? undefined : (r1.body?.message || `HTTP ${r1.status}`),
  });

  // Step 3: Update
  const updReq = buildUpdatePayload(entity, t);
  const u = await rawHs(`${path}/${createdId}`, { method: "PATCH", body: JSON.stringify(updReq) });
  steps.push({
    name: "Update", ok: u.ok, ms: u.ms, status: u.status,
    request: updReq, response: u.body,
    error: u.ok ? undefined : (u.body?.message || `HTTP ${u.status}`),
  });

  // Step 4: Read again
  const r2 = await rawHs(`${path}/${createdId}?properties=${encodeURIComponent(props)}`);
  // Verify the update propagated
  let verified = true;
  let mismatch: any = null;
  if (r2.ok) {
    const returnedProps = r2.body?.properties ?? {};
    for (const [k, v] of Object.entries(updReq.properties)) {
      if (String(returnedProps[k] ?? "") !== String(v)) {
        verified = false;
        mismatch = { field: k, expected: v, actual: returnedProps[k] };
        break;
      }
    }
  }
  steps.push({
    name: "Read after update", ok: r2.ok && verified, ms: r2.ms, status: r2.status,
    response: r2.body,
    error: !r2.ok ? (r2.body?.message || `HTTP ${r2.status}`) : (verified ? undefined : `Update not reflected: ${JSON.stringify(mismatch)}`),
  });

  // Step 5: Archive (cleanup)
  const d = await rawHs(`${path}/${createdId}`, { method: "DELETE" });
  cleanedUp = d.ok;
  steps.push({
    name: "Archive (cleanup)", ok: d.ok, ms: d.ms, status: d.status,
    response: d.body,
    error: d.ok ? undefined : (d.body?.message || `HTTP ${d.status}`),
  });

  const failed = steps.filter((s) => !s.ok);
  const summary = failed.length === 0
    ? `All ${steps.length} steps passed`
    : `${failed.length}/${steps.length} step(s) failed: ${failed.map((s) => s.name).join(", ")}`;

  return { steps, created_id: createdId, cleaned_up: cleanedUp, summary };
}

async function dealRoundtrip(): Promise<{ steps: Step[]; created_ids: Record<string, string | null>; cleaned_up: boolean; summary: string }> {
  const steps: Step[] = [];
  const t = tag();
  const created: Record<string, string | null> = { company: null, contact: null, deal: null };

  // Create company
  const cReq = buildCreatePayload("company", `${t}-CO`);
  const c = await rawHs(OBJECT_PATH.company, { method: "POST", body: JSON.stringify(cReq) });
  steps.push({ name: "Create company", ok: c.ok, ms: c.ms, status: c.status, request: cReq, response: c.body, error: c.ok ? undefined : c.body?.message });
  if (c.ok) created.company = String(c.body?.id);

  // Create contact
  const ctReq = buildCreatePayload("contact", `${t}-CT`);
  const ct = await rawHs(OBJECT_PATH.contact, { method: "POST", body: JSON.stringify(ctReq) });
  steps.push({ name: "Create contact", ok: ct.ok, ms: ct.ms, status: ct.status, request: ctReq, response: ct.body, error: ct.ok ? undefined : ct.body?.message });
  if (ct.ok) created.contact = String(ct.body?.id);

  // Create deal
  const dReq = buildCreatePayload("deal", t);
  const d = await rawHs(OBJECT_PATH.deal, { method: "POST", body: JSON.stringify(dReq) });
  steps.push({ name: "Create deal", ok: d.ok, ms: d.ms, status: d.status, request: dReq, response: d.body, error: d.ok ? undefined : d.body?.message });
  if (d.ok) created.deal = String(d.body?.id);

  // Associate deal -> company and deal -> contact (v4 default associations)
  if (created.deal && created.company) {
    const a1 = await rawHs(`/crm/v4/objects/deals/${created.deal}/associations/default/companies/${created.company}`, { method: "PUT" });
    steps.push({ name: "Associate deal → company", ok: a1.ok, ms: a1.ms, status: a1.status, response: a1.body, error: a1.ok ? undefined : a1.body?.message });
  }
  if (created.deal && created.contact) {
    const a2 = await rawHs(`/crm/v4/objects/deals/${created.deal}/associations/default/contacts/${created.contact}`, { method: "PUT" });
    steps.push({ name: "Associate deal → contact", ok: a2.ok, ms: a2.ms, status: a2.status, response: a2.body, error: a2.ok ? undefined : a2.body?.message });
  }

  // Read deal back with associations
  if (created.deal) {
    const r = await rawHs(`/crm/v3/objects/deals/${created.deal}?properties=dealname,amount&associations=companies,contacts`);
    steps.push({ name: "Read deal with associations", ok: r.ok, ms: r.ms, status: r.status, response: r.body, error: r.ok ? undefined : r.body?.message });
  }

  // Update deal
  if (created.deal) {
    const uReq = buildUpdatePayload("deal", t);
    const u = await rawHs(`${OBJECT_PATH.deal}/${created.deal}`, { method: "PATCH", body: JSON.stringify(uReq) });
    steps.push({ name: "Update deal", ok: u.ok, ms: u.ms, status: u.status, request: uReq, response: u.body, error: u.ok ? undefined : u.body?.message });

    const r2 = await rawHs(`${OBJECT_PATH.deal}/${created.deal}?properties=dealname,amount`);
    const verified = r2.ok && r2.body?.properties?.dealname === uReq.properties.dealname;
    steps.push({ name: "Read deal after update", ok: verified, ms: r2.ms, status: r2.status, response: r2.body, error: verified ? undefined : "dealname not updated" });
  }

  // Cleanup all three
  let cleanedUp = true;
  for (const [kind, id] of Object.entries(created)) {
    if (!id) continue;
    const path = OBJECT_PATH[kind as Entity];
    const del = await rawHs(`${path}/${id}`, { method: "DELETE" });
    if (!del.ok) cleanedUp = false;
    steps.push({ name: `Archive ${kind}`, ok: del.ok, ms: del.ms, status: del.status, response: del.body, error: del.ok ? undefined : del.body?.message });
  }

  const failed = steps.filter((s) => !s.ok);
  const summary = failed.length === 0 ? `All ${steps.length} steps passed` : `${failed.length}/${steps.length} step(s) failed`;
  return { steps, created_ids: created, cleaned_up: cleanedUp, summary };
}

async function cleanupOrphans(): Promise<{ scanned: Entity[]; archived: Record<string, number>; errors: any[] }> {
  const archived: Record<string, number> = {};
  const errors: any[] = [];
  const entities: Entity[] = ["company", "contact", "deal", "line_item", "note", "task"];

  for (const entity of entities) {
    archived[entity] = 0;
    // For company/contact/deal/line_item we can search by name property.
    // Notes/tasks searched by hs_note_body / hs_task_subject.
    let propName = "";
    let returnProp = "";
    switch (entity) {
      case "company":   propName = "name"; returnProp = "name"; break;
      case "contact":   propName = "lastname"; returnProp = "lastname"; break;
      case "deal":      propName = "dealname"; returnProp = "dealname"; break;
      case "line_item": propName = "name"; returnProp = "name"; break;
      case "note":      propName = "hs_note_body"; returnProp = "hs_note_body"; break;
      case "task":      propName = "hs_task_subject"; returnProp = "hs_task_subject"; break;
    }
    const searchPath = `${OBJECT_PATH[entity]}/search`;
    const searchBody = {
      filterGroups: [{ filters: [{ propertyName: propName, operator: "CONTAINS_TOKEN", value: DIAG_TAG }] }],
      properties: [returnProp],
      limit: 100,
    };
    const s = await rawHs(searchPath, { method: "POST", body: JSON.stringify(searchBody) });
    if (!s.ok) {
      errors.push({ entity, step: "search", status: s.status, error: s.body?.message });
      continue;
    }
    const results: any[] = s.body?.results ?? [];
    for (const rec of results) {
      const id = rec?.id;
      if (!id) continue;
      const del = await rawHs(`${OBJECT_PATH[entity]}/${id}`, { method: "DELETE" });
      if (del.ok) archived[entity]++;
      else errors.push({ entity, id, error: del.body?.message ?? `HTTP ${del.status}` });
    }
  }

  return { scanned: entities, archived, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await requireAdmin(req);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 401);
  }

  let payload: any = {};
  try { payload = await req.json(); } catch { payload = {}; }
  const action = payload?.action as string | undefined;
  if (!action) return json({ ok: false, error: "action required" }, 400);

  try {
    if (action === "ping") {
      const r = await rawHs("/crm/v3/owners?limit=1");
      return json({ ok: r.ok, ms: r.ms, status: r.status, response: r.body });
    }
    if (action === "roundtrip") {
      const entity = payload?.entity as Entity | undefined;
      if (!entity || !OBJECT_PATH[entity]) return json({ ok: false, error: "valid entity required" }, 400);
      if (entity === "deal") {
        const result = await dealRoundtrip();
        return json({ ok: result.steps.every((s) => s.ok), ...result });
      }
      const result = await roundtrip(entity);
      return json({ ok: result.steps.every((s) => s.ok), ...result });
    }
    if (action === "cleanup-orphans") {
      const result = await cleanupOrphans();
      return json({ ok: true, ...result });
    }
    return json({ ok: false, error: `unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
