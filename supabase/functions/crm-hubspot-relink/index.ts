// One-shot relinker for HubSpot associations.
// When contacts/deals were ingested before companies, their crm_organization_id /
// primary_contact_id columns were left null. This function rebuilds those links
// from HubSpot's v4 batch associations API without re-pulling object properties.
//
// Triggers (POST):
//   ?entity=contacts             — link contacts → companies
//   ?entity=deals_companies      — link deals → primary company
//   ?entity=deals_contacts       — link deals → primary contact
//   ?entity=all                  — run all three sequentially
//   ?restart=true                — clear cursor(s) and start from the top
//
// Cursor (last processed source row UUID) is persisted in crm_settings under
// key "relink_cursor:<entity>", so each invocation resumes safely.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, hsFetch, json } from "../_shared/hubspot.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BATCH_SIZE = 100; // HubSpot batch endpoint cap
const PAGES_PER_RUN = 20; // 20 batches × 100 = 2,000 rows / invocation
const CURSOR_KEY_PREFIX = "relink_cursor:";

type RelinkEntity = "contacts" | "deals_companies" | "deals_contacts";

async function getCursor(admin: any, entity: string): Promise<string | null> {
  const { data } = await admin
    .from("crm_settings")
    .select("value")
    .eq("key", CURSOR_KEY_PREFIX + entity)
    .maybeSingle();
  const v: any = data?.value;
  if (v && typeof v === "object" && typeof v.last_id === "string") return v.last_id;
  return null;
}

async function setCursor(
  admin: any,
  entity: string,
  lastId: string | null,
): Promise<void> {
  await admin.from("crm_settings").upsert(
    {
      key: CURSOR_KEY_PREFIX + entity,
      value: { last_id: lastId, updated_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}

// Page through source rows missing the link, ordered by id for stable cursoring.
async function fetchSourceBatch(
  admin: any,
  table: string,
  filterCol: string,
  cursorId: string | null,
): Promise<Array<{ id: string; hubspot_id: string }>> {
  let q = admin
    .from(table)
    .select("id,hubspot_id")
    .not("hubspot_id", "is", null)
    .is(filterCol, null)
    .order("id", { ascending: true })
    .limit(BATCH_SIZE);
  if (cursorId) q = q.gt("id", cursorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; hubspot_id: string }>;
}

// HubSpot v4 batch associations read.
// Returns map: fromHubspotId → first toHubspotId (or null if no association).
async function batchReadAssociations(
  fromObject: string,
  toObject: string,
  hubspotIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (!hubspotIds.length) return out;
  const data = await hsFetch<any>(
    `/crm/v4/associations/${fromObject}/${toObject}/batch/read`,
    {
      method: "POST",
      body: JSON.stringify({
        inputs: hubspotIds.map((id) => ({ id: String(id) })),
      }),
    },
  );
  for (const r of data?.results ?? []) {
    const fromId = String(r.from?.id ?? "");
    const first = (r.to ?? [])[0];
    const toId = first ? String(first.toObjectId ?? first.id ?? "") : "";
    out.set(fromId, toId || null);
  }
  // HubSpot omits rows with no association — fill them as null so we don't retry forever.
  for (const id of hubspotIds) {
    if (!out.has(String(id))) out.set(String(id), null);
  }
  return out;
}

async function loadOrgMap(admin: any, hubspotIds: string[]) {
  if (!hubspotIds.length) return new Map<string, string>();
  const { data } = await admin
    .from("crm_organizations")
    .select("id,hubspot_id")
    .in("hubspot_id", hubspotIds);
  return new Map<string, string>(
    (data ?? []).map((o: any) => [String(o.hubspot_id), o.id]),
  );
}

async function loadContactMap(admin: any, hubspotIds: string[]) {
  if (!hubspotIds.length) return new Map<string, string>();
  const { data } = await admin
    .from("crm_contacts")
    .select("id,hubspot_id")
    .in("hubspot_id", hubspotIds);
  return new Map<string, string>(
    (data ?? []).map((c: any) => [String(c.hubspot_id), c.id]),
  );
}

async function relinkOnce(
  admin: any,
  entity: RelinkEntity,
  resetCursor: boolean,
): Promise<{
  entity: RelinkEntity;
  scanned: number;
  updated: number;
  unmatched: number;
  no_association: number;
  pages: number;
  done: boolean;
  cursor: string | null;
}> {
  const cfg = ({
    contacts: {
      table: "crm_contacts",
      fk: "crm_organization_id",
      from: "contacts",
      to: "companies",
      loadTargetMap: loadOrgMap,
    },
    deals_companies: {
      table: "crm_deals",
      fk: "crm_organization_id",
      from: "deals",
      to: "companies",
      loadTargetMap: loadOrgMap,
    },
    deals_contacts: {
      table: "crm_deals",
      fk: "primary_contact_id",
      from: "deals",
      to: "contacts",
      loadTargetMap: loadContactMap,
    },
  } as const)[entity];

  if (resetCursor) {
    await setCursor(admin, entity, null);
  }
  let cursor = resetCursor ? null : await getCursor(admin, entity);
  let scanned = 0;
  let updated = 0;
  let unmatched = 0;
  let noAssoc = 0;
  let pages = 0;
  let done = false;

  for (let page = 0; page < PAGES_PER_RUN; page++) {
    const batch = await fetchSourceBatch(admin, cfg.table, cfg.fk, cursor);
    if (!batch.length) {
      done = true;
      break;
    }
    pages++;
    scanned += batch.length;

    // 1. Ask HubSpot for associations.
    const hsToHsMap = await batchReadAssociations(
      cfg.from,
      cfg.to,
      batch.map((r) => r.hubspot_id),
    );

    // 2. Resolve target HubSpot ids → local UUIDs.
    const targetHsIds = Array.from(
      new Set(
        Array.from(hsToHsMap.values()).filter((v): v is string => !!v),
      ),
    );
    const targetMap = await cfg.loadTargetMap(admin, targetHsIds);

    // 3. Update each source row individually (FK column only).
    for (const row of batch) {
      const targetHsId = hsToHsMap.get(row.hubspot_id);
      if (!targetHsId) {
        noAssoc++;
        continue;
      }
      const targetId = targetMap.get(targetHsId);
      if (!targetId) {
        unmatched++;
        continue;
      }
      const { error } = await admin
        .from(cfg.table)
        .update({ [cfg.fk]: targetId, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
      updated++;
    }

    cursor = batch[batch.length - 1].id;
    await setCursor(admin, entity, cursor);
  }

  if (done) {
    await setCursor(admin, entity, null);
  }

  return {
    entity,
    scanned,
    updated,
    unmatched,
    no_association: noAssoc,
    pages,
    done,
    cursor,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const entityParam = (url.searchParams.get("entity") ?? "contacts").toLowerCase();
  const restart = url.searchParams.get("restart") === "true";

  const ENTITIES: RelinkEntity[] = entityParam === "all"
    ? ["contacts", "deals_companies", "deals_contacts"]
    : [entityParam as RelinkEntity];

  const valid = new Set(["contacts", "deals_companies", "deals_contacts"]);
  for (const e of ENTITIES) {
    if (!valid.has(e)) {
      return json(
        {
          ok: false,
          error: `Invalid entity '${e}'. Use contacts | deals_companies | deals_contacts | all.`,
        },
        400,
      );
    }
  }

  try {
    const reports = [];
    for (const e of ENTITIES) {
      reports.push(await relinkOnce(admin, e, restart));
    }
    return json({ ok: true, reports });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
});
