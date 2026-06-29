// QBO diagnostics edge function (v2)
// Runs read-only and optional write tests against the connected QuickBooks company.
// Actions: ping, company-info, list-accounts, list-customers, list-items,
//          list-invoices, token-refresh, query, create-test-customer,
//          create-test-item, create-test-invoice, delete-test-entity, env-info
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { qbo, qboQuery, getAccessToken, assertQboConfigured } from "../_shared/qbo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ ok: false, error: message, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

async function timed<T>(fn: () => Promise<T>) {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { ok: true as const, ms: Date.now() - t0, result };
  } catch (e) {
    return { ok: false as const, ms: Date.now() - t0, error: (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await requireAdmin(req);
  } catch (e) {
    return fail((e as Error).message, 401);
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const action = payload?.action as string | undefined;
  if (!action) return fail("action required");

  try {
    assertQboConfigured();
  } catch (e) {
    return fail((e as Error).message, 400, { code: "not_configured" });
  }

  const env = (Deno.env.get("QBO_ENVIRONMENT") ?? "production").toLowerCase();
  const realm = Deno.env.get("QBO_REALM_ID");

  switch (action) {
    case "env-info": {
      const sb = createClient(SUPABASE_URL, SERVICE, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: state } = await sb
        .from("qbo_auth_state")
        .select("access_token_expires_at,refresh_token_expires_at,realm_id,environment,updated_at")
        .eq("id", true)
        .maybeSingle();
      return ok({ ok: true, environment: env, realm_id: realm, state });
    }

    case "ping": {
      const r = await timed(() => qboQuery<any>("SELECT COUNT(*) FROM Customer"));
      return ok({ ...r, environment: env });
    }

    case "token-refresh": {
      const r = await timed(() => getAccessToken());
      return ok({
        ok: r.ok,
        ms: r.ms,
        token_present: r.ok && typeof r.result === "string" && r.result.length > 0,
        error: r.ok ? undefined : r.error,
      });
    }

    case "company-info": {
      const r = await timed(() => qbo<any>(`/companyinfo/${realm}`));
      if (!r.ok) return ok(r);
      const ci = r.result?.CompanyInfo;
      return ok({
        ok: true,
        ms: r.ms,
        company: {
          name: ci?.CompanyName,
          legal_name: ci?.LegalName,
          country: ci?.Country,
          email: ci?.Email?.Address,
          fiscal_year_start: ci?.FiscalYearStartMonth,
        },
      });
    }

    case "list-accounts": {
      const r = await timed(() =>
        qboQuery<any>(
          "SELECT Id, Name, AccountType, AccountSubType, Classification FROM Account WHERE Active = true MAXRESULTS 50",
        ),
      );
      if (!r.ok) return ok(r);
      return ok({ ok: true, ms: r.ms, accounts: r.result?.Account ?? [] });
    }

    case "list-customers": {
      const r = await timed(() =>
        qboQuery<any>(
          "SELECT Id, DisplayName, PrimaryEmailAddr, Balance, Active FROM Customer MAXRESULTS 25",
        ),
      );
      if (!r.ok) return ok(r);
      return ok({ ok: true, ms: r.ms, customers: r.result?.Customer ?? [] });
    }

    case "list-items": {
      const r = await timed(() =>
        qboQuery<any>(
          "SELECT Id, Name, Type, UnitPrice, Active, IncomeAccountRef FROM Item MAXRESULTS 25",
        ),
      );
      if (!r.ok) return ok(r);
      return ok({ ok: true, ms: r.ms, items: r.result?.Item ?? [] });
    }

    case "list-invoices": {
      const r = await timed(() =>
        qboQuery<any>(
          "SELECT Id, DocNumber, TxnDate, DueDate, TotalAmt, Balance, CustomerRef FROM Invoice ORDERBY TxnDate DESC MAXRESULTS 25",
        ),
      );
      if (!r.ok) return ok(r);
      return ok({ ok: true, ms: r.ms, invoices: r.result?.Invoice ?? [] });
    }

    case "query": {
      const sql = String(payload?.sql ?? "").trim();
      if (!sql) return fail("sql required");
      // Allow SELECT only
      if (!/^select\b/i.test(sql)) return fail("only SELECT statements are allowed");
      const r = await timed(() => qboQuery<any>(sql));
      return ok({ ...r });
    }

    case "create-test-customer": {
      const name = `LNN Test ${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}`;
      const r = await timed(() =>
        qbo<any>("/customer", "POST", {
          DisplayName: name,
          CompanyName: name,
          Notes: "Created by QBO diagnostics tester",
        }),
      );
      if (!r.ok) return ok(r);
      const c = r.result?.Customer;
      return ok({
        ok: true,
        ms: r.ms,
        entity: { type: "Customer", Id: c?.Id, SyncToken: c?.SyncToken, DisplayName: c?.DisplayName },
      });
    }

    case "create-test-item": {
      const accountId = String(payload?.income_account_id ?? "").trim();
      if (!accountId) return fail("income_account_id required");
      const name = `LNN Test Item ${Date.now()}`;
      const r = await timed(() =>
        qbo<any>("/item", "POST", {
          Name: name,
          Type: "Service",
          UnitPrice: 9.99,
          IncomeAccountRef: { value: accountId },
        }),
      );
      if (!r.ok) return ok(r);
      const it = r.result?.Item;
      return ok({
        ok: true,
        ms: r.ms,
        entity: { type: "Item", Id: it?.Id, SyncToken: it?.SyncToken, Name: it?.Name },
      });
    }

    case "create-test-invoice": {
      const customerId = String(payload?.customer_id ?? "").trim();
      const itemId = String(payload?.item_id ?? "").trim();
      if (!customerId || !itemId) return fail("customer_id and item_id required");
      const r = await timed(() =>
        qbo<any>("/invoice", "POST", {
          CustomerRef: { value: customerId },
          Line: [
            {
              DetailType: "SalesItemLineDetail",
              Amount: 9.99,
              Description: "Diagnostics test line",
              SalesItemLineDetail: {
                ItemRef: { value: itemId },
                Qty: 1,
                UnitPrice: 9.99,
              },
            },
          ],
        }),
      );
      if (!r.ok) return ok(r);
      const inv = r.result?.Invoice;
      return ok({
        ok: true,
        ms: r.ms,
        entity: {
          type: "Invoice",
          Id: inv?.Id,
          SyncToken: inv?.SyncToken,
          DocNumber: inv?.DocNumber,
          TotalAmt: inv?.TotalAmt,
        },
      });
    }

    case "delete-test-entity": {
      // Voids invoices, deletes customers/items
      const type = String(payload?.entity_type ?? "");
      const id = String(payload?.entity_id ?? "");
      const syncToken = String(payload?.sync_token ?? "0");
      if (!type || !id) return fail("entity_type and entity_id required");
      let endpoint = "";
      let body: any = { Id: id, SyncToken: syncToken };
      if (type === "Invoice") {
        endpoint = "/invoice?operation=void";
      } else if (type === "Customer") {
        endpoint = "/customer?operation=delete";
        body.sparse = true;
        body.Active = false;
      } else if (type === "Item") {
        endpoint = "/item?operation=delete";
        body.sparse = true;
        body.Active = false;
      } else {
        return fail(`unsupported entity_type: ${type}`);
      }
      const r = await timed(() => qbo<any>(endpoint, "POST", body));
      return ok({ ...r });
    }

    default:
      return fail(`unknown action: ${action}`);
  }
});
