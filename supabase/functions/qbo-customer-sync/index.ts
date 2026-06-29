// QBO customer sync edge function.
// Actions:
//   search                 → search QBO customers by free-text (name/email)
//   suggest                → fuzzy-suggest QBO customers for an unlinked crm_organization
//   link                   → link a crm_organization to a QBO customer (refreshes balance immediately)
//   unlink                 → clear QBO link from a crm_organization
//   refresh-one            → refresh cached balance/activity for a single linked org
//   refresh-balances       → refresh cached balance/activity for all linked orgs (or only-active)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  qbo,
  qboQuery,
  escapeSqlString,
  normalizeName,
  normalizeSearchTerm,
  assertQboConfigured,
} from "../_shared/qbo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authorize(req: Request): Promise<{ userId: string | null; isService: boolean }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  if (token === SERVICE_ROLE_KEY) return { userId: null, isService: true };
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error } = await sb.auth.getUser();
  if (error || !userData?.user) throw new Error("Unauthorized");
  const userId = userData.user.id;
  const { data: hasAccess } = await admin().rpc("has_crm_access", { _user_id: userId });
  if (!hasAccess) throw new Error("Forbidden: CRM access required");
  return { userId, isService: false };
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
// Helpers
// ───────────────────────────────────────────────────────────

function pickCustomerFields(c: any) {
  return {
    qbo_customer_id: String(c.Id),
    qbo_customer_name: c.DisplayName ?? c.CompanyName ?? c.FullyQualifiedName ?? null,
    qbo_sync_token: c.SyncToken ?? null,
    qbo_balance: c.Balance != null ? Number(c.Balance) : null,
    qbo_balance_with_jobs: c.BalanceWithJobs != null ? Number(c.BalanceWithJobs) : null,
    qbo_currency: c.CurrencyRef?.value ?? null,
    qbo_balance_refreshed_at: new Date().toISOString(),
    qbo_sync_error: null,
  };
}

async function fetchCustomerById(id: string) {
  const res = await qbo<{ Customer: any }>(`/customer/${id}`);
  return res.Customer;
}

// Fetch the most recent invoice + payment for a customer to derive activity.
async function fetchCustomerActivity(customerId: string): Promise<{
  last_invoice_date: string | null;
  last_payment_date: string | null;
  active_within_two_years: boolean;
}> {
  const cid = escapeSqlString(customerId);
  const [invRes, payRes] = await Promise.all([
    qboQuery<{ Invoice?: any[] }>(
      `SELECT TxnDate FROM Invoice WHERE CustomerRef = '${cid}' ORDERBY TxnDate DESC MAXRESULTS 1`,
    ).catch(() => ({} as any)),
    qboQuery<{ Payment?: any[] }>(
      `SELECT TxnDate FROM Payment WHERE CustomerRef = '${cid}' ORDERBY TxnDate DESC MAXRESULTS 1`,
    ).catch(() => ({} as any)),
  ]);

  const lastInv = invRes?.Invoice?.[0]?.TxnDate ?? null;
  const lastPay = payRes?.Payment?.[0]?.TxnDate ?? null;

  const cutoff = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
  const isActive = [lastInv, lastPay].some((d) => d && new Date(d).getTime() >= cutoff);

  return {
    last_invoice_date: lastInv,
    last_payment_date: lastPay,
    active_within_two_years: isActive,
  };
}

// ───────────────────────────────────────────────────────────
// Action handlers
// ───────────────────────────────────────────────────────────

const CUSTOMER_COLS = `*`;

function mapQboCustomer(c: any, extra?: { score?: number; match_type?: string }) {
  return {
    id: String(c.Id),
    display_name: c.DisplayName ?? c.CompanyName ?? c.FullyQualifiedName ?? "",
    company_name: c.CompanyName ?? null,
    email: c.PrimaryEmailAddr?.Address ?? null,
    balance: c.Balance != null ? Number(c.Balance) : 0,
    active: c.Active !== false,
    currency: c.CurrencyRef?.value ?? null,
    sync_token: c.SyncToken ?? null,
    score: extra?.score,
    match_type: extra?.match_type,
  };
}

const STOP_WORDS = new Set([
  "inc", "llc", "ltd", "corp", "corporation", "company", "co",
  "the", "and", "of", "a", "an", "for", "in",
]);

