import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Simple in-memory rate limiter (per-instance)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(keyId: string, limitPerMin = 60): boolean {
  const now = Date.now();
  const b = rateBuckets.get(keyId);
  if (!b || b.resetAt < now) {
    rateBuckets.set(keyId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  b.count += 1;
  return b.count <= limitPerMin;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    null;
  const userAgent = req.headers.get("user-agent") || null;

  const logUsage = (
    apiKeyId: string | null,
    statusCode: number,
    clientCode: string | null,
    errorMessage: string | null,
  ) => {
    // Fire-and-forget
    supabase
      .from("api_key_usage_log")
      .insert({
        api_key_id: apiKeyId,
        endpoint: "client-lookup",
        client_code: clientCode,
        status_code: statusCode,
        ip,
        user_agent: userAgent,
        error_message: errorMessage,
      })
      .then(() => {});
  };

  try {
    if (req.method !== "POST") {
      logUsage(null, 405, null, "method_not_allowed");
      return json(405, { error: "Method not allowed. Use POST." });
    }

    // Extract API key from Authorization: Bearer ... or X-API-Key
    const authHeader = req.headers.get("authorization") || "";
    const xApiKey = req.headers.get("x-api-key") || "";
    let rawKey = "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      rawKey = authHeader.slice(7).trim();
    } else if (xApiKey) {
      rawKey = xApiKey.trim();
    }

    if (!rawKey || !rawKey.startsWith("lnn_")) {
      logUsage(null, 401, null, "missing_or_malformed_key");
      return json(401, { error: "Missing or invalid API key" });
    }

    const keyHash = await sha256Hex(rawKey);
    const { data: apiKey, error: keyErr } = await supabase
      .from("api_keys")
      .select("id, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (keyErr || !apiKey) {
      logUsage(null, 401, null, "key_not_found");
      return json(401, { error: "Invalid API key" });
    }
    if (apiKey.revoked_at) {
      logUsage(apiKey.id, 401, null, "key_revoked");
      return json(401, { error: "API key has been revoked" });
    }

    if (!rateLimit(apiKey.id)) {
      logUsage(apiKey.id, 429, null, "rate_limited");
      return json(429, { error: "Rate limit exceeded (60 requests/minute)" });
    }

    let body: { client_code?: unknown };
    try {
      body = await req.json();
    } catch {
      logUsage(apiKey.id, 400, null, "invalid_json");
      return json(400, { error: "Invalid JSON body" });
    }

    const clientCode =
      typeof body.client_code === "string" ? body.client_code.trim() : "";
    if (!clientCode) {
      logUsage(apiKey.id, 400, null, "missing_client_code");
      return json(400, { error: "client_code is required" });
    }

    // Update last_used_at (fire-and-forget)
    supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", apiKey.id)
      .then(() => {});

    // Look up org (case-insensitive)
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, client_code, created_at, sales_rep_user_id, stat_email_suppress")
      .ilike("client_code", clientCode)
      .maybeSingle();

    if (orgErr) {
      logUsage(apiKey.id, 500, clientCode, orgErr.message);
      return json(500, { error: "Database error" });
    }

    if (!org) {
      logUsage(apiKey.id, 200, clientCode, null);
      return json(200, { exists: false });
    }

    // Get all users in this org with their emails and notification prefs
    const { data: members, error: memErr } = await supabase
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", org.id);

    if (memErr) {
      logUsage(apiKey.id, 500, clientCode, memErr.message);
      return json(500, { error: "Database error" });
    }

    const userIds = (members || []).map((m) => m.user_id);
    let statContacts: string[] = [];
    let creativeContacts: string[] = [];

    if (userIds.length > 0) {
      const [{ data: profiles }, { data: prefs }] = await Promise.all([
        supabase.from("profiles").select("id, email").in("id", userIds),
        supabase
          .from("user_notification_preferences")
          .select("user_id, exclude_from_stat_emails, exclude_from_creative_emails")
          .in("user_id", userIds),
      ]);

      const prefsMap = new Map<string, { stat: boolean; creative: boolean }>();
      for (const p of prefs || []) {
        prefsMap.set(p.user_id, {
          stat: !!p.exclude_from_stat_emails,
          creative: !!p.exclude_from_creative_emails,
        });
      }

      for (const p of profiles || []) {
        if (!p.email) continue;
        const pref = prefsMap.get(p.id) || { stat: false, creative: false };
        if (!pref.stat) statContacts.push(p.email);
        if (!pref.creative) creativeContacts.push(p.email);
      }
    }

    // Org-level hard suppression: drop any address the admin has listed,
    // regardless of membership/prefs (catch-all for leaked/non-member emails).
    const suppressList = ((org as { stat_email_suppress?: string[] }).stat_email_suppress ?? [])
      .map((e) => e.toLowerCase().trim())
      .filter(Boolean);
    if (suppressList.length > 0) {
      const suppress = new Set(suppressList);
      statContacts = statContacts.filter((e) => !suppress.has(e.toLowerCase().trim()));
    }

    // Look up the assigned Sales Rep (admin/super_admin user) for this org
    let salesRepName: string | null = null;
    let salesRepEmail: string | null = null;
    if (org.sales_rep_user_id) {
      const { data: rep } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", org.sales_rep_user_id)
        .maybeSingle();
      if (rep) {
        salesRepName = rep.full_name ?? null;
        salesRepEmail = rep.email ?? null;
      }
    }

    logUsage(apiKey.id, 200, clientCode, null);
    return json(200, {
      exists: true,
      client_name: org.name,
      client_code: org.client_code,
      created_at: org.created_at,
      stat_contacts: statContacts.join(", "),
      creative_contacts: creativeContacts.join(", "),
      sales_rep_name: salesRepName,
      sales_rep_email: salesRepEmail,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    console.error("client-lookup error:", msg);
    return json(500, { error: "Internal server error" });
  }
});
