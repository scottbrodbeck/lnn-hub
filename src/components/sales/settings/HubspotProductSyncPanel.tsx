import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Upload, Link2, Link2Off, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useHubspotGlobalToggle,
  useHubspotProducts,
  useHubspotProductLinks,
  useLinkHubspotProduct,
  useUnlinkHubspotProduct,
  useToggleProductSync,
  usePushOne,
  usePushAll,
} from '@/hooks/useHubspotProductSync';
import { useCrmProducts } from '@/hooks/useCrmProducts';
import { rankMatches, signalLabel, type ScoredMatch } from '@/lib/hubspotMatchScore';
import type { CrmProduct } from '@/hooks/useCrmProducts';

const SITE_LABELS: Record<string, string> = {
  alxnow: 'ALXnow',
  arlnow: 'ARLnow',
  ffxnow: 'FFXnow',
  mocoshow: 'MoCoShow',
  popville: 'PoPville',
  potomac: 'Potomac Local',
};

function siteSlugs(p?: CrmProduct | null): string[] {
  if (!p?.site_slug) return [];
  return p.site_slug.split(',').map((s) => s.trim()).filter(Boolean);
}

function SiteBadges({ product }: { product?: CrmProduct | null }) {
  if (!product) return <span className="text-muted-foreground text-xs">—</span>;
  const slugs = siteSlugs(product);
  if (slugs.length === 0) {
    if (product.source === 'lnn_pricing_api') {
      return (
        <Badge variant="secondary" className="text-[10px] px-2 py-0 whitespace-nowrap">
          Network
        </Badge>
      );
    }
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {slugs.map((slug) => (
        <Badge key={slug} variant="outline" className="text-[10px] px-2 py-0 whitespace-nowrap">
          {SITE_LABELS[slug.toLowerCase()] ?? slug.toUpperCase()}
        </Badge>
      ))}
    </div>
  );
}

