import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RefreshCw,
  Eraser,
  AlertTriangle,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useHubspotGlobalToggle,
  useHubspotProducts,
  useHubspotProductLinks,
  useLinkHubspotProduct,
  useUnlinkHubspotProduct,
  usePushOne,
  
} from '@/hooks/useHubspotProductSync';
import {
  useQboItems,
  useQboLinkProduct,
  useQboUnlinkProduct,
  useQboStaleLinks,
  useClearStaleQboLinks,
  useQboGlobalToggle,
  useQboSyncFieldsGlobal,
  useQboUpdateProducts,
  useQboBackfillNames,
} from '@/hooks/useQboProductSync';
import { useCrmProducts, type CrmProduct } from '@/hooks/useCrmProducts';

const NONE = '__none__';

const SITE_LABELS: Record<string, string> = {
  alxnow: 'ALXnow',
  arlnow: 'ARLnow',
  ffxnow: 'FFXnow',
  mocoshow: 'MoCoShow',
  popville: 'PoPville',
  potomac: 'Potomac Local',
};

// Per-site color coding. Uses Tailwind palette directly for distinct, recognizable
// brand-ish accents. Kept subtle (light bg + saturated border/text) for readability.
const SITE_COLORS: Record<string, string> = {
  alxnow: 'bg-blue-100 text-blue-800 border-blue-300',
  arlnow: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  ffxnow: 'bg-violet-100 text-violet-800 border-violet-300',
  mocoshow: 'bg-amber-100 text-amber-900 border-amber-300',
  popville: 'bg-rose-100 text-rose-800 border-rose-300',
  potomac: 'bg-cyan-100 text-cyan-800 border-cyan-300',
};

const NETWORK_COLOR = 'bg-slate-200 text-slate-800 border-slate-300';
const FALLBACK_COLOR = 'bg-muted text-muted-foreground border-border';

