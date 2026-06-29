// Sync products from the LNN public Pricing API into crm_products.
// Idempotent: upserts by deterministic source_key. Archives products no longer in the feed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PRICING_API_URL =
  'https://frrbymniubaqepkufkwk.supabase.co/functions/v1/pricing-api?format=flat';

type BillingCycle = 'one_time' | 'monthly' | 'quarterly' | 'annual';

type NormalizedProduct = {
  source_key: string;          // deterministic fallback identity (legacy)
  upstream_id: string | null;  // stable UUID from the LNN Pricing API
  site_slug: string | null;
  variant_slug: string;
  name: string;
  category: string;            // human label
  unit_price: number;
  billing_cycle: BillingCycle;
  description: string | null;
};

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ---------- helpers ----------

function slugify(input: unknown): string {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type CycleHint = BillingCycle | null;

type ParsedPrice = {
  amount: number;        // numeric dollars
  cycleHint: CycleHint;  // detected from suffix (e.g. "/yr"), if any
  totalMonths: number | null; // detected from "total for N months", if any
};

// Robust price parser. Handles:
//   number              -> { amount: n }
//   "$35,000"           -> 35000
//   "$3,500/mo"         -> 35000 cycle=monthly  (wait: 3500)
//   "$35,000/yr"        -> 35000 cycle=annual
//   "$2,500 / month"    -> 2500  cycle=monthly
//   "$10,500 total for 3 months" -> 10500 totalMonths=3
//   "1.2k", "free", ""  -> 0
function parsePriceEx(input: unknown): ParsedPrice {
  if (typeof input === 'number' && isFinite(input)) {
    return { amount: input, cycleHint: null, totalMonths: null };
  }
  if (typeof input !== 'string') {
    return { amount: 0, cycleHint: null, totalMonths: null };
  }
  const raw = input.trim().toLowerCase();
  if (!raw || raw === 'free' || raw === 'n/a' || raw === '-') {
    return { amount: 0, cycleHint: null, totalMonths: null };
  }

  // Detect "total for N months/years"
  let totalMonths: number | null = null;
  const totalMatch = raw.match(/total\s+for\s+(\d+)\s*(month|months|mo|year|years|yr|yrs)/);
  if (totalMatch) {
    const n = parseInt(totalMatch[1], 10);
    const unit = totalMatch[2];
    if (isFinite(n) && n > 0) {
      totalMonths = /year|yr/.test(unit) ? n * 12 : n;
    }
  }

  // Detect cycle suffix
  let cycleHint: CycleHint = null;
  if (/\/\s*(yr|year|annual|annually|y)\b/.test(raw) || /\bper\s+(year|annum)\b/.test(raw)) {
    cycleHint = 'annual';
  } else if (/\/\s*(mo|month|monthly|m)\b/.test(raw) || /\bper\s+month\b/.test(raw)) {
    cycleHint = 'monthly';
  } else if (/\/\s*(qtr|quarter|quarterly|q)\b/.test(raw) || /\bper\s+quarter\b/.test(raw)) {
    cycleHint = 'quarterly';
  }

  // Extract first numeric token (handles thousands separators and decimals).
  // Match either 1,234.56 style or plain 1234.56.
  const numMatch = raw.match(/(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/);
  if (!numMatch) return { amount: 0, cycleHint, totalMonths };
  const amount = parseFloat(numMatch[1].replace(/,/g, ''));
  return {
    amount: isFinite(amount) ? amount : 0,
    cycleHint,
    totalMonths,
  };
}

// Back-compat wrapper for call sites that only need a number.
function parsePrice(input: unknown): number {
  return parsePriceEx(input).amount;
}

// Reconcile a raw price field with an expected billing cycle.
// - If the string carries a cycle hint that conflicts with `expected`, convert
//   the amount so the stored unit_price matches `expected`. Example:
//     priceFor("$35,000/yr", "monthly") -> 35000/12
//     priceFor("$3,500/mo", "annual")   -> 3500*12
// - "total for N months" is converted to the expected cycle as well.
// - With no hint, the amount is assumed to already be in `expected` units.
function priceFor(input: unknown, expected: BillingCycle): number {
  const { amount, cycleHint, totalMonths } = parsePriceEx(input);
  if (amount <= 0) return 0;

  // "total for N months" wins over cycle hint.
  if (totalMonths && totalMonths > 0) {
    const monthly = amount / totalMonths;
    return roundCurrency(toCycle(monthly, 'monthly', expected));
  }

  if (!cycleHint || cycleHint === expected) return roundCurrency(amount);
  return roundCurrency(toCycle(amount, cycleHint, expected));
}

function toCycle(amount: number, from: BillingCycle, to: BillingCycle): number {
  if (from === to) return amount;
  const monthsPer: Record<BillingCycle, number | null> = {
    one_time: null, monthly: 1, quarterly: 3, annual: 12,
  };
  const f = monthsPer[from];
  const t = monthsPer[to];
  if (f == null || t == null) return amount; // can't convert one_time meaningfully
  return amount * (t / f);
}

function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

function siteName(siteMap: Map<string, string>, slug: string | null | undefined): string {
  if (!slug) return 'LNN';
  return siteMap.get(slug) ?? slug;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildKey(category: string, site: string | null, variant: string, cycle: BillingCycle): string {
  return [category, site ?? 'network', variant, cycle].join('.');
}

// ---------- per-category normalizers ----------
// Each returns an array of normalized rows (0..N) for a single API item.

function normDisplayAd(it: any, siteMap: Map<string, string>): NormalizedProduct[] {
  const upstreamId = isUuid(it?.id) ? it.id : null;
  const site = it?.site ?? it?.site_slug ?? null;
  const sName = siteName(siteMap, site);
  const variant = slugify(it?.product ?? 'display');
  const rawProduct = String(it?.product ?? 'Display Ad');
  const isBundle = /both[_-]?display/i.test(rawProduct);
  const label = isBundle ? 'Billboard & Skyscraper ad bundle' : titleCase(rawProduct);
  const baseName = isBundle ? label : `${label} Display Ad`;
  const monthly = priceFor(it?.monthly_price, 'monthly');
  const annual = priceFor(it?.annual_price, 'annual');
  const impBlurb = it?.est_impressions ? ` Est. ${it.est_impressions} impressions/mo.` : '';
  const out: NormalizedProduct[] = [];

  if (monthly > 0) {
    out.push({
      source_key: buildKey('display', site, variant, 'monthly'),
      upstream_id: upstreamId,
      site_slug: site, variant_slug: variant,
      name: `${baseName} (monthly)`,
      category: 'Display Ads',
      unit_price: monthly, billing_cycle: 'monthly',
      description: `${label} display ad on ${sName}, billed monthly.${impBlurb}`,
    });
  }
  if (annual > 0) {
    out.push({
      source_key: buildKey('display', site, variant, 'annual'),
      upstream_id: upstreamId,
      site_slug: site, variant_slug: variant,
      name: `${baseName} (annual)`,
      category: 'Display Ads',
      unit_price: annual, billing_cycle: 'annual',
      description: `${label} display ad on ${sName}, billed annually.${impBlurb}`,
    });
  }
  return out;
}

function normSponsoredPost(it: any, siteMap: Map<string, string>): NormalizedProduct[] {
  const upstreamId = isUuid(it?.id) ? it.id : null;
  const site = it?.site ?? it?.site_slug ?? null;
  const sName = siteName(siteMap, site);
  const perUnit = priceFor(it?.per_unit_price, 'one_time');
  const bulk = priceFor(it?.bulk_price, 'one_time');
  const threshold = it?.bulk_threshold ?? null;
  const out: NormalizedProduct[] = [];

  if (perUnit > 0) {
    out.push({
      source_key: buildKey('sponsored', site, 'unit', 'one_time'),
      upstream_id: upstreamId,
      site_slug: site, variant_slug: 'unit',
      name: `Sponsored Post`,
      category: 'Sponsored Posts',
      unit_price: perUnit, billing_cycle: 'one_time',
      description: `Single sponsored post on ${sName}.`,
    });
  }
  if (bulk > 0) {
    out.push({
      source_key: buildKey('sponsored', site, 'bulk', 'one_time'),
      upstream_id: upstreamId,
      site_slug: site, variant_slug: 'bulk',
      name: `Sponsored Post (Bulk)`,
      category: 'Sponsored Posts',
      unit_price: bulk, billing_cycle: 'one_time',
      description: `Per-post price for bulk sponsored posts on ${sName}${threshold ? ` (${threshold}+ posts)` : ''}.`,
    });
  }
  return out;
}

function normEmail(it: any, siteMap: Map<string, string>): NormalizedProduct[] {
  const upstreamId = isUuid(it?.id) ? it.id : null;
  const site = it?.site ?? it?.site_slug ?? null;
  const sName = siteName(siteMap, site);
  const blast = priceFor(it?.blast_price, 'one_time');
  const sponsorship = priceFor(it?.sponsorship_weekly_price ?? it?.sponsorship_price, 'one_time');
  const out: NormalizedProduct[] = [];

  if (blast > 0) {
    out.push({
      source_key: buildKey('email', site, 'blast', 'one_time'),
      upstream_id: upstreamId,
      site_slug: site, variant_slug: 'blast',
      name: `Email Blast`,
      category: 'Email',
      unit_price: blast, billing_cycle: 'one_time',
      description: `Dedicated email blast on ${sName}.`,
    });
  }
  if (sponsorship > 0) {
    out.push({
      source_key: buildKey('email', site, 'sponsorship', 'one_time'),
      upstream_id: upstreamId,
      site_slug: site, variant_slug: 'sponsorship',
      name: `Email Sponsorship (Weekly)`,
      category: 'Email',
      unit_price: sponsorship, billing_cycle: 'one_time',
      description: `Weekly newsletter sponsorship on ${sName}.`,
    });
  }
  return out;
}

function normBundle(it: any, siteMap: Map<string, string>): NormalizedProduct[] {
  const upstreamId = isUuid(it?.id) ? it.id : null;
  const site = it?.site ?? it?.site_slug ?? null;
  const sName = siteName(siteMap, site);
  const variant = slugify(it?.bundle_slug ?? it?.slug ?? it?.bundle_name ?? 'bundle');
  const label = it?.bundle_name ?? it?.name ?? 'Bundle';
  const threeMonth = priceFor(it?.three_month_price ?? it?.price_3mo, 'quarterly');
  const annual = priceFor(it?.annual_price ?? it?.price_annual, 'annual');
  const out: NormalizedProduct[] = [];

  if (threeMonth > 0) {
    out.push({
      source_key: buildKey('bundle', site, variant, 'quarterly'),
      upstream_id: upstreamId,
      site_slug: site, variant_slug: variant,
      name: `${label} Bundle (3 month)`,
      category: 'Bundles',
      unit_price: threeMonth, billing_cycle: 'quarterly',
      description: `${label} bundle on ${sName}, 3-month commitment.`,
    });
  }
  if (annual > 0) {
    out.push({
      source_key: buildKey('bundle', site, variant, 'annual'),
      upstream_id: upstreamId,
      site_slug: site, variant_slug: variant,
      name: `${label} Bundle (annual)`,
      category: 'Bundles',
      unit_price: annual, billing_cycle: 'annual',
      description: `${label} bundle on ${sName}, annual commitment.`,
    });
  }
  return out;
}

function normNetworkPackage(it: any): NormalizedProduct[] {
  const upstreamId = isUuid(it?.id) ? it.id : null;
  const variant = slugify(it?.slug ?? it?.name ?? 'network');
  const label = it?.name ?? 'Network Package';
  const detailsBlurb = it?.details ? ` ${it.details}` : '';
  const monthly = priceFor(it?.price ?? it?.monthly_price, 'monthly');
  const annual = priceFor(it?.annual_price, 'annual');
  const oneTime = priceFor(it?.unit_price, 'one_time');
  const baseDesc = it?.description ? `${it.description}.` : `${label} — LNN network-wide.`;
  const desc = (baseDesc + detailsBlurb).trim();
  const out: NormalizedProduct[] = [];

  if (monthly > 0) {
    out.push({
      source_key: buildKey('network', null, variant, 'monthly'),
      upstream_id: upstreamId,
      site_slug: null, variant_slug: variant,
      name: `${label} (monthly)`,
      category: 'Network Packages',
      unit_price: monthly, billing_cycle: 'monthly', description: desc,
    });
  }
  if (annual > 0) {
    out.push({
      source_key: buildKey('network', null, variant, 'annual'),
      upstream_id: upstreamId,
      site_slug: null, variant_slug: variant,
      name: `${label} (annual)`,
      category: 'Network Packages',
      unit_price: annual, billing_cycle: 'annual', description: desc,
    });
  }
  if (monthly === 0 && annual === 0 && oneTime > 0) {
    out.push({
      source_key: buildKey('network', null, variant, 'one_time'),
      upstream_id: upstreamId,
      site_slug: null, variant_slug: variant,
      name: label,
      category: 'Network Packages',
      unit_price: oneTime, billing_cycle: 'one_time', description: desc,
    });
  }
  return out;
}

function normalize(items: any[], siteMap: Map<string, string>): NormalizedProduct[] {
  const out: NormalizedProduct[] = [];

  for (const it of items ?? []) {
    const type = it?.category ?? it?.type ?? it?.kind;
    try {
      switch (type) {
        case 'display_ad':       out.push(...normDisplayAd(it, siteMap)); break;
        case 'sponsored_post':   out.push(...normSponsoredPost(it, siteMap)); break;
        case 'email':            out.push(...normEmail(it, siteMap)); break;
        case 'bundle':           out.push(...normBundle(it, siteMap)); break;
        case 'network_package':  out.push(...normNetworkPackage(it)); break;
        default: break;
      }
    } catch (_e) {
      // Skip malformed items
    }
  }

  // Deduplicate by source_key (last wins)
  const map = new Map<string, NormalizedProduct>();
  for (const p of out) {
    if (!p.source_key) continue;
    map.set(p.source_key, p);
  }
  return Array.from(map.values());
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Determine triggered_by
  let triggeredBy = 'cron';
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
      const { data } = await userClient.auth.getUser(token);
      if (data?.user?.id) triggeredBy = `user:${data.user.id}`;
    } catch (_e) { /* fall back to cron */ }
  }

  // Open run row
  const { data: run, error: runErr } = await admin
    .from('crm_product_sync_runs')
    .insert({ source: 'lnn_pricing_api', triggered_by: triggeredBy, status: 'running' })
    .select()
    .single();

  if (runErr || !run) {
    return new Response(
      JSON.stringify({ error: runErr?.message ?? 'failed to create run' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const runStartIso = run.started_at as string;

  const finish = async (
    status: 'success' | 'partial' | 'error',
    counts: { created: number; updated: number; unchanged: number; archived: number },
    error?: string,
  ) => {
    await admin
      .from('crm_product_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status,
        error: error ?? null,
        created_count: counts.created,
        updated_count: counts.updated,
        unchanged_count: counts.unchanged,
        archived_count: counts.archived,
      })
      .eq('id', run.id);
  };

  // Tracks crm_products IDs whose data changed (created or updated) this run.
  // Used to trigger HubSpot push for linked + sync-enabled products.
  const changedProductIds = new Set<string>();

  try {
    const res = await fetch(PRICING_API_URL);
    if (!res.ok) {
      const body = await res.text();
      await finish('error', { created: 0, updated: 0, unchanged: 0, archived: 0 }, `pricing-api ${res.status}: ${body.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ error: `Pricing API returned ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const json = await res.json().catch(() => null);
    if (!json) {
      await finish('error', { created: 0, updated: 0, unchanged: 0, archived: 0 }, 'invalid JSON from pricing-api');
      return new Response(JSON.stringify({ error: 'Invalid JSON from Pricing API' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sites: any[] = Array.isArray(json.sites) ? json.sites : [];
    const siteMap = new Map<string, string>();
    for (const s of sites) {
      const slug = s?.slug ?? s?.id ?? s?.site;
      const name = s?.name ?? s?.label ?? slug;
      if (slug) siteMap.set(String(slug), String(name));
    }

    const items: any[] = Array.isArray(json.items) ? json.items : Array.isArray(json) ? json : [];
    const normalized = normalize(items, siteMap);

    // Fetch existing LNN-sourced rows for diffing
    const { data: existing, error: exErr } = await admin
      .from('crm_products')
      .select('id, source_key, upstream_id, name, category, unit_price, billing_cycle, description, is_active, site_slug, variant_slug')
      .eq('source', 'lnn_pricing_api');

    if (exErr) throw exErr;

    // Two-tier index:
    //   primary  -> by (upstream_id, billing_cycle, variant_slug)
    //   fallback -> by source_key (legacy identity)
    const byUpstream = new Map<string, any>();
    const byKey = new Map<string, any>();
    const upstreamKey = (uid: string, cycle: string, variant: string) => `${uid}::${cycle}::${variant}`;
    for (const r of existing ?? []) {
      if (r.upstream_id) {
        byUpstream.set(upstreamKey(r.upstream_id as string, r.billing_cycle as string, r.variant_slug as string), r);
      }
      if (r.source_key) byKey.set(r.source_key as string, r);
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const nowIso = new Date().toISOString();

    for (const p of normalized) {
      // Primary lookup by upstream UUID, fallback to legacy source_key.
      let ex: any = null;
      if (p.upstream_id) {
        ex = byUpstream.get(upstreamKey(p.upstream_id, p.billing_cycle, p.variant_slug)) ?? null;
      }
      if (!ex) {
        ex = byKey.get(p.source_key) ?? null;
      }

      if (!ex) {
        const { data: insertedRow, error } = await admin.from('crm_products').insert({
          name: p.name,
          category: p.category,
          unit_price: p.unit_price,
          billing_cycle: p.billing_cycle,
          description: p.description,
          is_active: true,
          source: 'lnn_pricing_api',
          source_key: p.source_key,
          upstream_id: p.upstream_id,
          site_slug: p.site_slug,
          variant_slug: p.variant_slug,
          source_synced_at: nowIso,
        }).select('id').single();
        if (error) throw error;
        if (insertedRow?.id) changedProductIds.add(insertedRow.id);
        created++;
      } else {
        const changed =
          ex.name !== p.name ||
          ex.category !== p.category ||
          Number(ex.unit_price) !== Number(p.unit_price) ||
          ex.billing_cycle !== p.billing_cycle ||
          (ex.description ?? null) !== (p.description ?? null) ||
          ex.site_slug !== p.site_slug ||
          ex.variant_slug !== p.variant_slug ||
          ex.source_key !== p.source_key ||
          (ex.upstream_id ?? null) !== (p.upstream_id ?? null) ||
          ex.is_active !== true;

        if (changed) {
          const { error } = await admin
            .from('crm_products')
            .update({
              name: p.name,
              category: p.category,
              unit_price: p.unit_price,
              billing_cycle: p.billing_cycle,
              description: p.description,
              site_slug: p.site_slug,
              variant_slug: p.variant_slug,
              source_key: p.source_key,
              // Backfill upstream_id on existing rows when we have it.
              upstream_id: p.upstream_id ?? ex.upstream_id ?? null,
              is_active: true,
              source_synced_at: nowIso,
            })
            .eq('id', ex.id);
          if (error) throw error;
          changedProductIds.add(ex.id);
          updated++;
        } else {
          const { error } = await admin
            .from('crm_products')
            .update({ source_synced_at: nowIso })
            .eq('id', ex.id);
          if (error) throw error;
          unchanged++;
        }
      }
    }


    // Archive: any LNN row not touched in this run
    const { data: archivedRows, error: archErr } = await admin
      .from('crm_products')
      .update({ is_active: false })
      .eq('source', 'lnn_pricing_api')
      .eq('is_active', true)
      .lt('source_synced_at', runStartIso)
      .select('id');
    if (archErr) throw archErr;
    const archived = archivedRows?.length ?? 0;

    // Auto-push changed products to HubSpot when the global toggle and per-product
    // sync flag are both on. Best-effort: failures are logged on the link row but
    // do not fail the LNN sync run.
    try {
      const { data: globalSetting } = await admin
        .from('crm_settings')
        .select('value')
        .eq('key', 'hubspot_sync_globally_enabled')
        .maybeSingle();
      if (globalSetting?.value === true && changedProductIds.size > 0) {
        const ids = Array.from(changedProductIds);
        const { data: linked } = await admin
          .from('crm_product_hubspot_links')
          .select('crm_product_id, crm_products!inner(hubspot_sync_enabled)')
          .in('crm_product_id', ids)
          .eq('crm_products.hubspot_sync_enabled', true);
        const toPush = (linked ?? []).map((r: any) => r.crm_product_id);
        if (toPush.length > 0) {
          // Fire-and-forget invoke per product via the dedicated function.
          const fnUrl = `${supabaseUrl}/functions/v1/crm-hubspot-product-sync`;
          await Promise.allSettled(
            toPush.map((id) =>
              fetch(fnUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${serviceKey}`,
                  apikey: serviceKey,
                },
                body: JSON.stringify({ action: 'push_one', crm_product_id: id }),
              }),
            ),
          );
        }
      }
    } catch (e) {
      console.error('HubSpot auto-push failed:', e);
    }

    await finish('success', { created, updated, unchanged, archived });

    return new Response(
      JSON.stringify({ run_id: run.id, created, updated, unchanged, archived }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    await finish('error', { created: 0, updated: 0, unchanged: 0, archived: 0 }, e?.message ?? String(e));
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