function significantWords(s: string): string[] {
  return normalizeName(s).split(" ").filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// Fetch a bounded page of customers and filter in-process. Used as a fallback
// when targeted LIKE queries return nothing (QBO QL has quirks that can miss
// obvious matches like "test").
async function clientSideCustomerSearch(needle: string, limit: number) {
  const n = normalizeName(needle);
  if (!n) return [];
  const pageSize = 100;
  const maxPages = 20; // up to 2,000 customers
  const collected: any[] = [];
  let lastError: unknown = null;
  let anySucceeded = false;
  for (let i = 0; i < maxPages; i++) {
    const start = i * pageSize + 1;
    try {
      const res = await qboQuery<{ Customer?: any[] }>(
        `SELECT ${CUSTOMER_COLS} FROM Customer WHERE Active = true STARTPOSITION ${start} MAXRESULTS ${pageSize}`,
      );
      anySucceeded = true;
      const rows = res?.Customer ?? [];
      for (const c of rows) {
        const hay = [
          c.DisplayName,
          c.CompanyName,
          c.FullyQualifiedName,
          c.PrimaryEmailAddr?.Address,
        ]
          .map((s) => normalizeName(s ?? ""))
          .join(" ");
        if (hay.includes(n)) collected.push(c);
        if (collected.length >= limit) break;
      }
      if (rows.length < pageSize || collected.length >= limit) break;
    } catch (e) {
      lastError = e;
      break;
    }
  }
  if (!anySucceeded && lastError) {
    throw new Error(`QBO customer fallback fetch failed: ${(lastError as Error)?.message ?? String(lastError)}`);
  }
  return collected;
}

async function searchAction(body: { q?: string; limit?: number }) {
  const raw = (body.q ?? "").trim();
  if (raw.length < 2) return { customers: [] };
  const normalized = normalizeSearchTerm(raw);
  const safe = escapeSqlString(normalized);
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);
  const isEmail = raw.includes("@");

  // Gather candidates from all targeted queries in parallel (no short-circuit).
  const queries: Promise<{ Customer?: any[] }>[] = [
    qboQuery<{ Customer?: any[] }>(
      `SELECT ${CUSTOMER_COLS} FROM Customer WHERE DisplayName = '${safe}' MAXRESULTS ${limit}`,
    ).catch(() => ({ Customer: [] })),
    qboQuery<{ Customer?: any[] }>(
      `SELECT ${CUSTOMER_COLS} FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS ${limit}`,
    ).catch(() => ({ Customer: [] })),
    qboQuery<{ Customer?: any[] }>(
      `SELECT ${CUSTOMER_COLS} FROM Customer WHERE CompanyName LIKE '%${safe}%' MAXRESULTS ${limit}`,
    ).catch(() => ({ Customer: [] })),
  ];
  if (isEmail) {
    queries.push(
      qboQuery<{ Customer?: any[] }>(
        `SELECT ${CUSTOMER_COLS} FROM Customer WHERE PrimaryEmailAddr = '${safe}' MAXRESULTS ${limit}`,
      ).catch(() => ({ Customer: [] })),
    );
  }
  const results = await Promise.all(queries);
  const byId = new Map<string, any>();
  for (const r of results) for (const c of r.Customer ?? []) byId.set(String(c.Id), c);

  // Paged fallback when targeted LIKE returned nothing.
  if (byId.size === 0) {
    try {
      const fb = await clientSideCustomerSearch(normalized, limit);
      for (const c of fb) byId.set(String(c.Id), c);
    } catch (_) { /* best effort */ }
  }

  // Broader fallback: try the first significant word for multi-word queries.
  if (byId.size === 0) {
    const words = significantWords(normalized);
    if (words.length > 0) {
      const head = escapeSqlString(words[0]);
      try {
        const res = await qboQuery<{ Customer?: any[] }>(
          `SELECT ${CUSTOMER_COLS} FROM Customer WHERE DisplayName LIKE '%${head}%' MAXRESULTS ${limit}`,
        );
        for (const c of res?.Customer ?? []) byId.set(String(c.Id), c);
      } catch (_) { /* ignore */ }
    }
  }

  if (byId.size === 0) return { customers: [] };

  // Score and rank.
  const needle = normalizeName(normalized);
  const needleWords = significantWords(normalized);
  const emailLower = isEmail ? normalized.toLowerCase() : "";

  const scored = Array.from(byId.values()).map((c) => {
    const dn = normalizeName(c.DisplayName ?? "");
    const cn = normalizeName(c.CompanyName ?? "");
    const em = (c.PrimaryEmailAddr?.Address ?? "").toLowerCase();
    let score = 0;
    let match_type = "partial";

    if (dn && dn === needle) { score = 100; match_type = "exact"; }
    else if (cn && cn === needle) { score = 95; match_type = "exact company"; }
    else if (emailLower && em === emailLower) { score = 85; match_type = "email"; }
    else if (dn && dn.startsWith(needle)) { score = 80; match_type = "starts with"; }
    else if (dn && dn.includes(needle)) { score = 70; match_type = "contains"; }
    else if (cn && cn.includes(needle)) { score = 60; match_type = "company contains"; }
    else {
      const cw = significantWords(`${c.DisplayName ?? ""} ${c.CompanyName ?? ""}`);
      const hits = needleWords.filter((w) => cw.some((x) => x.includes(w) || w.includes(x)));
      score = needleWords.length > 0 ? (hits.length / needleWords.length) * 50 : 0;
      match_type = "word overlap";
    }

    // Tightness bonus — prefer shorter matched names.
    if (score >= 70 && dn) {
      const ratio = Math.min(1, needle.length / Math.max(dn.length, 1));
      score += ratio * 5;
    }
    return { c, score, match_type };
  });

  scored.sort((a, b) => b.score - a.score);
  const customers = scored
    .slice(0, limit)
    .map(({ c, score, match_type }) => mapQboCustomer(c, { score: Math.round(score), match_type }));
  return { customers };
}

