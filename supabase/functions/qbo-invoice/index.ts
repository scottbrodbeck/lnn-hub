// QBO invoice edge function.
// Actions:
//   preview        → assemble preview payload (line items, customer, totals) for confirmation
//   create         → create one-time invoice in QBO (and optionally email it)
//   create-recurring → create RecurringTransaction in QBO
//   refresh        → re-pull invoice status (paid/overdue/balance) for a single qbo_invoices row
//   refresh-all    → refresh all open (sent / partially_paid / overdue) invoices

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  qbo,
  qboQuery,
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

async function startRun(kind: string): Promise<string> {
  const { data, error } = await admin()
    .from("qbo_sync_runs")
    .insert({ kind, triggered_by: "manual", status: "running" })
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
// Preview helpers
// ───────────────────────────────────────────────────────────

type LineItemPreview = {
  deal_product_id: string;
  product_id: string;
  product_name: string;
  qbo_item_id: string | null;
  
  quantity: number;
  unit_price: number;
  discount_pct: number;
  total: number;
  ready: boolean;
  blocker?: string;
};

type PreviewResult = {
  deal: { id: string; title: string; value: number };
  organization: { id: string; name: string; qbo_customer_id: string | null; qbo_customer_name: string | null };
  primary_contact_email: string | null;
  line_items: LineItemPreview[];
  blockers: string[];
  totals: { subtotal: number; total: number };
};

async function buildPreview(dealId: string): Promise<PreviewResult> {
  const sb = admin();
  const { data: deal, error } = await sb
    .from("crm_deals")
    .select(`
      id, title, value,
      crm_organization_id,
      primary_contact_id,
      org:crm_organizations!crm_deals_crm_organization_id_fkey(
        id, name, qbo_customer_id, qbo_customer_name
      ),
      contact:crm_contacts!crm_deals_primary_contact_id_fkey(email),
      line_items:crm_deal_products(
        id, product_id, quantity, unit_price, discount_pct, total,
        product:crm_products(id, name, qbo_item_id)
      )
    `)
    .eq("id", dealId)
    .maybeSingle();
  if (error || !deal) throw new Error(error?.message ?? "Deal not found");

  const org = (deal as any).org;
  const blockers: string[] = [];
  if (!org) blockers.push("Deal is not linked to an organization");
  else if (!org.qbo_customer_id) blockers.push(`Organization "${org.name}" is not linked to a QuickBooks customer`);

  const lines: LineItemPreview[] = ((deal as any).line_items ?? []).map((li: any) => {
    const ready = !!li.product?.qbo_item_id;
    const blocker = ready ? undefined : `Product "${li.product?.name}" is not linked to a QuickBooks item`;
    return {
      deal_product_id: li.id,
      product_id: li.product_id,
      product_name: li.product?.name ?? "(unknown)",
      qbo_item_id: li.product?.qbo_item_id ?? null,
      
      quantity: Number(li.quantity),
      unit_price: Number(li.unit_price),
      discount_pct: Number(li.discount_pct ?? 0),
      total: Number(li.total),
      ready,
      blocker,
    };
  });

  if (lines.length === 0) blockers.push("Deal has no line items");
  for (const l of lines) if (l.blocker) blockers.push(l.blocker);

  const subtotal = lines.reduce((s, l) => s + l.total, 0);

  return {
    deal: { id: (deal as any).id, title: (deal as any).title, value: Number((deal as any).value) },
    organization: {
      id: (deal as any).crm_organization_id ?? org?.id ?? "",
      name: org?.name ?? "",
      qbo_customer_id: org?.qbo_customer_id ?? null,
      qbo_customer_name: org?.qbo_customer_name ?? null,
    },
    primary_contact_email: (deal as any).contact?.email ?? null,
    line_items: lines,
    blockers,
    totals: { subtotal, total: subtotal },
  };
}

function buildQboInvoiceLines(lines: LineItemPreview[]) {
  return lines.map((l) => {
    const gross = l.quantity * l.unit_price;
    const net = Math.round(gross * (1 - l.discount_pct / 100) * 100) / 100;
    return {
      DetailType: "SalesItemLineDetail",
      Amount: net,
      Description: l.discount_pct > 0 ? `${l.product_name} (${l.discount_pct}% off)` : l.product_name,
      SalesItemLineDetail: {
        ItemRef: { value: l.qbo_item_id! },
        Qty: l.quantity,
        UnitPrice: l.unit_price,
      },
    };
  });
}

function addCadenceMonths(cadence: string): number {
  switch (cadence) {
    case "monthly": return 1;
    case "quarterly": return 3;
    case "yearly": return 12;
    default: return 1;
  }
}

// ───────────────────────────────────────────────────────────
// Action: preview
// ───────────────────────────────────────────────────────────

async function previewAction(body: { deal_id: string }) {
  if (!body.deal_id) throw new Error("deal_id required");
  return await buildPreview(body.deal_id);
}

// ───────────────────────────────────────────────────────────
// Action: create one-time invoice
// ───────────────────────────────────────────────────────────

async function createAction(body: {
  deal_id: string;
  txn_date?: string;
  due_date?: string;
  send_email?: boolean;
  send_to?: string;
  customer_memo?: string;
}) {
  if (!body.deal_id) throw new Error("deal_id required");
  const runId = await startRun("invoice_create");
  const sb = admin();

  try {
    const preview = await buildPreview(body.deal_id);
    if (preview.blockers.length) throw new Error(`Cannot invoice: ${preview.blockers[0]}`);

    const { data: u } = await admin().auth.admin.listUsers().catch(() => ({ data: { users: [] } } as any));
    void u;

    const Line = buildQboInvoiceLines(preview.line_items);
    const sendEmail = !!body.send_email;
    const sendTo = body.send_to?.trim() || preview.primary_contact_email || undefined;

    const payload: Record<string, unknown> = {
      Line,
      CustomerRef: { value: preview.organization.qbo_customer_id! },
      TxnDate: body.txn_date,
      DueDate: body.due_date,
    };
    if (sendEmail && sendTo) {
      payload.BillEmail = { Address: sendTo };
      payload.EmailStatus = "NeedToSend";
    }
    if (body.customer_memo) {
      payload.CustomerMemo = { value: body.customer_memo.slice(0, 1000) };
    }

    const created = await qbo<{ Invoice: any }>("/invoice", "POST", payload);
    const inv = created.Invoice;

    // Optionally trigger send right away
    let emailSentAt: string | null = null;
    let emailError: string | null = null;
    if (sendEmail && sendTo) {
      try {
        // 1. Re-fetch invoice to confirm BillEmail.Address persisted and grab SyncToken
        const fetched = await qbo<{ Invoice: any }>(`/invoice/${inv.Id}`, "GET");
        let current = fetched.Invoice;
        const currentEmail: string | undefined = current?.BillEmail?.Address;

        // 2. Sparse-update BillEmail if missing or different
        if (!currentEmail || currentEmail.toLowerCase() !== sendTo.toLowerCase()) {
          const updated = await qbo<{ Invoice: any }>("/invoice", "POST", {
            Id: String(current.Id),
            SyncToken: String(current.SyncToken),
            sparse: true,
            BillEmail: { Address: sendTo },
          });
          current = updated.Invoice ?? current;
        }

        // 3. Send — try bare first, fall back to ?sendTo= override
        try {
          await qbo(`/invoice/${current.Id}/send`, "POST", {});
        } catch (sendErr: any) {
          await qbo(`/invoice/${current.Id}/send?sendTo=${encodeURIComponent(sendTo)}`, "POST", {});
        }
        emailSentAt = new Date().toISOString();
      } catch (e: any) {
        emailError = e?.message ?? "Unknown error";
        console.warn("invoice send failed", emailError);
      }
    }

    const insertRow = {
      deal_id: body.deal_id,
      crm_organization_id: preview.organization.id,
      qbo_customer_id: preview.organization.qbo_customer_id,
      qbo_invoice_id: String(inv.Id),
      doc_number: inv.DocNumber ?? null,
      invoice_type: "one_time" as const,
      status: emailSentAt ? "sent" : "draft",
      txn_date: inv.TxnDate ?? body.txn_date ?? null,
      due_date: inv.DueDate ?? body.due_date ?? null,
      currency: inv.CurrencyRef?.value ?? null,
      subtotal: preview.totals.subtotal,
      total: Number(inv.TotalAmt ?? preview.totals.total),
      balance: Number(inv.Balance ?? inv.TotalAmt ?? preview.totals.total),
      line_items: preview.line_items,
      send_to_email: sendTo ?? null,
      email_sent_at: emailSentAt,
      last_synced_at: new Date().toISOString(),
    };

    const { data: row, error: rowErr } = await sb
      .from("qbo_invoices")
      .insert(insertRow)
      .select("id")
      .single();
    if (rowErr) throw new Error(rowErr.message);

    await sb
      .from("crm_deals")
      .update({ qbo_last_invoice_id: row.id })
      .eq("id", body.deal_id);

    await finishRun(runId, {
      status: "success",
      created_count: 1,
      detail: { qbo_invoice_id: inv.Id, doc_number: inv.DocNumber },
    });

    return { ok: true, qbo_invoices_id: row.id, qbo_invoice_id: inv.Id, doc_number: inv.DocNumber, qbo_url: qboInvoiceUrl(String(inv.Id)), email_sent: !!emailSentAt, email_error: emailError };
  } catch (e: any) {
    await finishRun(runId, { status: "error", error: e.message });
    throw e;
  }
}

// ───────────────────────────────────────────────────────────
// Action: create recurring invoice
// ───────────────────────────────────────────────────────────

async function createRecurringAction(body: {
  deal_id: string;
  cadence: "monthly" | "quarterly" | "yearly";
  start_date: string;
  end_date?: string | null;
  net_due_days?: number;
  customer_memo?: string;
}) {
  if (!body.deal_id) throw new Error("deal_id required");
  if (!body.start_date) throw new Error("start_date required");
  if (!["monthly", "quarterly", "yearly"].includes(body.cadence)) throw new Error("Invalid cadence");
  const runId = await startRun("invoice_recurring_create");
  const sb = admin();

  try {
    const preview = await buildPreview(body.deal_id);
    if (preview.blockers.length) throw new Error(`Cannot invoice: ${preview.blockers[0]}`);

    const Line = buildQboInvoiceLines(preview.line_items);
    const intervalMonths = addCadenceMonths(body.cadence);

    // Build a RecurringTransaction wrapping an Invoice
    // QBO RecurringTransaction docs: https://developer.intuit.com/.../recurringtransaction
    const payload = {
      RecurringTransaction: {
        Invoice: {
          Line,
          CustomerRef: { value: preview.organization.qbo_customer_id! },
          ...(body.customer_memo ? { CustomerMemo: { value: body.customer_memo.slice(0, 1000) } } : {}),
        },
        RecurringInfo: {
          Name: `${preview.deal.title} (${body.cadence})`.slice(0, 50),
          Active: true,
          ScheduleInfo: {
            IntervalType: "Monthly",
            NumInterval: intervalMonths,
            DayOfMonth: Number(body.start_date.slice(8, 10)) || 1,
            StartDate: body.start_date,
            ...(body.end_date ? { EndDate: body.end_date } : {}),
          },
        },
      },
    };

    const created = await qbo<any>("/recurringtransaction", "POST", payload);
    const recurringId =
      created?.RecurringTransaction?.Invoice?.Id ??
      created?.RecurringTransaction?.Id ??
      null;
    if (!recurringId) throw new Error("QBO did not return a recurring transaction id");

    const insertRow = {
      deal_id: body.deal_id,
      crm_organization_id: preview.organization.id,
      qbo_customer_id: preview.organization.qbo_customer_id,
      qbo_recurring_id: String(recurringId),
      invoice_type: "recurring" as const,
      recurrence_cadence: body.cadence,
      recurrence_start_date: body.start_date,
      recurrence_end_date: body.end_date ?? null,
      status: "sent" as const, // recurring is "active" — model as sent for the local row
      subtotal: preview.totals.subtotal,
      total: preview.totals.total,
      balance: preview.totals.total,
      line_items: preview.line_items,
      last_synced_at: new Date().toISOString(),
    };

    const { data: row, error: rowErr } = await sb
      .from("qbo_invoices")
      .insert(insertRow)
      .select("id")
      .single();
    if (rowErr) throw new Error(rowErr.message);

    await sb
      .from("crm_deals")
      .update({ qbo_recurring_invoice_id: row.id })
      .eq("id", body.deal_id);

    await finishRun(runId, {
      status: "success",
      created_count: 1,
      detail: { qbo_recurring_id: recurringId, cadence: body.cadence },
    });

    return { ok: true, qbo_invoices_id: row.id, qbo_recurring_id: recurringId, qbo_url: `${QBO_APP_HOST}/app/recurringtransactions` };
  } catch (e: any) {
    await finishRun(runId, { status: "error", error: e.message });
    throw e;
  }
}

// ───────────────────────────────────────────────────────────
// Action: refresh single
// ───────────────────────────────────────────────────────────

function deriveStatus(inv: any): string {
  const balance = Number(inv.Balance ?? 0);
  const total = Number(inv.TotalAmt ?? 0);
  if (balance === 0 && total > 0) return "paid";
  if (balance > 0 && balance < total) return "partially_paid";
  if (inv.DueDate && new Date(inv.DueDate).getTime() < Date.now() && balance > 0) return "overdue";
  if (inv.EmailStatus === "EmailSent") return "sent";
  return "sent";
}

async function refreshOne(rowId: string) {
  const sb = admin();
  const { data: row, error } = await sb
    .from("qbo_invoices")
    .select("id, qbo_invoice_id, invoice_type")
    .eq("id", rowId)
    .maybeSingle();
  if (error || !row) throw new Error(error?.message ?? "Invoice row not found");
  if (row.invoice_type !== "one_time" || !row.qbo_invoice_id) {
    return { ok: true, skipped: true };
  }
  try {
    const fresh = await qbo<{ Invoice: any }>(`/invoice/${row.qbo_invoice_id}`);
    const inv = fresh.Invoice;
    await sb
      .from("qbo_invoices")
      .update({
        status: deriveStatus(inv),
        total: Number(inv.TotalAmt ?? 0),
        balance: Number(inv.Balance ?? 0),
        due_date: inv.DueDate ?? null,
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      })
      .eq("id", row.id);
    return { ok: true };
  } catch (e: any) {
    await sb
      .from("qbo_invoices")
      .update({ sync_error: e.message?.slice(0, 1000) ?? "unknown" })
      .eq("id", row.id);
    throw e;
  }
}

async function refreshAction(body: { id: string }) {
  if (!body.id) throw new Error("id required");
  return await refreshOne(body.id);
}

async function refreshAllAction() {
  const runId = await startRun("invoice_refresh_all");
  const sb = admin();
  try {
    const { data: rows, error } = await sb
      .from("qbo_invoices")
      .select("id")
      .eq("invoice_type", "one_time")
      .not("qbo_invoice_id", "is", null)
      .in("status", ["draft", "sent", "partially_paid", "overdue"]);
    if (error) throw new Error(error.message);

    let updated = 0, errors = 0;
    for (const r of rows ?? []) {
      try { await refreshOne(r.id); updated++; }
      catch { errors++; }
    }
    await finishRun(runId, { status: errors === 0 ? "success" : "error", updated_count: updated, error_count: errors });
    return { updated, errors, total: (rows ?? []).length };
  } catch (e: any) {
    await finishRun(runId, { status: "error", error: e.message });
    throw e;
  }
}

// ───────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────
// Assignment generation
// ───────────────────────────────────────────────────────────

type CategoryRule = {
  post_type: string;
  content_category: string;
  assignment_kind: 'post' | 'display_ad' | 'bundle';
};

type AssignmentDefaults = {
  default_months_for_recurring: number;
  max_months_for_recurring: number;
  default_stagger: 'none' | 'weekly' | 'biweekly';
  category_mapping: Record<string, CategoryRule>;
  /** Deprecated — kept for back-compat with existing DB overrides. */
  skip_categories?: string[];
  /** Aliases that resolve to a canonical category key (already normalized lower-case). */
  category_aliases?: Record<string, string>;
};

const DEFAULT_ASSIGNMENT_DEFAULTS: AssignmentDefaults = {
  default_months_for_recurring: 3,
  max_months_for_recurring: 24,
  default_stagger: 'weekly',
  category_mapping: {
    'Sponsored Posts': { post_type: 'standard', content_category: 'website', assignment_kind: 'post' },
    'Email': { post_type: 'standard', content_category: 'email_blast', assignment_kind: 'post' },
    'Bundles': { post_type: 'standard', content_category: 'website', assignment_kind: 'bundle' },
    'Network Packages': { post_type: 'standard', content_category: 'website', assignment_kind: 'post' },
    'Display Ads': { post_type: 'standard', content_category: 'website', assignment_kind: 'display_ad' },
  },
  category_aliases: {
    'display ad': 'Display Ads',
    'sponsored post': 'Sponsored Posts',
    'emails': 'Email',
    'email blast': 'Email',
    'bundle': 'Bundles',
    'network package': 'Network Packages',
  },
};

function normalizeCategoryKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveCategoryRule(
  rawCategory: string | null | undefined,
  defaults: AssignmentDefaults,
): { rule: CategoryRule | null; resolvedKey: string | null } {
  if (!rawCategory) return { rule: null, resolvedKey: null };
  const norm = normalizeCategoryKey(rawCategory);

  // Honor deprecated skip_categories from old overrides
  if (defaults.skip_categories?.some((c) => normalizeCategoryKey(c) === norm)) {
    return {
      rule: { post_type: 'standard', content_category: 'website', assignment_kind: 'display_ad' },
      resolvedKey: rawCategory,
    };
  }

  // Build a normalized lookup over category_mapping
  for (const [key, rule] of Object.entries(defaults.category_mapping)) {
    if (normalizeCategoryKey(key) === norm) return { rule, resolvedKey: key };
  }

  // Try aliases
  const aliasTarget = defaults.category_aliases?.[norm];
  if (aliasTarget) {
    const target = defaults.category_mapping[aliasTarget];
    if (target) return { rule: target, resolvedKey: aliasTarget };
  }

  return { rule: null, resolvedKey: null };
}

async function loadAssignmentDefaults(): Promise<AssignmentDefaults> {
  const sb = admin();
  const { data } = await sb
    .from('crm_settings')
    .select('value')
    .eq('key', 'assignment_generation_defaults')
    .maybeSingle();
  if (!data?.value) return DEFAULT_ASSIGNMENT_DEFAULTS;
  const override = data.value as Partial<AssignmentDefaults>;
  return {
    ...DEFAULT_ASSIGNMENT_DEFAULTS,
    ...override,
    category_mapping: {
      ...DEFAULT_ASSIGNMENT_DEFAULTS.category_mapping,
      ...(override.category_mapping ?? {}),
    },
    category_aliases: {
      ...(DEFAULT_ASSIGNMENT_DEFAULTS.category_aliases ?? {}),
      ...(override.category_aliases ?? {}),
    },
  };
}

async function loadSitesIndex(): Promise<{ byNameLc: Map<string, { id: string; name: string }>; all: Array<{ id: string; name: string }> }> {
  const sb = admin();
  const { data, error } = await sb.from('sites').select('id, name, is_active').eq('is_active', true);
  if (error) throw new Error(`load sites failed: ${error.message}`);
  const all = (data ?? []).map((r: any) => ({ id: r.id as string, name: r.name as string }));
  const byNameLc = new Map<string, { id: string; name: string }>();
  for (const s of all) byNameLc.set(s.name.toLowerCase(), s);
  return { byNameLc, all };
}

type AssignmentLinePlan = {
  deal_product_id: string;
  product_id: string;
  product_name: string;
  product_category: string | null;
  product_site_slug: string | null;
  count: number;
  site_id: string | null;
  site_name: string | null;
  post_type: string;
  content_category: string;
  stagger: 'none' | 'weekly' | 'biweekly';
  /** 'post' = creates a post_assignment; 'display_ad' = routed to display ads (skipped here); 'unknown' = needs admin mapping */
  assignment_kind: 'post' | 'display_ad' | 'unknown';
  skip: boolean;
  blockers: string[];
  /** For bundle-expanded children: the deal_product_id of the parent invoice line. */
  parent_deal_product_id?: string | null;
  /** Display label for bundle children (e.g. "Sponsored post"). */
  bundle_label?: string | null;
  /** Stable client key when multiple children share a parent_deal_product_id. */
  line_key: string;
};

// Load the line items + deal/org context for assignment generation from
// either a qbo_invoices row (snapshot) or a deal directly (live products).
type AssignmentSource = {
  source: 'invoice' | 'deal';
  // Pseudo-invoice for deal source: id null, invoice_type 'one_time'
  invRow: {
    id: string | null;
    deal_id: string;
    invoice_type: string;
    recurrence_cadence: string | null;
    recurrence_start_date: string | null;
    recurrence_end_date: string | null;
    txn_date: string | null;
    doc_number?: string | null;
    line_items: any[];
    crm_organization_id: string | null;
  };
};

async function loadAssignmentSource(body: { qbo_invoices_id?: string | null; deal_id?: string | null }): Promise<AssignmentSource> {
  const sb = admin();

  if (body.qbo_invoices_id) {
    const { data: invRow, error: invErr } = await sb
      .from('qbo_invoices')
      .select('id, deal_id, invoice_type, recurrence_cadence, recurrence_start_date, recurrence_end_date, txn_date, doc_number, line_items, crm_organization_id')
      .eq('id', body.qbo_invoices_id)
      .maybeSingle();
    if (invErr || !invRow) throw new Error(invErr?.message ?? 'Invoice row not found');
    return { source: 'invoice', invRow: invRow as any };
  }

  if (body.deal_id) {
    const { data: dealRow, error: dealErr } = await sb
      .from('crm_deals')
      .select(`
        id, won_at, expected_close_date, crm_organization_id,
        line_items:crm_deal_products(id, product_id, quantity, product:crm_products(id, name))
      `)
      .eq('id', body.deal_id)
      .maybeSingle();
    if (dealErr || !dealRow) throw new Error(dealErr?.message ?? 'Deal not found');

    const lineItems = ((dealRow as any).line_items ?? []).map((li: any) => ({
      deal_product_id: li.id,
      product_id: li.product_id,
      product_name: li.product?.name ?? '(unknown)',
      quantity: Number(li.quantity) || 1,
    }));

    const baseDate = ((dealRow as any).won_at as string | null)?.slice(0, 10)
      ?? ((dealRow as any).expected_close_date as string | null)
      ?? new Date().toISOString().slice(0, 10);

    return {
      source: 'deal',
      invRow: {
        id: null,
        deal_id: (dealRow as any).id,
        invoice_type: 'one_time',
        recurrence_cadence: null,
        recurrence_start_date: null,
        recurrence_end_date: null,
        txn_date: baseDate,
        doc_number: null,
        line_items: lineItems,
        crm_organization_id: (dealRow as any).crm_organization_id ?? null,
      },
    };
  }

  throw new Error('qbo_invoices_id or deal_id required');
}

async function planAssignmentsAction(body: { qbo_invoices_id?: string | null; deal_id?: string | null }) {
  const sb = admin();
  const { source, invRow } = await loadAssignmentSource(body);

  const { data: deal } = await sb
    .from('crm_deals')
    .select('id, title, crm_organization_id, org:crm_organizations!crm_deals_crm_organization_id_fkey(id, name, linked_org_id)')
    .eq('id', invRow.deal_id)
    .maybeSingle();

  const orgLinkedId = (deal as any)?.org?.linked_org_id ?? null;
  const orgName = (deal as any)?.org?.name ?? '';

  let orgLinkedName: string | null = null;
  let orgLinkedClientCode: string | null = null;
  if (orgLinkedId) {
    const { data: linkedOrg } = await sb
      .from('organizations')
      .select('name, client_code')
      .eq('id', orgLinkedId)
      .maybeSingle();
    orgLinkedName = (linkedOrg as any)?.name ?? null;
    orgLinkedClientCode = (linkedOrg as any)?.client_code ?? null;
  }

  const linksQuery = sb.from('qbo_invoice_assignment_links').select('id');
  const { data: existingLinks } = source === 'invoice'
    ? await linksQuery.eq('qbo_invoice_id', invRow.id!)
    : await linksQuery.eq('deal_id', invRow.deal_id);

  const defaults = await loadAssignmentDefaults();
  const sitesIdx = await loadSitesIndex();

  // Pull product details for richer mapping (category + site_slug)
  const productIds = Array.from(
    new Set(((invRow as any).line_items ?? []).map((l: any) => l.product_id).filter(Boolean)),
  ) as string[];
  const productById = new Map<string, { category: string | null; site_slug: string | null }>();
  if (productIds.length) {
    const { data: prods } = await sb
      .from('crm_products')
      .select('id, category, site_slug')
      .in('id', productIds);
    for (const p of prods ?? []) productById.set(p.id as string, { category: (p as any).category, site_slug: (p as any).site_slug });
  }

  // Pre-resolve bundle product IDs so we can fetch their composition in one shot.
  const rawLines = ((invRow as any).line_items ?? []) as any[];
  const bundleProductIds: string[] = [];
  for (const l of rawLines) {
    const meta = productById.get(l.product_id);
    if (!meta) continue;
    const { rule } = resolveCategoryRule(meta.category ?? '', defaults);
    if (rule?.assignment_kind === 'bundle') bundleProductIds.push(l.product_id);
  }
  const bundleItemsByProduct = new Map<string, any[]>();
  if (bundleProductIds.length) {
    const { data: bItems } = await sb
      .from('crm_product_bundle_items')
      .select('id, bundle_product_id, assignment_kind, content_category, post_type, quantity, cadence, label, sort_order')
      .in('bundle_product_id', bundleProductIds)
      .order('sort_order', { ascending: true });
    for (const it of bItems ?? []) {
      const arr = bundleItemsByProduct.get((it as any).bundle_product_id) ?? [];
      arr.push(it);
      bundleItemsByProduct.set((it as any).bundle_product_id, arr);
    }
  }

  const lines: AssignmentLinePlan[] = [];

  for (const l of rawLines) {
    const meta = productById.get(l.product_id) ?? { category: null, site_slug: null };
    const cat = meta.category ?? '';
    const { rule } = resolveCategoryRule(cat, defaults);
    const slug = meta.site_slug ?? '';
    const siteMatch = slug ? sitesIdx.byNameLc.get(slug.toLowerCase()) : null;
    const lineQty = Math.max(1, Number(l.quantity) || 1);

    // ── Bundle: expand into one synthetic line per composition item ─────────
    if (rule?.assignment_kind === 'bundle') {
      const items = bundleItemsByProduct.get(l.product_id) ?? [];
      if (items.length === 0) {
        lines.push({
          deal_product_id: l.deal_product_id,
          line_key: `${l.deal_product_id}:bundle-empty`,
          product_id: l.product_id,
          product_name: l.product_name,
          product_category: cat || null,
          product_site_slug: slug || null,
          count: 0,
          site_id: siteMatch?.id ?? null,
          site_name: siteMatch?.name ?? null,
          post_type: 'standard',
          content_category: 'website',
          stagger: defaults.default_stagger,
          assignment_kind: 'unknown',
          skip: true,
          blockers: [`Bundle "${l.product_name}" has no defined contents. Configure it under Products → Bundle items.`],
          parent_deal_product_id: null,
          bundle_label: null,
        });
        continue;
      }
      for (const item of items) {
        const childIsPost = (item as any).assignment_kind === 'post';
        const childBlockers: string[] = [];
        if (childIsPost && !siteMatch) {
          childBlockers.push(`Site "${slug || '(none)'}" not found — pick one manually`);
        }
        const cadenceStagger: 'none' | 'weekly' | 'biweekly' =
          (item as any).cadence === 'weekly' || (item as any).cadence === 'biweekly'
            ? (item as any).cadence
            : (item as any).cadence === 'monthly'
              ? 'none' // monthly handled by base cycle, not by within-cycle stagger
              : 'none';
        lines.push({
          deal_product_id: l.deal_product_id,
          line_key: `${l.deal_product_id}:b:${(item as any).id}`,
          product_id: l.product_id,
          product_name: l.product_name,
          product_category: cat || null,
          product_site_slug: slug || null,
          count: childIsPost ? ((item as any).quantity ?? 1) * lineQty : 0,
          site_id: siteMatch?.id ?? null,
          site_name: siteMatch?.name ?? null,
          post_type: (item as any).post_type ?? 'standard',
          content_category: (item as any).content_category ?? 'website',
          stagger: cadenceStagger,
          assignment_kind: childIsPost ? 'post' : 'display_ad',
          skip: !childIsPost, // display ads inside a bundle are noted but not auto-created
          blockers: childBlockers,
          parent_deal_product_id: l.deal_product_id,
          bundle_label: (item as any).label ?? null,
        });
      }
      continue;
    }

    // ── Non-bundle: existing behavior ──────────────────────────────────────
    let assignment_kind: 'post' | 'display_ad' | 'unknown' = 'unknown';
    let post_type = 'standard';
    let content_category = 'website';
    let skip = true;
    const blockers: string[] = [];

    if (rule) {
      assignment_kind = rule.assignment_kind === 'bundle' ? 'unknown' : rule.assignment_kind;
      post_type = rule.post_type;
      content_category = rule.content_category;
      skip = assignment_kind !== 'post';
    } else {
      blockers.push(
        cat
          ? `Unknown product category "${cat}" — map it in assignment defaults before generating, or override below.`
          : `Product has no category — set one on the product or override the mapping below.`,
      );
    }

    if (!siteMatch && assignment_kind === 'post') {
      blockers.push(`Site "${slug || '(none)'}" not found — pick one manually`);
    }

    lines.push({
      deal_product_id: l.deal_product_id,
      line_key: l.deal_product_id,
      product_id: l.product_id,
      product_name: l.product_name,
      product_category: cat || null,
      product_site_slug: slug || null,
      count: skip ? 0 : lineQty,
      site_id: siteMatch?.id ?? null,
      site_name: siteMatch?.name ?? null,
      post_type,
      content_category,
      stagger: defaults.default_stagger,
      assignment_kind,
      skip,
      blockers,
      parent_deal_product_id: null,
      bundle_label: null,
    });
  }

  return {
    source,
    invoice: {
      id: invRow.id,
      deal_id: invRow.deal_id,
      invoice_type: invRow.invoice_type,
      recurrence_cadence: invRow.recurrence_cadence,
      recurrence_start_date: invRow.recurrence_start_date,
      recurrence_end_date: invRow.recurrence_end_date,
      txn_date: invRow.txn_date,
      organization_id: invRow.crm_organization_id,
      organization_name: orgName,
      organization_linked_org_id: orgLinkedId,
      organization_linked_org_name: orgLinkedName,
      organization_linked_org_client_code: orgLinkedClientCode,

    },
    deal: { id: (deal as any)?.id, title: (deal as any)?.title ?? '' },
    defaults,
    sites: sitesIdx.all,
    lines,
    already_created_count: (existingLinks ?? []).length,
  };
}

function staggerDays(stagger: string): number {
  if (stagger === 'weekly') return 7;
  if (stagger === 'biweekly') return 14;
  return 0;
}

function addMonthsISO(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00`);
  const target = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
  return target.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function createAssignmentsAction(body: {
  qbo_invoices_id?: string | null;
  deal_id?: string | null;
  months_to_schedule?: number;
  base_date?: string;
  unscheduled?: boolean;
  lines: Array<{
    deal_product_id: string;
    product_id: string;
    product_name: string;
    count: number;
    site_id: string;
    post_type: string;
    content_category: string;
    stagger: 'none' | 'weekly' | 'biweekly';
    skip?: boolean;
    bundle_label?: string | null;
  }>;
}, userId: string | null) {
  if (!Array.isArray(body.lines)) throw new Error('lines required');

  const runId = await startRun('assignment_create');
  const sb = admin();

  try {
    const { source, invRow } = await loadAssignmentSource(body);

    const { data: deal } = await sb
      .from('crm_deals')
      .select('id, title, org:crm_organizations!crm_deals_crm_organization_id_fkey(id, name, linked_org_id)')
      .eq('id', invRow.deal_id)
      .maybeSingle();
    const orgName = (deal as any)?.org?.name ?? '';
    const linkedOrgId = (deal as any)?.org?.linked_org_id ?? null;
    if (!linkedOrgId) {
      throw new Error('Organization is not linked to an admin organization — link it in the org panel before generating assignments.');
    }

    const isRecurring = invRow.invoice_type === 'recurring';
    const cadence = invRow.recurrence_cadence as string | null;
    const intervalMonths = cadence ? addCadenceMonths(cadence) : 1;
    const months = isRecurring ? Math.max(1, Math.min(24, body.months_to_schedule ?? 3)) : 1;
    const cycles = isRecurring ? Math.max(1, Math.ceil(months / Math.max(1, intervalMonths))) : 1;

    const cycleStart = isRecurring
      ? (invRow.recurrence_start_date as string) ?? body.base_date ?? new Date().toISOString().slice(0, 10)
      : body.base_date ?? (invRow.txn_date as string) ?? new Date().toISOString().slice(0, 10);

    // Existing links (idempotency) — scoped to THIS source; the dedupe key
    // (deal_product_id, cycle, pos) repeats across invoices for the same deal
    const existingQuery = sb
      .from('qbo_invoice_assignment_links')
      .select('deal_product_id, cycle_index, position_in_cycle');
    const { data: existing } = source === 'invoice'
      ? await existingQuery.eq('qbo_invoice_id', invRow.id!)
      : await existingQuery.eq('deal_id', invRow.deal_id);
    const existingKeys = new Set(
      (existing ?? []).map((r: any) => `${r.deal_product_id}|${r.cycle_index}|${r.position_in_cycle}`),
    );

    let created = 0;
    let skipped = 0;
    const createdAssignmentIds: string[] = [];

    for (let cycle = 0; cycle < cycles; cycle++) {
      const cycleBase = isRecurring ? addMonthsISO(cycleStart, cycle * intervalMonths) : cycleStart;
      // Per-cycle position counter per deal_product_id so bundle children
      // sharing the same parent line don't collide on (deal_product_id, cycle, pos).
      const posByDealProduct = new Map<string, number>();

      for (const line of body.lines) {
        if (line.skip || line.count <= 0) continue;
        if (!line.site_id) throw new Error(`Line "${line.product_name}" is missing a site`);

        const stagger = staggerDays(line.stagger);
        const baseLabel = (line as any).bundle_label ? `${line.product_name} — ${(line as any).bundle_label}` : line.product_name;

        for (let i = 0; i < line.count; i++) {
          const pos = posByDealProduct.get(line.deal_product_id) ?? 0;
          posByDealProduct.set(line.deal_product_id, pos + 1);

          const key = `${line.deal_product_id}|${cycle}|${pos}`;
          if (existingKeys.has(key)) { skipped++; continue; }

          const dueDate = body.unscheduled ? null : addDaysISO(cycleBase, i * stagger);
          const cycleSuffix = isRecurring ? ` (Cycle ${cycle + 1}/${cycles})` : '';
          const posSuffix = line.count > 1 ? ` #${i + 1}` : '';
          const assignmentName = `${orgName} — ${baseLabel}${posSuffix}${cycleSuffix}`.slice(0, 200);
          const notes = source === 'invoice'
            ? `Auto-created from deal "${(deal as any)?.title ?? ''}" · QBO invoice ${invRow.doc_number ?? invRow.id}`
            : `Auto-created from deal "${(deal as any)?.title ?? ''}" (no invoice)`;

          const { data: inserted, error: insertErr } = await sb
            .from('post_assignments')
            .insert({
              assignment_name: assignmentName,
              site_id: line.site_id,
              organization_id: linkedOrgId,
              post_type: line.post_type,
              content_category: line.content_category,
              recurrence_type: 'one_time',
              due_date: dueDate,
              created_by: userId,
              notes,
            })
            .select('id')
            .single();
          if (insertErr) throw new Error(`assignment insert failed: ${insertErr.message}`);

          const { error: linkErr } = await sb
            .from('qbo_invoice_assignment_links')
            .insert({
              qbo_invoice_id: source === 'invoice' ? invRow.id : null,
              deal_id: source === 'deal' ? invRow.deal_id : null,
              assignment_id: inserted.id,
              deal_product_id: line.deal_product_id,
              cycle_index: cycle,
              position_in_cycle: pos,
            });
          if (linkErr) throw new Error(`link insert failed: ${linkErr.message}`);

          created++;
          createdAssignmentIds.push(inserted.id);
        }
      }
    }

    await finishRun(runId, {
      status: 'success',
      created_count: created,
      detail: { invoice_id: invRow.id, skipped_existing: skipped, cycles, months },
    });

    return { ok: true, created, skipped, cycles, assignment_ids: createdAssignmentIds };
  } catch (e: any) {
    await finishRun(runId, { status: 'error', error: e.message });
    throw e;
  }
}

