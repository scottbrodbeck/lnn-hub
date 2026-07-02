// Shared HubSpot API helpers for sync edge functions.
// Calls the HubSpot CRM API directly (was the Lovable connector gateway).
// HUBSPOT_API_KEY holds a HubSpot Bearer credential — a Service Key (recommended) or a
// Private App access token (pat-...). Both authenticate the same way (Authorization
// header), so either drops in with no code change.

export const GATEWAY_URL = "https://api.hubapi.com";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

// Sleep helper for retry backoff.
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Check if sync is paused via crm_settings (defensive: any error returns false).
export async function isSyncPaused(admin: any): Promise<boolean> {
  try {
    const { data } = await admin
      .from("crm_settings")
      .select("value")
      .eq("key", "sync_paused")
      .maybeSingle();
    return data?.value === true || data?.value === "true";
  } catch {
    return false;
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function hsFetch<T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const HUBSPOT_API_KEY = Deno.env.get("HUBSPOT_API_KEY");
  if (!HUBSPOT_API_KEY) {
    throw new Error("HUBSPOT_API_KEY not configured (HubSpot Service Key or private app token)");
  }

  // Retry up to 3x on 429/5xx with exponential backoff (1s, 3s, 9s).
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${GATEWAY_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

    if (res.ok) {
      // 204 No Content (e.g., DELETE) — return empty object.
      if (res.status === 204) return {} as T;
      return res.json() as Promise<T>;
    }

    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    const text = await res.text();
    lastErr = new Error(`HubSpot API ${res.status} on ${path}: ${text.slice(0, 500)}`);
    if (!retryable || attempt === 2) throw lastErr;

    // Honor Retry-After when present (seconds).
    const retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10);
    const backoff = retryAfter > 0 ? retryAfter * 1000 : [1000, 3000, 9000][attempt];
    await sleep(backoff);
  }
  throw lastErr;
}