async function suggestAction(body: { crm_organization_id: string; email?: string | null }) {
  if (!body.crm_organization_id) throw new Error("crm_organization_id required");
  const sb = admin();
  const { data: org, error } = await sb
    .from("crm_organizations")
    .select("id, name")
    .eq("id", body.crm_organization_id)
    .maybeSingle();
  if (error || !org) throw new Error(error?.message ?? "Organization not found");

  // Gather emails to fuzzy-match against: caller-provided + primary contact + any contacts
  const emails = new Set<string>();
  if (body.email) emails.add(body.email.trim().toLowerCase());
  const { data: contacts } = await sb
    .from("crm_contacts")
    .select("email, is_primary")
    .eq("crm_organization_id", body.crm_organization_id)
    .not("email", "is", null)
    .order("is_primary", { ascending: false })
    .limit(5);
  for (const c of contacts ?? []) {
    if (c.email) emails.add(String(c.email).trim().toLowerCase());
  }

  const norm = normalizeName(org.name);
  const tokens = norm.split(" ").filter((t) => t.length > 2);
  const head = tokens[0] ?? norm.slice(0, 8);

  // Build queries: by name token (split OR across fields — QBO QL doesn't
  // allow OR between LIKE clauses on different fields) + one per email.
  const queries: Promise<{ Customer?: any[] }>[] = [];
  if (head) {
    const safe = escapeSqlString(head);
    queries.push(
      qboQuery<{ Customer?: any[] }>(
        `SELECT ${CUSTOMER_COLS} FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 25`,
      ).catch(() => ({ Customer: [] })),
      qboQuery<{ Customer?: any[] }>(
        `SELECT ${CUSTOMER_COLS} FROM Customer WHERE CompanyName LIKE '%${safe}%' MAXRESULTS 25`,
      ).catch(() => ({ Customer: [] })),
    );
  }
  for (const em of emails) {
    const safe = escapeSqlString(em);
    queries.push(
      qboQuery<{ Customer?: any[] }>(
        `SELECT ${CUSTOMER_COLS} FROM Customer WHERE PrimaryEmailAddr = '${safe}' MAXRESULTS 10`,
      ).catch(() => ({ Customer: [] })),
    );
  }

  const results = await Promise.all(queries);
  const byId = new Map<string, any>();
  for (const r of results) for (const c of r.Customer ?? []) byId.set(String(c.Id), c);

  // Fallback: if targeted name queries yielded nothing, page through customers
  // and filter locally on the head token so suggestions still surface.
  if (byId.size === 0 && head) {
    try {
      const fallback = await clientSideCustomerSearch(head, 25);
      for (const c of fallback) byId.set(String(c.Id), c);
    } catch (_) { /* best-effort */ }
  }

  const orgTokens = new Set(tokens);
  const scored = Array.from(byId.values())
    .map((c) => {
      const nm = normalizeName(c.DisplayName ?? c.CompanyName ?? "");
      const cTokens = new Set(nm.split(" "));
      let overlap = 0;
      for (const t of orgTokens) if (cTokens.has(t)) overlap++;
      const nameScore = orgTokens.size === 0 ? 0 : overlap / orgTokens.size;
      const custEmail = (c.PrimaryEmailAddr?.Address ?? "").trim().toLowerCase();
      const emailMatch = custEmail && emails.has(custEmail);
      const score = emailMatch ? 1 : nameScore;
      return { c, score, emailMatch };
    })
    .filter((s) => s.emailMatch || s.score >= 0.4 || normalizeName(s.c.DisplayName ?? "") === norm)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ c, score, emailMatch }) => ({
      id: String(c.Id),
      display_name: c.DisplayName ?? c.CompanyName ?? "",
      email: c.PrimaryEmailAddr?.Address ?? null,
      balance: c.Balance != null ? Number(c.Balance) : 0,
      score: Math.round(score * 100),
      matched_by: emailMatch ? "email" : "name",
    }));

  return { suggestions: scored };
}