// ───────────────────────────────────────────────────────────
// Customer invoices (read-only, live from QBO)
// ───────────────────────────────────────────────────────────

const QBO_ENV = (Deno.env.get("QBO_ENVIRONMENT") ?? "production").toLowerCase();
const QBO_REALM = Deno.env.get("QBO_REALM_ID") ?? "";
const QBO_APP_HOST = QBO_ENV === "sandbox" ? "https://app.sandbox.qbo.intuit.com" : "https://app.qbo.intuit.com";

function qboInvoiceUrl(id: string) { return `${QBO_APP_HOST}/app/invoice?txnId=${id}`; }
function qboCustomerUrl(id: string) { return `${QBO_APP_HOST}/app/customerdetail?nameId=${id}`; }

function isVoidedInvoice(inv: any): boolean {
  // QBO marks voided invoices by prefixing the PrivateNote with "Voided" and zeroing amounts.
  const note = String(inv?.PrivateNote ?? "").trim().toLowerCase();
  if (note.startsWith("voided")) return true;
  // Belt-and-suspenders: a true voided invoice has TotalAmt 0 AND every line Amount 0.
  const total = Number(inv?.TotalAmt ?? 0);
  if (total === 0 && Array.isArray(inv?.Line)) {
    const allZero = inv.Line.every((l: any) =>
      l?.DetailType === "SubTotalLineDetail" || Number(l?.Amount ?? 0) === 0
    );
    if (allZero && note.includes("void")) return true;
  }
  return false;
}