// Search API: returns objects modified since the given ISO timestamp.
// Pages through results up to `maxPages` * 100 results.
// `lastModifiedProperty` lets callers override the timestamp field name —
// contacts use `lastmodifieddate`, companies/deals use `hs_lastmodifieddate`.
export async function hsSearchSince(
  object: string,
  properties: string[],
  sinceIso: string | null,
  associations: string[] = [],
  maxPages = 200,
  admin?: any,
  lastModifiedProperty = "hs_lastmodifieddate",
): Promise<{ results: any[]; lastModified: string | null }> {
  const all: any[] = [];
  let after: string | undefined;
  let lastModified: string | null = null;
  const filterGroups = sinceIso
    ? [{
      filters: [{
        propertyName: lastModifiedProperty,
        operator: "GTE",
        value: new Date(sinceIso).getTime().toString(),
      }],
    }]
    : [];

  for (let page = 0; page < maxPages; page++) {
    const body: any = {
      filterGroups,
      properties,
      sorts: [{ propertyName: lastModifiedProperty, direction: "ASCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;
    let data: any;
    try {
      data = await hsFetch<any>(`/crm/v3/objects/${object}/search`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      // HubSpot search caps at 10,000 results per query (page ~100). After that
      // it returns 400. If we've already collected results in this run, treat
      // it as end-of-page and return what we have so the watermark advances and
      // the next invocation continues from there.
      if (msg.includes("400") && all.length > 0) {
        console.warn(`[hsSearchSince] ${object} 400 after ${all.length} results — treating as end of window.`);
        break;
      }
      throw e;
    }
    const results = data.results || [];
    if (associations.length && results.length) {
      // batch-load associations for this page
      for (const assoc of associations) {
        let assocData: any = { results: [] };
        try {
          assocData = await hsFetch<any>(
            `/crm/v4/associations/${object}/${assoc}/batch/read`,
            {
              method: "POST",
              body: JSON.stringify({
                inputs: results.map((r: any) => ({ id: String(r.id) })),
              }),
            },
          );
        } catch (e: any) {
          const msg = e?.message || String(e);
          console.error(`[hsSearchSince] association fetch failed ${object}->${assoc}: ${msg}`);
          if (admin) {
            try {
              await admin.from("crm_sync_log").insert({
                direction: "pull",
                entity_type: object,
                op: `assoc:${assoc}`,
                status: "partial",
                error: msg.slice(0, 500),
              });
            } catch { /* ignore */ }
          }
        }
        const assocMap = new Map<string, string[]>();
        for (const ar of assocData.results || []) {
          assocMap.set(
            String(ar.from?.id),
            (ar.to || []).map((t: any) => String(t.toObjectId ?? t.id)),
          );
        }
        for (const r of results) {
          r._associations = r._associations || {};
          r._associations[assoc] = assocMap.get(String(r.id)) || [];
        }
      }
    }
    all.push(...results);
    for (const r of results) {
      const lm = r.properties?.[lastModifiedProperty] ?? r.properties?.hs_lastmodifieddate;
      if (lm && (!lastModified || lm > lastModified)) lastModified = lm;
    }
    after = data?.paging?.next?.after;
    if (!after) break;
  }
  return { results: all, lastModified };
}

export async function hsListAll(
  path: string,
  maxPages = 50,
): Promise<any[]> {
  const out: any[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const cursor = after ? `${sep}after=${encodeURIComponent(after)}` : "";
    const data = await hsFetch<any>(`${path}${cursor}`);
    out.push(...(data.results || []));
    after = data?.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

// Single page of the List API (cursor-based, no 10K cap).
// Used for full backfills where Search's row limit is a problem.
// Associations come back inline in the list response (no batch-read needed).
export async function hsListPage(
  object: string,
  properties: string[],
  associations: string[] = [],
  after?: string,
  limit = 100,
): Promise<{ results: any[]; nextAfter: string | null }> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (properties.length) params.set("properties", properties.join(","));
  if (associations.length) params.set("associations", associations.join(","));
  if (after) params.set("after", after);
  const data = await hsFetch<any>(`/crm/v3/objects/${object}?${params.toString()}`);
  const results = (data.results || []).map((r: any) => {
    // Normalize associations into the same shape Search uses (_associations[name] = string[]).
    const _associations: Record<string, string[]> = {};
    if (r.associations) {
      for (const [name, val] of Object.entries<any>(r.associations)) {
        _associations[name] = (val?.results || []).map((x: any) =>
          String(x.toObjectId ?? x.id)
        );
      }
    }
    return { ...r, _associations };
  });
  return { results, nextAfter: data?.paging?.next?.after ?? null };
}

// Get/update sync state row (one per object_type).
export async function getWatermark(
  admin: any,
  objectType: string,
): Promise<string | null> {
  const { data } = await admin
    .from("crm_sync_state")
    .select("last_modified_watermark")
    .eq("object_type", objectType)
    .maybeSingle();
  return data?.last_modified_watermark ?? null;
}

export async function setSyncState(
  admin: any,
  objectType: string,
  patch: {
    last_modified_watermark?: string | null;
    last_run_at?: string;
    last_run_status?: string;
    last_error?: string | null;
    records_processed?: number;
    last_full_reconcile_at?: string;
  },
): Promise<void> {
  await admin
    .from("crm_sync_state")
    .upsert(
      { object_type: objectType, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "object_type" },
    );
}

export async function logSync(
  admin: any,
  entry: {
    direction: "pull" | "push";
    entity_type: string;
    op?: string;
    status: "ok" | "error" | "partial";
    records_processed?: number;
    latency_ms?: number;
    error?: string | null;
    detail?: any;
  },
): Promise<void> {
  await admin.from("crm_sync_log").insert(entry);
}

// Pulls newly modified rows + writes watermark + logs, with error capture.
export async function runPull(
  admin: any,
  objectType: string,
  fn: (since: string | null) => Promise<{ processed: number; lastModified: string | null }>,
): Promise<{ processed: number; error?: string }> {
  const start = Date.now();
  const since = await getWatermark(admin, objectType);
  try {
    const { processed, lastModified } = await fn(since);
    // Advance the watermark to EXACTLY lastModified (no +1ms). The next tick's GTE
    // filter re-includes records sharing this exact millisecond; upserts dedupe the
    // harmless re-fetch. The previous +1ms silently skipped records that shared the
    // boundary millisecond whenever a run stopped early (maxPages, an edge-function
    // timeout, or the 10k search cap) — permanent, invisible CRM data loss.
    // If lastModified is null but rows were processed, advance to "now" to avoid an
    // infinite loop re-pulling the same first page.
    const advanced = lastModified
      ? new Date(lastModified).toISOString()
      : (processed > 0 ? new Date().toISOString() : since);
    await setSyncState(admin, objectType, {
      last_modified_watermark: advanced,
      last_run_at: new Date().toISOString(),
      last_run_status: "ok",
      last_error: null,
      records_processed: processed,
    });
    await logSync(admin, {
      direction: "pull",
      entity_type: objectType,
      status: "ok",
      records_processed: processed,
      latency_ms: Date.now() - start,
    });
    return { processed };
  } catch (e: any) {
    const msg = e?.message || String(e);
    await setSyncState(admin, objectType, {
      last_run_at: new Date().toISOString(),
      last_run_status: "error",
      last_error: msg,
    });
    await logSync(admin, {
      direction: "pull",
      entity_type: objectType,
      status: "error",
      latency_ms: Date.now() - start,
      error: msg,
    });
    return { processed: 0, error: msg };
  }
}

// Skip pulling rows that have unapplied outbox writes (avoid clobbering local pending changes).
export async function getPendingEntityIds(
  admin: any,
  entityType: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from("crm_sync_outbox")
    .select("hubspot_id")
    .eq("entity_type", entityType)
    .in("status", ["pending", "in_flight", "error"]);
  return new Set((data ?? []).map((r: any) => String(r.hubspot_id)).filter(Boolean));
}