async function createAction(body: {
  crm_organization_id: string;
  display_name?: string;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  billing_address?: {
    line1?: string | null;
    city?: string | null;
    region?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
}) {
  if (!body.crm_organization_id) throw new Error("crm_organization_id required");
  const sb = admin();
  const { data: org, error } = await sb
    .from("crm_organizations")
    .select("id, name, website, phone, address")
    .eq("id", body.crm_organization_id)
    .maybeSingle();
  if (error || !org) throw new Error(error?.message ?? "Organization not found");

  const displayName = (body.display_name ?? org.name)?.trim();
  if (!displayName) throw new Error("display_name required");

  const payload: Record<string, unknown> = {
    DisplayName: displayName,
    CompanyName: body.company_name ?? displayName,
  };
  const email = body.email?.trim();
  if (email) payload.PrimaryEmailAddr = { Address: email };
  const phone = body.phone?.trim() ?? org.phone?.trim();
  if (phone) payload.PrimaryPhone = { FreeFormNumber: phone };
  const website = body.website?.trim() ?? org.website?.trim();
  if (website) payload.WebAddr = { URI: website };
  const addr = body.billing_address ?? null;
  if (addr && (addr.line1 || addr.city || addr.region || addr.postal_code || addr.country)) {
    payload.BillAddr = {
      Line1: addr.line1 ?? undefined,
      City: addr.city ?? undefined,
      CountrySubDivisionCode: addr.region ?? undefined,
      PostalCode: addr.postal_code ?? undefined,
      Country: addr.country ?? undefined,
    };
  } else if (org.address) {
    payload.BillAddr = { Line1: org.address };
  }

  let created: any;
  try {
    const res = await qbo<{ Customer: any }>(`/customer`, "POST", payload);
    created = res.Customer;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/Duplicate Name Exists Error|Another customer.*already exists/i.test(msg)) {
      throw new Error(
        `A QuickBooks customer named "${displayName}" already exists. Use Search to link it instead.`,
      );
    }
    throw e;
  }

  const activity = await fetchCustomerActivity(String(created.Id)).catch(() => ({
    last_invoice_date: null,
    last_payment_date: null,
    active_within_two_years: false,
  }));
  const patch = {
    ...pickCustomerFields(created),
    qbo_active: activity.active_within_two_years,
    qbo_last_invoice_date: activity.last_invoice_date,
    qbo_last_payment_date: activity.last_payment_date,
  };
  const { error: uErr } = await sb
    .from("crm_organizations")
    .update(patch)
    .eq("id", body.crm_organization_id);
  if (uErr) throw new Error(uErr.message);

  return { ok: true, qbo_customer_id: String(created.Id), ...patch };
}

async function linkAction(body: { crm_organization_id: string; qbo_customer_id: string }) {
  if (!body.crm_organization_id || !body.qbo_customer_id) {
    throw new Error("crm_organization_id and qbo_customer_id required");
  }
  const customer = await fetchCustomerById(body.qbo_customer_id);
  const activity = await fetchCustomerActivity(body.qbo_customer_id).catch(() => ({
    last_invoice_date: null,
    last_payment_date: null,
    active_within_two_years: false,
  }));

  const patch = {
    ...pickCustomerFields(customer),
    qbo_active: activity.active_within_two_years,
    qbo_last_invoice_date: activity.last_invoice_date,
    qbo_last_payment_date: activity.last_payment_date,
  };

  const { error } = await admin()
    .from("crm_organizations")
    .update(patch)
    .eq("id", body.crm_organization_id);
  if (error) throw new Error(error.message);

  return { ok: true, ...patch };
}

