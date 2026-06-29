// Shared site label/color helpers for product site_slug values.
// Mirrors the badges used in ProductSyncPanel.

export const SITE_LABELS: Record<string, string> = {
  alxnow: 'ALXnow',
  arlnow: 'ARLnow',
  ffxnow: 'FFXnow',
  mocoshow: 'MoCoShow',
  popville: 'PoPville',
  potomac: 'Potomac Local',
};

export const SITE_COLORS: Record<string, string> = {
  alxnow: 'bg-blue-100 text-blue-800 border-blue-300',
  arlnow: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  ffxnow: 'bg-violet-100 text-violet-800 border-violet-300',
  mocoshow: 'bg-amber-100 text-amber-900 border-amber-300',
  popville: 'bg-rose-100 text-rose-800 border-rose-300',
  potomac: 'bg-cyan-100 text-cyan-800 border-cyan-300',
};

export const NETWORK_COLOR = 'bg-slate-200 text-slate-800 border-slate-300';
export const FALLBACK_SITE_COLOR = 'bg-muted text-muted-foreground border-border';

export function parseSiteSlugs(siteSlug: string | null | undefined): string[] {
  if (!siteSlug) return [];
  return siteSlug
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function siteLabel(slug: string): string {
  return SITE_LABELS[slug.toLowerCase()] ?? slug.toUpperCase();
}

export function siteColorClass(slug: string): string {
  return SITE_COLORS[slug.toLowerCase()] ?? FALLBACK_SITE_COLOR;
}