function SiteBadges({ product }: { product: CrmProduct }) {
  const slugs = (product.site_slug ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (slugs.length === 0) {
    if (product.source === 'lnn_pricing_api') {
      return (
        <Badge
          variant="outline"
          className={`text-[10px] px-2 py-0 whitespace-nowrap ${NETWORK_COLOR}`}
        >
          Network
        </Badge>
      );
    }
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {slugs.map((slug) => {
        const key = slug.toLowerCase();
        const color = SITE_COLORS[key] ?? FALLBACK_COLOR;
        return (
          <Badge
            key={slug}
            variant="outline"
            className={`text-[10px] px-2 py-0 whitespace-nowrap ${color}`}
          >
            {SITE_LABELS[key] ?? slug.toUpperCase()}
          </Badge>
        );
      })}
    </div>
  );
}

export function ProductSyncPanel({ canEdit }: { canEdit: boolean }) {
  // HubSpot
  const hsToggle = useHubspotGlobalToggle();
  const globalEnabled = hsToggle.data === true;
  const hsQuery = useHubspotProducts(true);
  const { data: hsLinks = [], refetch: refetchHsLinks } = useHubspotProductLinks();
  const hsLinkMut = useLinkHubspotProduct();
  const hsUnlinkMut = useUnlinkHubspotProduct();
  const pushOne = usePushOne({ silent: true });
  

  // QBO
  const qboToggle = useQboGlobalToggle();
  const qboGlobalEnabled = qboToggle.data === true;
  const qboQuery = useQboItems(true);
  const qboLink = useQboLinkProduct();
  const qboUnlink = useQboUnlinkProduct();
  const qboSyncFields = useQboSyncFieldsGlobal();
  const qboUpdate = useQboUpdateProducts({ silent: true });
  const stale = useQboStaleLinks(true);
  const clearStale = useClearStaleQboLinks();
  const backfillQboNames = useQboBackfillNames();

  // One-shot: after QBO catalog loads, backfill missing qbo_item_name on linked
  // products so future loads can render labels from local data instantly.
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (backfilledRef.current) return;
    if (!qboQuery.data?.items?.length) return;
    backfilledRef.current = true;
    backfillQboNames.mutate();
  }, [qboQuery.data, backfillQboNames]);

  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Local products
  const { data: products = [], isLoading: productsLoading } = useCrmProducts({});

  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  const hsLinkByProductId = useMemo(
    () => new Map(hsLinks.map((l) => [l.crm_product_id, l])),
    [hsLinks],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeOnly && !p.is_active) return false;
      if (!s) return true;
      return (
        p.name.toLowerCase().includes(s) ||
        (p.category ?? '').toLowerCase().includes(s) ||
        (p.site_slug ?? '').toLowerCase().includes(s)
      );
    });
  }, [products, search, activeOnly]);

  const hsItems = useMemo(
    () =>
      [...(hsQuery.data?.items ?? [])].sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
      ),
    [hsQuery.data],
  );
  const qboItems = useMemo(
    () =>
      [...(qboQuery.data?.items ?? [])].sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }),
      ),
    [qboQuery.data],
  );
  const qboEnv = qboQuery.data?.environment ?? stale.data?.current_environment ?? null;
  const staleCount = stale.data?.items?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header / global controls */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Product sync</CardTitle>
              <CardDescription>
                Map each local product to its counterpart in HubSpot and QuickBooks.
                Local products (driven by the LNN Pricing API) remain the source of truth; mappings flow one-way out.
              </CardDescription>
            </div>
            <div className="flex items-center gap-4 shrink-0 flex-wrap">
              {qboEnv && (
                <Badge
                  variant={qboEnv === 'production' ? 'default' : 'secondary'}
                  className="uppercase tracking-wide"
                >
                  QBO: {qboEnv}
                </Badge>
              )}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>HubSpot sync</span>
                <Switch
                  checked={globalEnabled}
                  disabled={!canEdit || hsToggle.isUpdating}
                  onCheckedChange={(v) => hsToggle.setEnabled(v)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>QuickBooks sync</span>
                <Switch
                  checked={qboGlobalEnabled}
                  disabled={!canEdit || qboToggle.isUpdating}
                  onCheckedChange={(v) => qboToggle.setEnabled(v)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Sync fields</span>
                <Select
                  value={qboSyncFields.data ?? 'price'}
                  disabled={!canEdit || qboSyncFields.isLoading || qboSyncFields.isUpdating}
                  onValueChange={(v) =>
                    qboSyncFields.setFields(v as 'price' | 'price_name' | 'price_name_description')
                  }
                >
                  <SelectTrigger className="h-9 w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price">Price only</SelectItem>
                    <SelectItem value="price_name">Price + name</SelectItem>
                    <SelectItem value="price_name_description">Price + name + description</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              hsQuery.refetch();
              refetchHsLinks();
              qboQuery.refetch();
              stale.refetch();
            }}
            disabled={hsQuery.isFetching || qboQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${hsQuery.isFetching || qboQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh from HubSpot &amp; QBO
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">
            {hsItems.length} HubSpot products · {qboItems.length} QBO items · {hsLinks.length} HubSpot links
          </span>
        </CardContent>
      </Card>

      {/* Stale link warning */}
      {staleCount > 0 && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  {staleCount} QuickBooks link{staleCount === 1 ? '' : 's'} from a different environment
                </p>
                <p className="text-sm text-muted-foreground">
                  These links were created against another QBO environment (e.g. sandbox) and won&apos;t resolve in the
                  current <span className="font-mono">{qboEnv}</span> environment. Clear them and re-link to QBO items
                  fetched from the current connection.
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={() => setConfirmClear(true)}
              disabled={!canEdit || clearStale.isPending}
            >
              <Eraser className="h-4 w-4 mr-1" />
              Clear stale QBO links
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Mapping table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Local products ({filtered.length})</CardTitle>
              <CardDescription>Pick a HubSpot product and a QuickBooks item for each row.</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
                Active only
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="max-w-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {productsLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading products…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No products match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Local product</TableHead>
                  <TableHead className="w-[140px]">Site</TableHead>
                  <TableHead className="min-w-[280px]">HubSpot product</TableHead>
                  <TableHead className="min-w-[280px]">QuickBooks item</TableHead>
                  <TableHead className="w-[140px] text-right">Manual sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const hsLink = hsLinkByProductId.get(p.id);
                  const qboValue = p.qbo_item_id ?? NONE;
                  const qboMismatch =
                    !!p.qbo_item_id &&
                    !!qboEnv &&
                    p.qbo_environment !== null &&
                    p.qbo_environment !== qboEnv;
                  const qboMissingFromList =
                    !!p.qbo_item_id && qboItems.length > 0 && !qboItems.some((i) => i.id === p.qbo_item_id);

                  return (
                    <TableRow key={p.id}>
                      {/* Local product */}
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          ${Number(p.unit_price).toFixed(2)} · {p.billing_cycle}
                          {p.category ? ` · ${p.category}` : ''}
                          {!p.is_active && <Badge variant="outline" className="ml-2 text-[10px]">archived</Badge>}
                        </div>
                      </TableCell>

                      {/* Site */}
                      <TableCell>
                        <SiteBadges product={p} />
                      </TableCell>

                      {/* HubSpot dropdown */}

                      <TableCell>
                        <Select
                          value={hsLink?.hubspot_product_id ?? NONE}
                          disabled={!canEdit}
                          onValueChange={(v) => {
                            if (v === NONE) {
                              if (hsLink) hsUnlinkMut.mutate(p.id);
                              return;
                            }
                            const it = hsItems.find((x) => x.id === v);
                            // Replace existing link if any
                            const doLink = () =>
                              hsLinkMut.mutate({
                                crmProductId: p.id,
                                hubspotProductId: v,
                                hubspotName: it?.name ?? null,
                                hubspotPrice: it?.price ? Number(it.price) : null,
                              });
                            if (hsLink) {
                              hsUnlinkMut.mutate(p.id, { onSuccess: doLink });
                            } else {
                              doLink();
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={hsLink?.hubspot_name ?? (hsQuery.isLoading ? 'Loading…' : 'Not linked')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>— Not linked —</SelectItem>
                            {/* Stub for currently linked id while catalog is still loading */}
                            {hsLink && !hsItems.some((it) => it.id === hsLink.hubspot_product_id) && (
                              <SelectItem value={hsLink.hubspot_product_id}>
                                {hsLink.hubspot_name ?? hsLink.hubspot_product_id}
                              </SelectItem>
                            )}
                            {hsItems.map((it) => (
                              <SelectItem key={it.id} value={it.id}>
                                {it.name}
                                {it.price ? ` · $${it.price}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* QBO dropdown */}
                      <TableCell>
                        <Select
                          value={qboValue}
                          disabled={!canEdit}
                          onValueChange={(v) => {
                            if (v === NONE) {
                              if (p.qbo_item_id) qboUnlink.mutate({ product_id: p.id });
                              return;
                            }
                            qboLink.mutate({ product_id: p.id, qbo_item_id: v });
                          }}
                        >
                          <SelectTrigger className={qboMismatch || qboMissingFromList ? 'border-destructive' : ''}>
                            <SelectValue placeholder={p.qbo_item_name ?? (qboQuery.isLoading ? 'Loading…' : 'Not linked')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>— Not linked —</SelectItem>
                            {/* If current link isn't in the fetched list, render a stub so the trigger keeps showing the name */}
                            {p.qbo_item_id && !qboItems.some((i) => i.id === p.qbo_item_id) && (
                              <SelectItem value={p.qbo_item_id}>
                                {p.qbo_item_name
                                  ? p.qbo_item_name
                                  : `(stale id ${p.qbo_item_id}${p.qbo_environment ? ` · ${p.qbo_environment}` : ''})`}
                              </SelectItem>
                            )}
                            {qboItems.map((it) => {
                              const fqn = it.fullyQualifiedName ?? '';
                              const parts = fqn.split(':');
                              const category = parts.length > 1 ? parts.slice(0, -1).join(' › ') : '';
                              return (
                                <SelectItem key={it.id} value={it.id}>
                                  {it.name}
                                  {category ? ` · ${category}` : ''}
                                  {it.unitPrice ? ` · $${it.unitPrice.toFixed(2)}` : ''}
                                  {it.sku ? ` · ${it.sku}` : ''}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {(qboMismatch || qboMissingFromList) && (
                          <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Stale link
                            {p.qbo_environment && qboEnv && p.qbo_environment !== qboEnv
                              ? ` (was ${p.qbo_environment}, now ${qboEnv})`
                              : ''}
                          </p>
                        )}
                        {p.qbo_sync_error && (
                          <p className="text-[11px] text-destructive mt-1 truncate" title={p.qbo_sync_error}>
                            {p.qbo_sync_error}
                          </p>
                        )}
                      </TableCell>

                      {/* Manual sync — pushes to HS + QBO based on what's linked and what's globally enabled */}
                      <TableCell className="text-right">
                        {(() => {
                          const canHs = !!hsLink;
                          const canQbo = !!p.qbo_item_id;
                          const enabled = canEdit && (canHs || canQbo);
                          const pending = syncingId === p.id;
                          const tip = !canHs && !canQbo
                            ? 'Link this product to HubSpot or QBO to sync.'
                            : `Will sync to ${[canHs && 'HubSpot', canQbo && 'QuickBooks'].filter(Boolean).join(' + ')} (global toggles only affect the nightly automated sync).`;

                          const hsTs = hsLink?.last_pushed_at ? new Date(hsLink.last_pushed_at).getTime() : 0;
                          const qboTs = p.qbo_synced_at ? new Date(p.qbo_synced_at).getTime() : 0;
                          const lastMs = Math.max(hsTs, qboTs);
                          const lastDate = lastMs > 0 ? new Date(lastMs) : null;

                          const runSync = async () => {
                            setSyncingId(p.id);
                            const sides: { name: string; run: () => Promise<unknown> }[] = [];
                            if (canHs) sides.push({ name: 'HubSpot', run: () => pushOne.mutateAsync(p.id) });
                            if (canQbo) sides.push({ name: 'QuickBooks', run: () => qboUpdate.mutateAsync({ product_ids: [p.id] }) });
                            try {
                              const results = await Promise.allSettled(sides.map((s) => s.run()));
                              const ok: string[] = [];
                              const fail: string[] = [];
                              results.forEach((r, i) => {
                                if (r.status === 'fulfilled') ok.push(sides[i].name);
                                else fail.push(`${sides[i].name} (${(r.reason as Error)?.message ?? 'failed'})`);
                              });
                              if (fail.length === 0) {
                                return `Synced ${p.name} → ${ok.join(' + ')}`;
                              }
                              if (ok.length === 0) {
                                throw new Error(`${p.name} — ${fail.join(', ')}`);
                              }
                              return `Synced ${p.name} → ${ok.join(' + ')} · failed: ${fail.join(', ')}`;
                            } finally {
                              setSyncingId(null);
                            }
                          };

                          return (
                            <div className="flex flex-col items-end gap-0.5">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!enabled || pending}
                                title={tip}
                                onClick={() => {
                                  toast.promise(runSync(), {
                                    loading: `Syncing ${p.name}…`,
                                    success: (msg) => msg as string,
                                    error: (e: Error) => e.message,
                                  });
                                }}
                              >
                                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${pending ? 'animate-spin' : ''}`} />
                                {pending ? 'Syncing…' : 'Sync now'}
                              </Button>
                              <span
                                className="text-[10px] leading-tight text-muted-foreground"
                                title={lastDate ? lastDate.toLocaleString() : undefined}
                              >
                                Last sync: {lastDate ? formatDistanceToNow(lastDate, { addSuffix: true }) : 'never'}
                              </span>
                            </div>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear stale QuickBooks links?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the QBO item id, sync token, and environment marker from {staleCount} product
              {staleCount === 1 ? '' : 's'} so they can be re-linked against the current{' '}
              <span className="font-mono">{qboEnv}</span> connection. HubSpot links are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearStale.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearStale.mutate(undefined, { onSettled: () => setConfirmClear(false) });
              }}
              disabled={clearStale.isPending}
            >
              {clearStale.isPending ? 'Clearing…' : 'Clear links'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