function deriveInvoiceStatus(inv: { TotalAmt?: number; Balance?: number; DueDate?: string | null }): string {
  const total = Number(inv.TotalAmt ?? 0);
  const balance = Number(inv.Balance ?? 0);
  if (balance <= 0.0001) return "paid";
  if (balance < total - 0.0001) return "partially_paid";
  if (inv.DueDate) {
    const due = new Date(inv.DueDate + "T23:59:59");
    if (!isNaN(due.getTime()) && due.getTime() < Date.now()) return "overdue";
  }
  return "open";
}

async function listByCustomerAction(body: any) {
  const customerId = String(body?.qbo_customer_id ?? "").trim();
  if (!customerId) throw new Error("qbo_customer_id is required");

  const sql =
    `SELECT Id, DocNumber, TxnDate, DueDate, TotalAmt, Balance, ` +
    `CurrencyRef, EmailStatus, PrivateNote ` +
    `FROM Invoice WHERE CustomerRef = '${customerId.replace(/'/g, "\\'")}' ` +
    `ORDERBY TxnDate DESC MAXRESULTS 1000`;

  const resp = await qboQuery<any>(sql);
  const raw = (resp?.Invoice ?? []) as any[];

  const invoices = raw
    .filter((inv) => !isVoidedInvoice(inv))
    .map((inv) => ({
      id: String(inv.Id),
      doc_number: inv.DocNumber ?? null,
      txn_date: inv.TxnDate ?? null,
      due_date: inv.DueDate ?? null,
      total: Number(inv.TotalAmt ?? 0),
      balance: Number(inv.Balance ?? 0),
      currency: inv.CurrencyRef?.value ?? null,
      status: deriveInvoiceStatus(inv),
      qbo_url: qboInvoiceUrl(String(inv.Id)),
    }));

  return {
    invoices,
    customer_qbo_url: qboCustomerUrl(customerId),
  };
}

