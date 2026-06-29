import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ---------- Supabase (service role; redaction enforced in handlers) ----------
function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ---------- Redaction ----------
const SENSITIVE_KEYS =
  /(password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|webhook[_-]?secret|client[_-]?secret|service[_-]?role|jwks|app_password)/i;
const PII_KEYS = /^(email|phone|phone_number|mobile|cell|fax)$/i;

function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k) || PII_KEYS.test(k)) continue;
      out[k] = redact(v);
    }
    return out as unknown as T;
  }
  return value;
}

function asText(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(redact(data), null, 2) },
    ],
  };
}

function asError(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
}

function clampLimit(n: number | undefined, def = 25, max = 100) {
  const v = Number.isFinite(n) ? Number(n) : def;
  return Math.max(1, Math.min(max, v));
}

const DISABLED_HUBSPOT = {
  content: [
    {
      type: "text" as const,
      text:
        "Disabled: HubSpot CRM data (organizations, contacts, deals, activities) is not exposed via MCP yet.",
    },
  ],
};

// ---------- MCP server ----------
const mcpServer = new McpServer({
  name: "lnn-content-mcp",
  version: "1.0.0",
});

// ============================================================
// ADMIN / CONTENT
// ============================================================

mcpServer.tool("list_organizations", {
  description: "List organizations (admin dashboard). Optional name search.",
  inputSchema: {
    type: "object",
    properties: {
      search: { type: "string", description: "Substring match on name" },
      limit: { type: "number" },
    },
  },
  handler: async (args: { search?: string; limit?: number }) => {
    let q = sb().from("organizations").select("*").order("name");
    if (args.search) q = q.ilike("name", `%${args.search}%`);
    const { data, error } = await q.limit(clampLimit(args.limit));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("list_sites", {
  description: "List WordPress sites configured in the platform.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const { data, error } = await sb()
      .from("sites")
      .select("*")
      .order("name");
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("list_posts", {
  description:
    "List posts. Filter by org_id, site_id (wordpress_site_id), status, or 'since' (ISO date).",
  inputSchema: {
    type: "object",
    properties: {
      org_id: { type: "string" },
      site_id: { type: "string" },
      status: { type: "string" },
      since: { type: "string", description: "ISO timestamp lower bound on created_at" },
      limit: { type: "number" },
    },
  },
  handler: async (args: {
    org_id?: string;
    site_id?: string;
    status?: string;
    since?: string;
    limit?: number;
  }) => {
    let q = sb()
      .from("posts")
      .select(
        "id, title, status, content_category, created_at, updated_at, published_at, scheduled_date, organization_id, wordpress_site_id, wordpress_post_id, wordpress_url, author_id",
      )
      .order("created_at", { ascending: false });
    if (args.org_id) q = q.eq("organization_id", args.org_id);
    if (args.site_id) q = q.eq("wordpress_site_id", args.site_id);
    if (args.status) q = q.eq("status", args.status);
    if (args.since) q = q.gte("created_at", args.since);
    const { data, error } = await q.limit(clampLimit(args.limit));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("get_post", {
  description: "Fetch a single post by id with metadata.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  handler: async (args: { id: string }) => {
    const { data, error } = await sb()
      .from("posts")
      .select("*")
      .eq("id", args.id)
      .maybeSingle();
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("list_assignments", {
  description:
    "List post assignments. Filter by org_id and date range (due_after / due_before, YYYY-MM-DD).",
  inputSchema: {
    type: "object",
    properties: {
      org_id: { type: "string" },
      due_after: { type: "string" },
      due_before: { type: "string" },
      status: { type: "string" },
      limit: { type: "number" },
    },
  },
  handler: async (args: {
    org_id?: string;
    due_after?: string;
    due_before?: string;
    status?: string;
    limit?: number;
  }) => {
    let q = sb()
      .from("post_assignments")
      .select("*")
      .order("due_date", { ascending: true });
    if (args.org_id) q = q.eq("organization_id", args.org_id);
    if (args.due_after) q = q.gte("due_date", args.due_after);
    if (args.due_before) q = q.lte("due_date", args.due_before);
    if (args.status) q = q.eq("status", args.status);
    const { data, error } = await q.limit(clampLimit(args.limit));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("list_email_blasts", {
  description: "List email blasts. Filter by org_id and 'since' (ISO date).",
  inputSchema: {
    type: "object",
    properties: {
      org_id: { type: "string" },
      since: { type: "string" },
      limit: { type: "number" },
    },
  },
  handler: async (args: { org_id?: string; since?: string; limit?: number }) => {
    let q = sb()
      .from("email_blasts")
      .select("*")
      .order("created_at", { ascending: false });
    if (args.org_id) q = q.eq("organization_id", args.org_id);
    if (args.since) q = q.gte("created_at", args.since);
    const { data, error } = await q.limit(clampLimit(args.limit));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("list_email_sponsorships", {
  description: "List email sponsorships. Filter by org_id and 'since'.",
  inputSchema: {
    type: "object",
    properties: {
      org_id: { type: "string" },
      since: { type: "string" },
      limit: { type: "number" },
    },
  },
  handler: async (args: { org_id?: string; since?: string; limit?: number }) => {
    let q = sb()
      .from("email_sponsorships")
      .select("*")
      .order("created_at", { ascending: false });
    if (args.org_id) q = q.eq("organization_id", args.org_id);
    if (args.since) q = q.gte("created_at", args.since);
    const { data, error } = await q.limit(clampLimit(args.limit));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("list_display_campaigns", {
  description: "List display ad campaigns. Filter by org_id; active_only returns is_active=true campaigns whose end_date hasn't passed.",
  inputSchema: {
    type: "object",
    properties: {
      org_id: { type: "string" },
      active_only: { type: "boolean" },
      limit: { type: "number" },
    },
  },
  handler: async (args: {
    org_id?: string;
    active_only?: boolean;
    limit?: number;
  }) => {
    let q = sb()
      .from("display_ad_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (args.org_id) q = q.eq("organization_id", args.org_id);
    if (args.active_only) {
      const today = new Date().toISOString().slice(0, 10);
      q = q.eq("is_active", true).or(`end_date.is.null,end_date.gte.${today}`);
    }
    const { data, error } = await q.limit(clampLimit(args.limit));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("get_display_campaign_stats", {
  description: "Get a display ad campaign with its placements/stats by campaign id.",
  inputSchema: {
    type: "object",
    properties: { campaign_id: { type: "string" } },
    required: ["campaign_id"],
  },
  handler: async (args: { campaign_id: string }) => {
    const supa = sb();
    const [{ data: campaign, error: e1 }, { data: placements, error: e2 }] =
      await Promise.all([
        supa.from("display_ad_campaigns").select("*").eq("id", args.campaign_id).maybeSingle(),
        supa.from("display_ad_placements").select("*").eq("campaign_id", args.campaign_id),
      ]);
    if (e1) return asError(e1.message);
    if (e2) return asError(e2.message);
    return asText({ campaign, placements });
  },
});

mcpServer.tool("list_sponsors", {
  description: "List sponsors, optionally filtered by org_id.",
  inputSchema: {
    type: "object",
    properties: {
      org_id: { type: "string" },
      limit: { type: "number" },
    },
  },
  handler: async (args: { org_id?: string; limit?: number }) => {
    let q = sb().from("sponsors").select("*").order("name");
    if (args.org_id) q = q.eq("organization_id", args.org_id);
    const { data, error } = await q.limit(clampLimit(args.limit));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("list_users", {
  description:
    "List users with display name, role, and org memberships. Email and phone are NOT exposed.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number" } },
  },
  handler: async (args: { limit?: number }) => {
    const supa = sb();
    const lim = clampLimit(args.limit, 50, 200);
    const { data: profiles, error } = await supa
      .from("profiles")
      .select("id, full_name, created_at")
      .order("full_name")
      .limit(lim);
    if (error) return asError(error.message);
    const ids = (profiles ?? []).map((p) => p.id);
    if (ids.length === 0) return asText([]);
    const [{ data: roles }, { data: memberships }] = await Promise.all([
      supa.from("user_roles").select("user_id, role").in("user_id", ids),
      supa
        .from("user_organizations")
        .select("user_id, organization_id, is_primary, organizations(name)")
        .in("user_id", ids),
    ]);
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(String(r.role));
      rolesByUser.set(r.user_id, arr);
    }
    const orgsByUser = new Map<string, { id: string; name: string | null; primary: boolean }[]>();
    for (const m of memberships ?? []) {
      const arr = orgsByUser.get(m.user_id) ?? [];
      arr.push({
        id: m.organization_id,
        name: (m as any).organizations?.name ?? null,
        primary: !!m.is_primary,
      });
      orgsByUser.set(m.user_id, arr);
    }
    return asText(
      profiles!.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        created_at: p.created_at,
        roles: rolesByUser.get(p.id) ?? [],
        organizations: orgsByUser.get(p.id) ?? [],
      })),
    );
  },
});

mcpServer.tool("list_qa_issues", {
  description: "Recent QA checks; failed first when failed_only=true. Status values: 'pass' | 'fail'.",
  inputSchema: {
    type: "object",
    properties: {
      failed_only: { type: "boolean", description: "If true, returns only checks where status='fail'" },
      since: { type: "string" },
      limit: { type: "number" },
    },
  },
  handler: async (args: { failed_only?: boolean; since?: string; limit?: number }) => {
    let q = sb()
      .from("qa_checks")
      .select("*")
      .order("checked_at", { ascending: false, nullsFirst: false });
    if (args.failed_only) q = q.eq("status", "fail");
    if (args.since) q = q.gte("created_at", args.since);
    const { data, error } = await q.limit(clampLimit(args.limit, 25, 200));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("list_support_requests", {
  description: "List support / change requests. Filter by status and 'since'.",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string" },
      since: { type: "string" },
      limit: { type: "number" },
    },
  },
  handler: async (args: { status?: string; since?: string; limit?: number }) => {
    let q = sb()
      .from("support_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (args.status) q = q.eq("status", args.status);
    if (args.since) q = q.gte("created_at", args.since);
    const { data, error } = await q.limit(clampLimit(args.limit));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("get_admin_checklist", {
  description: "Today's admin daily checklist (or for a specific YYYY-MM-DD date).",
  inputSchema: {
    type: "object",
    properties: { date: { type: "string", description: "YYYY-MM-DD" } },
  },
  handler: async (args: { date?: string }) => {
    const date = args.date ?? new Date().toISOString().slice(0, 10);
    const { data, error } = await sb()
      .from("admin_daily_checklist")
      .select("*")
      .eq("checklist_date", date);
    if (error) return asError(error.message);
    return asText(data);
  },
});

// ============================================================
// SALES — products only
// ============================================================

mcpServer.tool("list_products", {
  description:
    "List products from the sales catalog. Filter by search, category, source, active_only.",
  inputSchema: {
    type: "object",
    properties: {
      search: { type: "string" },
      category: { type: "string" },
      source: { type: "string", description: "e.g. 'lnn_pricing_api' or 'manual'" },
      active_only: { type: "boolean" },
      limit: { type: "number" },
    },
  },
  handler: async (args: {
    search?: string;
    category?: string;
    source?: string;
    active_only?: boolean;
    limit?: number;
  }) => {
    let q = sb().from("crm_products").select("*").order("name");
    if (args.search) q = q.ilike("name", `%${args.search}%`);
    if (args.category) q = q.eq("category", args.category);
    if (args.source) q = q.eq("source", args.source);
    if (args.active_only) q = q.eq("is_active", true);
    const { data, error } = await q.limit(clampLimit(args.limit, 50, 200));
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("get_product", {
  description: "Fetch a single product by id.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  handler: async (args: { id: string }) => {
    const { data, error } = await sb()
      .from("crm_products")
      .select("*")
      .eq("id", args.id)
      .maybeSingle();
    if (error) return asError(error.message);
    return asText(data);
  },
});

mcpServer.tool("list_pipelines", {
  description: "List sales pipelines and their stages (structure only — no deal data).",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const supa = sb();
    const [{ data: pipelines, error: e1 }, { data: stages, error: e2 }] =
      await Promise.all([
        supa.from("crm_pipelines").select("id, name, is_default").order("name"),
        supa
          .from("crm_pipeline_stages")
          .select("id, pipeline_id, name, sort_order, win_probability, is_won, is_lost")
          .order("sort_order"),
      ]);
    if (e1) return asError(e1.message);
    if (e2) return asError(e2.message);
    const stagesByPipeline = new Map<string, unknown[]>();
    for (const s of stages ?? []) {
      const arr = stagesByPipeline.get(s.pipeline_id) ?? [];
      arr.push(s);
      stagesByPipeline.set(s.pipeline_id, arr);
    }
    return asText(
      (pipelines ?? []).map((p) => ({ ...p, stages: stagesByPipeline.get(p.id) ?? [] })),
    );
  },
});

mcpServer.tool("get_product_sync_status", {
  description: "Most recent product sync runs and their status.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number" } },
  },
  handler: async (args: { limit?: number }) => {
    const { data, error } = await sb()
      .from("crm_product_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(clampLimit(args.limit, 10, 50));
    if (error) return asError(error.message);
    return asText(data);
  },
});

// ============================================================
// HubSpot CRM — registered but disabled (future-enable)
// ============================================================

const hubspotStubSchema = {
  type: "object" as const,
  properties: { _: { type: "string", description: "Unused — tool is currently disabled." } },
};

for (const name of [
  "list_crm_organizations",
  "list_crm_contacts",
  "list_crm_deals",
  "list_crm_activities",
  "get_crm_deal",
]) {
  mcpServer.tool(name, {
    description:
      `[DISABLED] ${name} — HubSpot-origin CRM data is not exposed via MCP yet. Tool is registered for future enablement.`,
    inputSchema: hubspotStubSchema,
    handler: async () => DISABLED_HUBSPOT,
  });
}

// ============================================================
// Transport + HTTP
// ============================================================

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcpServer);

const app = new Hono().basePath("/mcp-server");

app.get("/", (c) => c.json({ status: "ok", server: "lnn-content-mcp" }));
app.get("/health", (c) => c.json({ status: "ok" }));

app.all("/:token/mcp", async (c) => {
  const token = c.req.param("token");
  const expected = Deno.env.get("MCP_AUTH_TOKEN");
  if (!expected || token !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return await httpHandler(c.req.raw);
});

Deno.serve(app.fetch);
