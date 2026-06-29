import type { CrmProduct, CrmBillingCycle } from '@/hooks/useCrmProducts';

export type HubspotProductLite = {
  id: string;
  name: string;
  price?: string | number | null;
  sku?: string | null;
  recurring?: string | null;
};

export type MatchSignal = 'sku' | 'upstream_id' | 'name_exact' | 'name_fuzzy' | 'price' | 'billing';

export type ScoredMatch = {
  product: CrmProduct;
  score: number; // 0-100
  signals: MatchSignal[];
  label: 'High' | 'Medium' | 'Low';
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Simple token-overlap (Jaccard) similarity, 0..1
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(normalize(a).split(' ').filter(Boolean));
  const tb = new Set(normalize(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => { if (tb.has(t)) inter += 1; });
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function billingMatches(hsRecurring: string | null | undefined, cycle: CrmBillingCycle): boolean {
  if (!hsRecurring) return cycle === 'one_time';
  const r = hsRecurring.toLowerCase();
  if (cycle === 'monthly') return r.includes('month');
  if (cycle === 'quarterly') return r.includes('quarter');
  if (cycle === 'annual') return r.includes('annual') || r.includes('year');
  return false;
}

export function scoreMatch(hs: HubspotProductLite, product: CrmProduct): ScoredMatch | null {
  const signals: MatchSignal[] = [];
  let score = 0;

  // 1. Upstream ID embedded in HubSpot SKU (strongest)
  const sku = (hs.sku ?? '').trim();
  if (product.upstream_id && sku) {
    const skuUuidMatch = sku.match(UUID_RE);
    if (skuUuidMatch && skuUuidMatch[0].toLowerCase() === product.upstream_id.toLowerCase()) {
      score += 70;
      signals.push('upstream_id');
    }
  }

  // 2. SKU exact match against source_key (legacy stable id)
  if (sku && product.source_key && sku.toLowerCase() === product.source_key.toLowerCase()) {
    score += 50;
    signals.push('sku');
  }

  // 3. Name similarity
  const nameSim = nameSimilarity(hs.name, product.name);
  if (nameSim >= 0.999) {
    score += 40;
    signals.push('name_exact');
  } else if (nameSim >= 0.5) {
    score += Math.round(nameSim * 30);
    signals.push('name_fuzzy');
  }

  // 4. Price proximity (within 1%)
  const hsPrice = hs.price != null ? Number(hs.price) : NaN;
  if (Number.isFinite(hsPrice) && product.unit_price > 0) {
    const diff = Math.abs(hsPrice - product.unit_price) / product.unit_price;
    if (diff < 0.01) {
      score += 15;
      signals.push('price');
    } else if (diff < 0.1) {
      score += 5;
    }
  }

  // 5. Billing cycle match
  if (billingMatches(hs.recurring, product.billing_cycle)) {
    score += 10;
    signals.push('billing');
  }

  if (score <= 0) return null;
  score = Math.min(100, score);

  const label: ScoredMatch['label'] = score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low';
  return { product, score, signals, label };
}

export function rankMatches(hs: HubspotProductLite, products: CrmProduct[], limit = 3): ScoredMatch[] {
  const scored = products
    .map((p) => scoreMatch(hs, p))
    .filter((m): m is ScoredMatch => m !== null)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function signalLabel(s: MatchSignal): string {
  switch (s) {
    case 'upstream_id': return 'Upstream ID';
    case 'sku': return 'SKU';
    case 'name_exact': return 'Name';
    case 'name_fuzzy': return 'Name ~';
    case 'price': return 'Price';
    case 'billing': return 'Billing';
  }
}
