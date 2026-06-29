import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
// useToggleQboSyncEnabled removed: QBO sync no longer has a per-product toggle.
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, RefreshCw, History, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmProducts, type CrmProduct } from '@/hooks/useCrmProducts';
import { ProductFormDialog } from '@/components/sales/ProductFormDialog';
import { ProductSyncHistoryDialog } from '@/components/sales/ProductSyncHistoryDialog';
import {
  useLatestProductSyncRun,
  useTriggerProductSync,
} from '@/hooks/useLnnProductSync';

import { formatDistanceToNow, format } from 'date-fns';

// Cron runs at 07:00 UTC daily (3:00 AM ET)
function getNextScheduledRun(): Date {
  const next = new Date();
  next.setUTCHours(7, 0, 0, 0);
  if (next.getTime() <= Date.now()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

const CATEGORY_OPTIONS = [
  'all',
  'Display Ads',
  'Sponsored Posts',
  'Email',
  'Bundles',
  'Network Packages',
] as const;

type SortKey = 'name' | 'site' | 'category' | 'unit_price' | 'billing_cycle' | 'is_active' | 'updated_at';
type SortDir = 'asc' | 'desc';

function firstSlug(p: CrmProduct): string | null {
  if (!p.site_slug) return null;
  return p.site_slug.split(',').map((s) => s.trim()).filter(Boolean)[0] ?? null;
}

function siteSortValue(p: CrmProduct): string {
  const first = firstSlug(p);
  if (p.source !== 'lnn_pricing_api') {
    // Manual: sort by site if set, otherwise last
    if (first) return `0_${first.toLowerCase()}`;
    return '~~~';
  }
  if (first) return `0_${first.toLowerCase()}`;
  return `1_network`;
}

const SITE_LABELS: Record<string, string> = {
  alxnow: 'ALXnow',
  arlnow: 'ARLnow',
  ffxnow: 'FFXnow',
  mocoshow: 'MoCoShow',
  popville: 'PoPville',
  potomac: 'Potomac Local',
};

function siteLabel(slug: string): string {
  return SITE_LABELS[slug.toLowerCase()] ?? slug.toUpperCase();
}

// Subtle site-based row tint. Low-opacity Tailwind palette colors so the
// tint reads on both light and dark backgrounds without overpowering content.
const SITE_ROW_CLASSES: Record<string, string> = {
  alxnow:   'bg-blue-500/5 hover:bg-blue-500/10',
  arlnow:   'bg-emerald-500/5 hover:bg-emerald-500/10',
  ffxnow:   'bg-amber-500/5 hover:bg-amber-500/10',
  mocoshow: 'bg-violet-500/5 hover:bg-violet-500/10',
  popville: 'bg-rose-500/5 hover:bg-rose-500/10',
  potomac:  'bg-cyan-500/5 hover:bg-cyan-500/10',
};

function siteRowClass(p: CrmProduct): string {
  const first = firstSlug(p);
  if (p.source !== 'lnn_pricing_api') {
    if (first) return SITE_ROW_CLASSES[first.toLowerCase()] ?? 'hover:bg-muted/50';
    return 'hover:bg-muted/50';
  }
  if (!first) return 'bg-muted/30 hover:bg-muted/50'; // network
  return SITE_ROW_CLASSES[first.toLowerCase()] ?? 'hover:bg-muted/50';
}

export default function SalesProducts() {
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [category, setCategory] = useState<string>('all');
  const [editing, setEditing] = useState<Partial<CrmProduct> | null>(null);
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('site');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data: products = [], isLoading } = useCrmProducts({
    search,
    activeOnly,
    category: category === 'all' ? undefined : category,
  });

  const { data: latestRun } = useLatestProductSyncRun();
  const triggerSync = useTriggerProductSync();
  

  const lnnCount = useMemo(
    () => products.filter((p) => p.source === 'lnn_pricing_api').length,
    [products],
  );

  const sortedProducts = useMemo(() => {
    const arr = [...products];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case 'name': av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case 'site': av = siteSortValue(a); bv = siteSortValue(b); break;
        case 'category': av = (a.category ?? '').toLowerCase(); bv = (b.category ?? '').toLowerCase(); break;
        case 'unit_price': av = Number(a.unit_price); bv = Number(b.unit_price); break;
        case 'billing_cycle': av = a.billing_cycle; bv = b.billing_cycle; break;
        case 'is_active': av = a.is_active ? 1 : 0; bv = b.is_active ? 1 : 0; break;
        case 'updated_at': av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime(); break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      // tiebreaker by name asc
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [products, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  const SortHeader = ({
    label, sortKey: key, className,
  }: { label: string; sortKey: SortKey; className?: string }) => {
    const active = sortKey === key;
    const Icon = !active ? ChevronsUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={cn(
            'inline-flex items-center gap-1 hover:text-foreground transition-colors',
            active ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
          <Icon className="h-3 w-3" />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <a href="/sales/assignment-defaults">Assignment defaults</a>
          </Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Product
          </Button>
        </div>
      </div>

      {/* Sync card */}
      <div className="rounded-lg border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Pricing source: LNN Pricing API</span>
            <Badge variant="secondary">{lnnCount} synced</Badge>
            {latestRun?.status === 'success' && (
              <Badge variant="outline">Healthy</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {latestRun
              ? `Last successful sync ${formatDistanceToNow(new Date(latestRun.started_at), { addSuffix: true })} (${format(new Date(latestRun.started_at), 'MMM d, h:mm a')})`
              : 'No successful sync runs yet'}
            {' • '}
            Next scheduled run {format(getNextScheduledRun(), "MMM d 'at' h:mm a")} ET
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1" /> History
          </Button>
          <Button
            size="sm"
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${triggerSync.isPending ? 'animate-spin' : ''}`} />
            {triggerSync.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c === 'all' ? 'All categories' : c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} id="active-only" />
          <Label htmlFor="active-only">Active only</Label>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader label="Name" sortKey="name" />
              <SortHeader label="Site(s)" sortKey="site" />
              <SortHeader label="Category" sortKey="category" />
              <SortHeader label="Unit price" sortKey="unit_price" className="text-right" />
              <SortHeader label="Billing" sortKey="billing_cycle" />
              <TableHead>QBO</TableHead>
              <SortHeader label="Status" sortKey="is_active" />
              <SortHeader label="Updated" sortKey="updated_at" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : sortedProducts.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No products yet.</TableCell></TableRow>
            ) : (
              sortedProducts.map((p) => (
                <TableRow
                  key={p.id}
                  className={cn('cursor-pointer', siteRowClass(p))}
                  onClick={() => { setEditing(p); setOpen(true); }}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{p.name}</span>
                      {p.hubspot_sync_enabled && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500 text-orange-600">
                          HubSpot
                        </Badge>
                      )}
                      {p.category === 'Bundles' && (
                        <a
                          href={`/sales/products/${p.id}/bundle`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] underline text-muted-foreground hover:text-foreground"
                        >
                          Bundle items
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const slugs = p.site_slug
                        ? p.site_slug.split(',').map((s) => s.trim()).filter(Boolean)
                        : [];
                      if (slugs.length > 0) {
                        return (
                          <div className="flex flex-wrap gap-1">
                            {slugs.map((slug) => (
                              <Badge
                                key={slug}
                                variant="outline"
                                className="text-[10px] px-2 py-0 whitespace-nowrap justify-center"
                              >
                                {siteLabel(slug)}
                              </Badge>
                            ))}
                          </div>
                        );
                      }
                      if (p.source === 'lnn_pricing_api') {
                        return (
                          <Badge variant="secondary" className="text-[10px] px-2 py-0 whitespace-nowrap justify-center">
                            Network
                          </Badge>
                        );
                      }
                      return <span className="text-muted-foreground text-sm">—</span>;
                    })()}
                  </TableCell>
                  <TableCell>{p.category ?? '—'}</TableCell>
                  <TableCell className="text-right">{fmt.format(Number(p.unit_price))}</TableCell>
                  <TableCell className="capitalize">{p.billing_cycle.replace('_', ' ')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {p.qbo_item_id ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500 text-emerald-600">
                          Linked
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                      {p.qbo_sync_error && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0" title={p.qbo_sync_error}>
                          Error
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.is_active
                      ? (p.source === 'lnn_pricing_api'
                          ? <Badge>Active</Badge>
                          : <Badge>Manual</Badge>)
                      : <Badge variant="secondary">Archived</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(p.updated_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ProductFormDialog open={open} onOpenChange={setOpen} product={editing} />
      <ProductSyncHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}
