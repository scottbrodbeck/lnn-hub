// QuickBooks Online OAuth flow.
// - GET ?action=start  → returns { auth_url } to redirect the admin to Intuit
// - GET ?code=...&state=...&realmId=...  → Intuit callback; exchanges code for
//   tokens, persists them to qbo_auth_state, then redirects back to the app.
//
// This function is admin-gated for the `start` action (verifies the caller's
// JWT and checks they have admin/super_admin role). The `callback` action is
// invoked by Intuit's browser redirect (no auth header) and is protected by
// the random `state` value we stored when start was called.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const QBO_CLIENT_ID = Deno.env.get("QBO_CLIENT_ID")!;
const QBO_CLIENT_SECRET = Deno.env.get("QBO_CLIENT_SECRET")!;
const QBO_ENVIRONMENT = (Deno.env.get("QBO_ENVIRONMENT") ?? "production").toLowerCase();

// Where Intuit will redirect the browser after the user approves the app.
// This URL MUST be registered EXACTLY in your Intuit Developer app's
// "Redirect URIs" list for the production keys.
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/qbo-oauth/callback`;

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>QuickBooks</title>
<style>body{font:14px -apple-system,Segoe UI,Roboto,sans-serif;padding:40px;max-width:560px;margin:auto;color:#111}h1{font-size:18px}a{color:#0a64ff}</style>
${body}`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = admin();
  const { data: roles } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const ok = (roles ?? []).some((r: { role: string }) =>
    r.role === "admin" || r.role === "super_admin"
  );
  if (!ok) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return { userId: userData.user.id };
}

async function handleStart(req: Request, returnTo: string | null): Promise<Response> {
  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  const stateBytes = new Uint8Array(24);
  crypto.getRandomValues(stateBytes);
  const stateRand = Array.from(stateBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  // Pack the optional returnTo into the state so we can use it in the callback.
  const statePayload = { r: stateRand, t: returnTo ?? null };
  const state = btoa(JSON.stringify(statePayload));

  const sb = admin();
  const { error } = await sb
    .from("qbo_auth_state")
    .upsert({
      id: true,
      oauth_state: stateRand,
      oauth_state_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (error) {
    return new Response(JSON.stringify({ error: `state save failed: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", QBO_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", state);

  return new Response(JSON.stringify({ auth_url: url.toString(), redirect_uri: REDIRECT_URI }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return html(`<h1>QuickBooks connection cancelled</h1><p>${errorParam}</p><p>You can close this tab and try again from settings.</p>`, 400);
  }
  if (!code || !stateRaw || !realmId) {
    return html(`<h1>Missing parameters</h1><p>Expected code, state and realmId from Intuit.</p>`, 400);
  }

  let stateRand = "";
  let returnTo: string | null = null;
  try {
    const decoded = JSON.parse(atob(stateRaw));
    stateRand = String(decoded.r ?? "");
    returnTo = decoded.t ?? null;
  } catch {
    return html(`<h1>Invalid state</h1>`, 400);
  }

  const sb = admin();
  const { data: stateRow } = await sb
    .from("qbo_auth_state")
    .select("oauth_state, oauth_state_expires_at")
    .eq("id", true)
    .maybeSingle();

  if (!stateRow?.oauth_state || stateRow.oauth_state !== stateRand) {
    return html(`<h1>State mismatch</h1><p>The OAuth state did not match. Please restart the connection from settings.</p>`, 400);
  }
  if (stateRow.oauth_state_expires_at && new Date(stateRow.oauth_state_expires_at) < new Date()) {
    return html(`<h1>Link expired</h1><p>The connect link has expired. Please restart from settings.</p>`, 400);
  }

  // Exchange the authorization code for tokens.
  const basic = btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) {
    return html(`<h1>Token exchange failed</h1><pre>${tokenText.replace(/</g, "&lt;")}</pre>`, 502);
  }
  const tokens = JSON.parse(tokenText) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };

  const now = Date.now();
  const { error: saveErr } = await sb
    .from("qbo_auth_state")
    .upsert({
      id: true,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
      refresh_token: tokens.refresh_token,
      refresh_token_expires_at: new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString(),
      realm_id: realmId,
      environment: QBO_ENVIRONMENT,
      oauth_state: null,
      oauth_state_expires_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (saveErr) {
    return html(`<h1>Failed to save tokens</h1><p>${saveErr.message}</p>`, 500);
  }

  const back = returnTo && /^https?:\/\//.test(returnTo) ? returnTo : null;
  if (back) {
    const r = new URL(back);
    r.searchParams.set("qbo_connected", "1");
    return new Response(null, { status: 302, headers: { Location: r.toString() } });
  }
  return html(
    `<h1>QuickBooks connected</h1>
<p>Realm <code>${realmId}</code> linked in <strong>${QBO_ENVIRONMENT}</strong> mode.</p>
<p>You can close this tab and return to the app.</p>`,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop() ?? "";

  try {
    if (path === "callback" || url.searchParams.has("code")) {
      return await handleCallback(req);
    }
    if (url.searchParams.get("action") === "start" || path === "start") {
      const returnTo = url.searchParams.get("return_to");
      return await handleStart(req, returnTo);
    }
    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