async function getInvoiceAction(body: any) {
  const invoiceId = String(body?.qbo_invoice_id ?? "").trim();
  if (!invoiceId) throw new Error("qbo_invoice_id is required");

  const resp = await qbo<any>(`/invoice/${encodeURIComponent(invoiceId)}`, "GET");
  const inv = resp?.Invoice;
  if (!inv) throw new Error("Invoice not found");

  if (isVoidedInvoice(inv)) {
    return { voided: true, id: String(inv.Id) };
  }

  // Line items
  const lineItems: Array<{
    description: string | null;
    qty: number;
    unit_price: number;
    discount_amount: number;
    amount: number;
  }> = [];
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = Number(inv?.TxnTaxDetail?.TotalTax ?? 0);

  for (const line of (inv.Line ?? []) as any[]) {
    const detailType = line?.DetailType;
    if (detailType === "SalesItemLineDetail") {
      const det = line.SalesItemLineDetail ?? {};
      const qty = Number(det.Qty ?? 1);
      const unitPrice = Number(det.UnitPrice ?? (qty ? Number(line.Amount ?? 0) / qty : 0));
      const amount = Number(line.Amount ?? 0);
      lineItems.push({
        description: line.Description ?? det.ItemRef?.name ?? null,
        qty,
        unit_price: unitPrice,
        discount_amount: 0,
        amount,
      });
      subtotal += amount;
    } else if (detailType === "DiscountLineDetail") {
      const amount = Number(line.Amount ?? 0);
      discountTotal += amount;
    } else if (detailType === "SubTotalLineDetail") {
      // Skip — this is a computed subtotal row from QBO.
    }
  }

  const total = Number(inv.TotalAmt ?? subtotal - discountTotal + taxTotal);
  const balance = Number(inv.Balance ?? total);
  const amountPaid = Math.max(0, total - balance);

  // Customer details
  const customerId = inv?.CustomerRef?.value ? String(inv.CustomerRef.value) : null;
  const customer = {
    id: customerId,
    name: inv?.CustomerRef?.name ?? null,
    email: inv?.BillEmail?.Address ?? null,
  };

  // Payments linked to this invoice via LinkedTxn
  let payments: Array<{ id: string; date: string | null; amount: number; method: string | null; ref: string | null }> = [];
  try {
    const paymentSql =
      `SELECT Id, TxnDate, TotalAmt, PaymentMethodRef, PaymentRefNum, Line ` +
      `FROM Payment WHERE Line.LinkedTxn.TxnId = '${invoiceId.replace(/'/g, "\\'")}' MAXRESULTS 100`;
    const payResp = await qboQuery<any>(paymentSql);
    const rows = (payResp?.Payment ?? []) as any[];
    payments = rows.map((p) => {
      // Sum the portion of the payment applied to *this* invoice
      let appliedToThis = 0;
      for (const ln of (p.Line ?? []) as any[]) {
        const linked = (ln?.LinkedTxn ?? []) as any[];
        if (linked.some((lt) => String(lt?.TxnId) === invoiceId && lt?.TxnType === "Invoice")) {
          appliedToThis += Number(ln.Amount ?? 0);
        }
      }
      return {
        id: String(p.Id),
        date: p.TxnDate ?? null,
        amount: appliedToThis || Number(p.TotalAmt ?? 0),
        method: p.PaymentMethodRef?.name ?? null,
        ref: p.PaymentRefNum ?? null,
      };
    });
  } catch (_) {
    // Don't fail the whole detail call if payment lookup errors.
    payments = [];
  }

  return {
    id: String(inv.Id),
    doc_number: inv.DocNumber ?? null,
    txn_date: inv.TxnDate ?? null,
    due_date: inv.DueDate ?? null,
    currency: inv.CurrencyRef?.value ?? null,
    customer,
    line_items: lineItems,
    totals: {
      subtotal,
      discount_total: discountTotal,
      tax_total: taxTotal,
      total,
      balance,
      amount_paid: amountPaid,
    },
    status: deriveInvoiceStatus(inv),
    payments,
    memo: inv?.CustomerMemo?.value ?? null,
    private_note: inv?.PrivateNote ?? null,
    qbo_url: qboInvoiceUrl(String(inv.Id)),
  };
}

// ───────────────────────────────────────────────────────────
// HTTP entry
// ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await authorize(req);
    assertQboConfigured();

    const body = await req.json().catch(() => ({} as any));
    const action = body.action as string;
    let result: unknown;

    switch (action) {
      case "preview":              result = await previewAction(body); break;
      case "create":               result = await createAction(body); break;
      case "create-recurring":     result = await createRecurringAction(body); break;
      case "refresh":              result = await refreshAction(body); break;
      case "refresh-all":          result = await refreshAllAction(); break;
      case "plan-assignments":     result = await planAssignmentsAction(body); break;
      case "create-assignments":   result = await createAssignmentsAction(body, auth.userId); break;
      case "list-by-customer":     result = await listByCustomerAction(body); break;
      case "get":                  result = await getInvoiceAction(body); break;
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
