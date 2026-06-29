// migrate-helper — TEMPORARY credential broker for the one-time DB migration off Lovable Cloud.
//
// WHAT IT IS: a tiny edge function deployed INSIDE the Lovable Cloud project (the migration
// SOURCE). Lovable injects SUPABASE_DB_URL + SUPABASE_SERVICE_ROLE_KEY into every edge function;
// this just hands them back, gated by a one-time secret header, so our local exporter can connect
// to the source database directly. The function never touches the database itself.
//
// HOW TO DEPLOY (Lovable quirk — you cannot `supabase functions deploy` against Lovable Cloud):
//   1. Replace ACCESS_KEY below with a long random string:  openssl rand -hex 24
//   2. In Lovable's chat, ask it to create + deploy an edge function named "migrate-helper"
//      and paste this file as its contents.
//   3. Copy the deployed function URL from Cloud → Edge functions.
//
// SECURITY: this exposes privileged credentials behind a single header. Deploy it ONLY during the
// migration window and DELETE it immediately after. Responses are no-store.

const ACCESS_KEY = "REPLACE_WITH_A_LONG_RANDOM_ACCESS_KEY"; // openssl rand -hex 24

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* empty body is allowed */ }

  // Health check — never returns secrets, no access key required.
  if (body.action === "ping") return json({ ok: true, ts: new Date().toISOString() }, 200);

  const provided = req.headers.get("x-access-key") ?? "";
  if (
    !ACCESS_KEY ||
    ACCESS_KEY === "REPLACE_WITH_A_LONG_RANDOM_ACCESS_KEY" ||
    provided !== ACCESS_KEY
  ) {
    return json({ error: "unauthorized" }, 401);
  }

  const db_url = Deno.env.get("SUPABASE_DB_URL");
  const service_role_key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase_url = Deno.env.get("SUPABASE_URL");
  if (!db_url || !service_role_key || !supabase_url) {
    return json({
      error: "missing_env",
      have: { db_url: !!db_url, service_role_key: !!service_role_key, supabase_url: !!supabase_url },
    }, 500);
  }

  return json({ db_url, service_role_key, supabase_url }, 200);
});

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