export function HubspotProductSyncPanel({ canEdit }: { canEdit: boolean }) {
  const toggle = useHubspotGlobalToggle();
  const globalEnabled = toggle.data === true;

  const { data: crmProducts = [] } = useCrmProducts({});
  const { data: links = [], refetch: refetchLinks } = useHubspotProductLinks();
  const hsQuery = useHubspotProducts(true);
  const linkMut = useLinkHubspotProduct();
  const unlinkMut = useUnlinkHubspotProduct();
  const toggleProduct = useToggleProductSync();
  const pushOne = usePushOne();
  const pushAll = usePushAll();

  const [search, setSearch] = useState('');
  const [pendingLinks, setPendingLinks] = useState<Record<string, string>>({}); // hsId -> crmProductId

  const productsById = useMemo(() => new Map(crmProducts.map((p) => [p.id, p])), [crmProducts]);
  const linksByProduct = useMemo(() => new Map(links.map((l) => [l.crm_product_id, l])), [links]);
  const linkedHsIds = useMemo(() => new Set(links.map((l) => l.hubspot_product_id)), [links]);

  const unmappedHs = useMemo(() => {
    const items = hsQuery.data?.items ?? [];
    const filtered = items.filter((it) => !linkedHsIds.has(it.id));
    if (!search.trim()) return filtered;
    const s = search.toLowerCase();
    return filtered.filter((it) => it.name.toLowerCase().includes(s) || (it.sku ?? '').toLowerCase().includes(s));
  }, [hsQuery.data, linkedHsIds, search]);

  const mappedRows = useMemo(() => {
    return links.map((l) => {
      const product = productsById.get(l.crm_product_id);
      return { link: l, product };
    });
  }, [links, productsById]);

  const availableProductsForLink = useMemo(() => {
    const linkedSet = new Set(links.map((l) => l.crm_product_id));
    return crmProducts.filter((p) => !linkedSet.has(p.id) && p.is_active);
  }, [crmProducts, links]);

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>HubSpot product sync</CardTitle>
              <CardDescription>
                Push product names, prices, and billing cycles from this app into HubSpot.
                Local products (driven by the LNN Pricing API) remain the source of truth.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm text-muted-foreground">Global sync</span>
              <Switch
                checked={globalEnabled}
                disabled={!canEdit || toggle.isUpdating}
                onCheckedChange={(v) => toggle.setEnabled(v)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              hsQuery.refetch();
              refetchLinks();
            }}
            disabled={hsQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${hsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh from HubSpot
          </Button>
          <Button
            size="sm"
            onClick={() => pushAll.mutate()}
            disabled={!globalEnabled || pushAll.isPending}
          >
            <Upload className={`h-4 w-4 mr-1 ${pushAll.isPending ? 'animate-pulse' : ''}`} />
            Push all enabled products
          </Button>
          {hsQuery.data && (
            <span className="text-xs text-muted-foreground ml-2">
              {hsQuery.data.total} HubSpot products · {links.length} mapped
            </span>
          )}
        </CardContent>
      </Card>

      {/* Mapped products */}
      <Card>
        <CardHeader>
          <CardTitle>Mapped products ({mappedRows.length})</CardTitle>
          <CardDescription>Each row shows the local → HubSpot mapping with last push status.</CardDescription>
        </CardHeader>
        <CardContent>
          {mappedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No products mapped yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Local product</TableHead>
                  <TableHead>Site(s)</TableHead>
                  <TableHead>HubSpot product</TableHead>
                  <TableHead>Sync</TableHead>
                  <TableHead>Last push</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappedRows.map(({ link, product }) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <div className="font-medium">{product?.name ?? '(deleted product)'}</div>
                      <div className="text-xs text-muted-foreground">
                        ${product?.unit_price ?? '—'} · {product?.billing_cycle ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <SiteBadges product={product} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{link.hubspot_name ?? link.hubspot_product_id}</div>
                      <div className="text-xs text-muted-foreground font-mono">{link.hubspot_product_id}</div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={product?.hubspot_sync_enabled ?? false}
                        disabled={!product || !canEdit}
                        onCheckedChange={(v) =>
                          product && toggleProduct.mutate({ crmProductId: product.id, enabled: v })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {link.last_push_status === 'success' ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {link.last_pushed_at ? formatDistanceToNow(new Date(link.last_pushed_at), { addSuffix: true }) : 'ok'}
                        </Badge>
                      ) : link.last_push_status === 'error' ? (
                        <Badge variant="destructive" className="gap-1" title={link.last_push_error ?? ''}>
                          <AlertCircle className="h-3 w-3" />
                          Error
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Never pushed</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pushOne.mutate(link.crm_product_id)}
                        disabled={pushOne.isPending}
                      >
                        Push now
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unlinkMut.mutate(link.crm_product_id)}
                        disabled={!canEdit || unlinkMut.isPending}
                      >
                        <Link2Off className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Unmapped HubSpot products */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Unmapped HubSpot products ({unmappedHs.length})</CardTitle>
              <CardDescription>Select a local product to link with each HubSpot product.</CardDescription>
            </div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search HubSpot products…"
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {hsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading HubSpot products…</p>
          ) : hsQuery.error ? (
            <p className="text-sm text-destructive py-4">Failed to load: {(hsQuery.error as Error).message}</p>
          ) : unmappedHs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">All HubSpot products are mapped.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HubSpot product</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Map to local product</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmappedHs.map((hs) => {
                  const selected = pendingLinks[hs.id];
                  const ranked = rankMatches(hs, availableProductsForLink, 3);
                  const top: ScoredMatch | undefined = ranked[0];
                  const value = selected ?? top?.product.id ?? '';
                  const selectedMatch = ranked.find((m) => m.product.id === value);
                  const confidenceVariant: 'default' | 'secondary' | 'outline' =
                    selectedMatch?.label === 'High' ? 'default'
                    : selectedMatch?.label === 'Medium' ? 'secondary'
                    : 'outline';
                  return (
                    <TableRow key={hs.id}>
                      <TableCell>
                        <div className="font-medium">{hs.name}</div>
                        {hs.sku && <div className="text-xs text-muted-foreground font-mono">SKU: {hs.sku}</div>}
                      </TableCell>
                      <TableCell>{hs.price ? `$${hs.price}` : '—'}</TableCell>
                      <TableCell>{hs.recurring ?? 'one-time'}</TableCell>
                      <TableCell className="min-w-[280px]">
                        <Select
                          value={value}
                          onValueChange={(v) => setPendingLinks((prev) => ({ ...prev, [hs.id]: v }))}
                          disabled={!canEdit}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pick a local product…" />
                          </SelectTrigger>
                          <SelectContent>
                            {ranked.length > 0 && (
                              <>
                                {ranked.map((m) => (
                                  <SelectItem key={`s-${m.product.id}`} value={m.product.id}>
                                    {m.product.name} (${m.product.unit_price}) — {m.score}%
                                  </SelectItem>
                                ))}
                              </>
                            )}
                            {availableProductsForLink
                              .filter((p) => !ranked.some((r) => r.product.id === p.id))
                              .map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} (${p.unit_price})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {selectedMatch ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge variant={confidenceVariant} className="text-[10px]">
                              {selectedMatch.label} confidence · {selectedMatch.score}%
                            </Badge>
                            {selectedMatch.signals.map((s) => (
                              <Badge key={s} variant="outline" className="text-[10px]">
                                {signalLabel(s)}
                              </Badge>
                            ))}
                          </div>
                        ) : value ? (
                          <div className="text-xs text-muted-foreground mt-1.5">Manual selection · no auto-match signals</div>
                        ) : (
                          <div className="text-xs text-muted-foreground mt-1.5">No suggestions — pick manually</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          disabled={!value || !canEdit || linkMut.isPending}
                          onClick={() => {
                            if (!value) return;
                            linkMut.mutate(
                              {
                                crmProductId: value,
                                hubspotProductId: hs.id,
                                hubspotName: hs.name,
                                hubspotPrice: hs.price ? Number(hs.price) : null,
                              },
                              {
                                onSuccess: () =>
                                  setPendingLinks((prev) => {
                                    const next = { ...prev };
                                    delete next[hs.id];
                                    return next;
                                  }),
                              },
                            );
                          }}
                        >
                          <Link2 className="h-4 w-4 mr-1" />
                          Link
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