async function unlinkAction(body: { crm_organization_id: string }) {
  if (!body.crm_organization_id) throw new Error("crm_organization_id required");
  const { error } = await admin()
    .from("crm_organizations")
    .update({
      qbo_customer_id: null,
      qbo_customer_name: null,
      qbo_sync_token: null,
      qbo_balance: null,
      qbo_balance_with_jobs: null,
      qbo_currency: null,
      qbo_active: null,
      qbo_last_invoice_date: null,
      qbo_last_payment_date: null,
      qbo_balance_refreshed_at: null,
      qbo_sync_error: null,
    })
    .eq("id", body.crm_organization_id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function refreshOneAction(body: { crm_organization_id: string }) {
  if (!body.crm_organization_id) throw new Error("crm_organization_id required");
  const sb = admin();
  const { data: org, error } = await sb
    .from("crm_organizations")
    .select("id, qbo_customer_id")
    .eq("id", body.crm_organization_id)
    .maybeSingle();
  if (error || !org) throw new Error(error?.message ?? "Organization not found");
  if (!org.qbo_customer_id) throw new Error("Organization is not linked to QBO");

  try {
    const customer = await fetchCustomerById(org.qbo_customer_id);
    const activity = await fetchCustomerActivity(org.qbo_customer_id);
    const patch = {
      ...pickCustomerFields(customer),
      qbo_active: activity.active_within_two_years,
      qbo_last_invoice_date: activity.last_invoice_date,
      qbo_last_payment_date: activity.last_payment_date,
    };
    const { error: uErr } = await sb.from("crm_organizations").update(patch).eq("id", org.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true, ...patch };
  } catch (e: any) {
    await sb
      .from("crm_organizations")
      .update({ qbo_sync_error: e.message?.slice(0, 1000) ?? "unknown" })
      .eq("id", org.id);
    throw e;
  }
}

async function refreshBalancesAction(body: { only_active?: boolean }) {
  const runId = await startRun("customer_refresh");
  try {
    const sb = admin();
    let q = sb
      .from("crm_organizations")
      .select("id, qbo_customer_id, qbo_active")
      .not("qbo_customer_id", "is", null);
    if (body.only_active) q = q.eq("qbo_active", true);
    const { data: orgs, error } = await q;
    if (error) throw new Error(error.message);

    let updated = 0;
    let errors = 0;
    const results: any[] = [];

    for (const org of orgs ?? []) {
      try {
        const customer = await fetchCustomerById(org.qbo_customer_id!);
        const activity = await fetchCustomerActivity(org.qbo_customer_id!);
        const patch = {
          ...pickCustomerFields(customer),
          qbo_active: activity.active_within_two_years,
          qbo_last_invoice_date: activity.last_invoice_date,
          qbo_last_payment_date: activity.last_payment_date,
        };
        await sb.from("crm_organizations").update(patch).eq("id", org.id);
        updated++;
        results.push({ id: org.id, status: "ok", balance: patch.qbo_balance });
      } catch (e: any) {
        errors++;
        await sb
          .from("crm_organizations")
          .update({ qbo_sync_error: e.message?.slice(0, 1000) ?? "unknown" })
          .eq("id", org.id);
        results.push({ id: org.id, status: "error", error: e.message });
      }
    }

    await finishRun(runId, {
      status: errors === 0 ? "success" : "error",
      updated_count: updated,
      error_count: errors,
      detail: { results: results.slice(0, 200) },
    });

    return { updated, errors, total: (orgs ?? []).length };
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
    await authorize(req);
    assertQboConfigured();

    const body = await req.json().catch(() => ({} as any));
    const action = body.action as string;
    let result: unknown;

    switch (action) {
      case "search":            result = await searchAction(body); break;
      case "suggest":           result = await suggestAction(body); break;
      case "create":            result = await createAction(body); break;
      case "link":              result = await linkAction(body); break;
      case "unlink":            result = await unlinkAction(body); break;
      case "refresh-one":       result = await refreshOneAction(body); break;
      case "refresh-balances":  result = await refreshBalancesAction(body); break;
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
