// Shared QuickBooks Online client for edge functions.
// - Manages access-token caching/refresh in qbo_auth_state
// - Provides qbo() / qboQuery() helpers mirroring the reference demo

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const QBO_CLIENT_ID = Deno.env.get("QBO_CLIENT_ID");
const QBO_CLIENT_SECRET = Deno.env.get("QBO_CLIENT_SECRET");
const QBO_REFRESH_TOKEN_SEED = Deno.env.get("QBO_REFRESH_TOKEN");
const QBO_REALM_ID = Deno.env.get("QBO_REALM_ID");
const QBO_ENVIRONMENT = (Deno.env.get("QBO_ENVIRONMENT") ?? "production").toLowerCase();

const MINOR_VERSION = 75;

const BASE_URL = QBO_ENVIRONMENT === "sandbox"
  ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}`
  : `https://quickbooks.api.intuit.com/v3/company/${QBO_REALM_ID}`;

const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function assertQboConfigured() {
  const missing: string[] = [];
  if (!QBO_CLIENT_ID) missing.push("QBO_CLIENT_ID");
  if (!QBO_CLIENT_SECRET) missing.push("QBO_CLIENT_SECRET");
  if (!QBO_REFRESH_TOKEN_SEED) missing.push("QBO_REFRESH_TOKEN");
  if (!QBO_REALM_ID) missing.push("QBO_REALM_ID");
  if (missing.length) {
    throw new Error(`QBO not configured: missing ${missing.join(", ")}`);
  }
}

async function loadState() {
  const sb = admin();
  const { data, error } = await sb
    .from("qbo_auth_state")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`qbo_auth_state load failed: ${error.message}`);
  return data;
}

async function saveState(patch: Record<string, unknown>) {
  const sb = admin();
  const { error } = await sb
    .from("qbo_auth_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) throw new Error(`qbo_auth_state save failed: ${error.message}`);
}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
}> {
  const basic = btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`QBO token refresh failed [${res.status}]: ${text}`);
  }
  return JSON.parse(text);
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  assertQboConfigured();
  const state = await loadState();
  const now = Date.now();
  const expiresAt = state?.access_token_expires_at
    ? new Date(state.access_token_expires_at).getTime()
    : 0;

  // Reuse cached token if it has > 5 min remaining (unless forced)
  if (!forceRefresh && state?.access_token && expiresAt - now > 5 * 60 * 1000) {
    return state.access_token as string;
  }

  // Use stored refresh token, falling back to the seed env var on first run
  const refreshToken = (state?.refresh_token as string | null) ?? QBO_REFRESH_TOKEN_SEED!;
  const refreshed = await refreshAccessToken(refreshToken);

  const accessExpires = new Date(now + refreshed.expires_in * 1000).toISOString();
  const refreshExpires = new Date(now + refreshed.x_refresh_token_expires_in * 1000).toISOString();

  await saveState({
    access_token: refreshed.access_token,
    access_token_expires_at: accessExpires,
    refresh_token: refreshed.refresh_token,
    refresh_token_expires_at: refreshExpires,
    realm_id: QBO_REALM_ID,
    environment: QBO_ENVIRONMENT,
  });

  return refreshed.access_token;
}

export async function qbo<T = any>(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body: unknown = null,
  retries = 2,
): Promise<T> {
  const token = await getAccessToken();
  const sep = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${sep}minorversion=${MINOR_VERSION}`;
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);

  // 401 — token rejected by QBO; force a refresh and retry once.
  if (res.status === 401 && retries > 0) {
    await res.body?.cancel();
    await getAccessToken(true);
    return qbo<T>(endpoint, method, body, retries - 1);
  }

  // 429 — rate limited; back off and retry.
  if (res.status === 429 && retries > 0) {
    await res.body?.cancel();
    const wait = (3 - retries) * 2000; // 2s, then 4s
    await new Promise((r) => setTimeout(r, wait));
    return qbo<T>(endpoint, method, body, retries - 1);
  }

  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const e = data?.Fault?.Error?.[0];
    throw new Error(
      `QBO ${res.status} ${method} ${endpoint}: ${e?.Message || "Unknown"} — ${e?.Detail || JSON.stringify(data).slice(0, 500)}`,
    );
  }
  return data as T;
}

export async function qboQuery<T = any>(sql: string): Promise<T> {
  const res = await qbo<{ QueryResponse: T }>(
    `/query?query=${encodeURIComponent(sql)}`,
  );
  return res.QueryResponse;
}

// Escape characters that have meaning in QBO QL string literals.
// Order matters: backslash first so subsequent escapes aren't double-processed.
export function escapeSqlString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

// Normalize raw user input before building a QBO query: strip colons (QBO
// rejects them in DisplayName), convert smart quotes to straight, swap `&`
// for `and` (LIKE quirks), and collapse whitespace. Apply BEFORE escapeSqlString.
export function normalizeSearchTerm(s: string): string {
  if (!s) return "";
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/:/g, " ")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize a name for fuzzy matching: lowercase, strip punctuation, collapse spaces.
export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
