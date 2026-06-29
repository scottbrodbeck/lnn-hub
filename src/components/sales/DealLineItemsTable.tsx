import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput } from '@/components/ui/command';
import { Check, ChevronsUpDown, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseSiteSlugs, siteLabel, siteColorClass } from '@/lib/siteLabels';
import { useCrmProductsLite, type CrmProductLite } from '@/hooks/useCrmProductsLite';
import {
  useAddDealProduct,
  useCrmDealProducts,
  useRemoveDealProduct,
  useUpdateDealProduct,
} from '@/hooks/useCrmDealProducts';

function SiteBadgesInline({ siteSlug }: { siteSlug: string | null | undefined }) {
  const slugs = parseSiteSlugs(siteSlug);
  if (slugs.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {slugs.map((slug) => (
        <Badge
          key={slug}
          variant="outline"
          className={`text-[10px] px-1.5 py-0 whitespace-nowrap ${siteColorClass(slug)}`}
        >
          {siteLabel(slug)}
        </Badge>
      ))}
    </span>
  );
}

const NO_SITE = '__none__';

// Strip trailing " (monthly|annual|quarterly|one-time|one time)" from a product name.
function baseProductName(name: string): string {
  return name.replace(/\s*\((?:monthly|annual|quarterly|one[- ]?time)\)\s*$/i, '').trim();
}

type Variants = Partial<Record<CrmProductLite['billing_cycle'], CrmProductLite>>;
type ProductGroup = {
  key: string;
  baseName: string;
  category: string | null;
  variants: Variants;
  hasMonthly: boolean;
  hasAnnual: boolean;
  fallback: CrmProductLite;
};

interface Props {
  dealId: string;
  blanketDiscountPct?: number;
  onTotalsChange?: (totals: { subtotal: number; total: number }) => void;
}

export function DealLineItemsTable({ dealId, blanketDiscountPct = 0, onTotalsChange }: Props) {
  const { data: items = [] } = useCrmDealProducts(dealId);
  const { data: products = [] } = useCrmProductsLite();
  const add = useAddDealProduct();
  const update = useUpdateDealProduct();
  const remove = useRemoveDealProduct();

  // Two-step picker state
  const [siteValue, setSiteValue] = useState<string | null>(null); // null = nothing chosen; NO_SITE sentinel for "No site"
  const [sitePopoverOpen, setSitePopoverOpen] = useState(false);
  const [siteQuery, setSiteQuery] = useState('');
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [productPopoverOpen, setProductPopoverOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [annual, setAnnual] = useState(false);

  const subtotal = items.reduce((s, i) => s + Number(i.total ?? 0), 0);
  const discountPct = Math.max(0, Math.min(100, Number(blanketDiscountPct) || 0));
  const total = Math.round(subtotal * (1 - discountPct / 100) * 100) / 100;
  if (onTotalsChange) onTotalsChange({ subtotal, total });

  // Distinct sites across active products. Multi-site products surface under every site.
  const sites = useMemo(() => {
    const set = new Set<string>();
    let hasNullSite = false;
    for (const p of products) {
      const slugs = parseSiteSlugs(p.site_slug);
      if (slugs.length === 0) hasNullSite = true;
      else slugs.forEach((s) => set.add(s.toLowerCase()));
    }
    const arr = Array.from(set).sort((a, b) =>
      siteLabel(a).localeCompare(siteLabel(b), undefined, { sensitivity: 'base' }),
    );
    return { slugs: arr, hasNullSite };
  }, [products]);

  const filteredSites = useMemo(() => {
    const q = siteQuery.trim().toLowerCase();
    if (!q) return sites.slugs;
    return sites.slugs.filter((s) => `${s} ${siteLabel(s)}`.toLowerCase().includes(q));
  }, [sites.slugs, siteQuery]);

  // Group products for the chosen site into base-name groups with billing-cycle variants.
  const groupsForSite = useMemo<ProductGroup[]>(() => {
    if (siteValue === null) return [];
    const wantNull = siteValue === NO_SITE;
    const targetSlug = wantNull ? null : siteValue.toLowerCase();

    const matching = products.filter((p) => {
      const slugs = parseSiteSlugs(p.site_slug);
      if (wantNull) return slugs.length === 0;
      return slugs.some((s) => s.toLowerCase() === targetSlug);
    });

    const byKey = new Map<string, ProductGroup>();
    for (const p of matching) {
      const base = baseProductName(p.name);
      const key = `${base.toLowerCase()}::${(p.category ?? '').toLowerCase()}`;
      let g = byKey.get(key);
      if (!g) {
        g = {
          key,
          baseName: base,
          category: p.category,
          variants: {},
          hasMonthly: false,
          hasAnnual: false,
          fallback: p,
        };
        byKey.set(key, g);
      }
      if (!g.variants[p.billing_cycle]) g.variants[p.billing_cycle] = p;
      if (p.billing_cycle === 'monthly') g.hasMonthly = true;
      if (p.billing_cycle === 'annual') g.hasAnnual = true;
    }
    return Array.from(byKey.values()).sort((a, b) =>
      a.baseName.localeCompare(b.baseName, undefined, { sensitivity: 'base' }),
    );
  }, [products, siteValue]);

  const filteredGroups = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return groupsForSite;
    return groupsForSite.filter((g) =>
      `${g.baseName} ${g.category ?? ''}`.toLowerCase().includes(q),
    );
  }, [groupsForSite, productQuery]);

  const selectedGroup = groupsForSite.find((g) => g.key === groupKey) ?? null;
  const showAnnualToggle = !!selectedGroup && selectedGroup.hasMonthly && selectedGroup.hasAnnual;

  const resolvedProduct: CrmProductLite | null = useMemo(() => {
    if (!selectedGroup) return null;
    if (showAnnualToggle) {
      return (annual ? selectedGroup.variants.annual : selectedGroup.variants.monthly) ?? null;
    }
    return (
      selectedGroup.variants.monthly ??
      selectedGroup.variants.annual ??
      selectedGroup.variants.quarterly ??
      selectedGroup.variants.one_time ??
      selectedGroup.fallback
    );
  }, [selectedGroup, showAnnualToggle, annual]);

  const onPickSite = (value: string) => {
    setSiteValue(value);
    setSitePopoverOpen(false);
    setSiteQuery('');
    setGroupKey(null);
    setProductQuery('');
    setAnnual(false);
  };

  const addItem = async () => {
    if (!resolvedProduct) return;
    await add.mutateAsync({
      deal_id: dealId,
      product_id: resolvedProduct.id,
      quantity: 1,
      unit_price: resolvedProduct.unit_price ?? 0,
      discount_pct: 0,
    });
    setGroupKey(null);
    setProductQuery('');
    setAnnual(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Step 1: Site picker */}
        <Popover open={sitePopoverOpen} onOpenChange={setSitePopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={sitePopoverOpen}
              className="w-[200px] justify-between font-normal"
            >
              <span className={cn('flex items-center gap-2 truncate', !siteValue && 'text-muted-foreground')}>
                {siteValue === null ? (
                  'Select site'
                ) : siteValue === NO_SITE ? (
                  'No site'
                ) : (
                  <SiteBadgesInline siteSlug={siteValue} />
                )}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search sites…"
                value={siteQuery}
                onValueChange={setSiteQuery}
              />
              <div
                className="max-h-72 overflow-y-auto overscroll-contain p-1"
                onWheel={(event) => event.stopPropagation()}
                role="listbox"
              >
                {filteredSites.length === 0 && !sites.hasNullSite ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No sites found.
                  </div>
                ) : (
                  <>
                    {filteredSites.map((slug) => (
                      <button
                        key={slug}
                        type="button"
                        className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus:bg-accent"
                        onClick={() => onPickSite(slug)}
                      >
                        <Check
                          className={cn(
                            'h-4 w-4 shrink-0',
                            siteValue === slug ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <SiteBadgesInline siteSlug={slug} />
                      </button>
                    ))}
                    {sites.hasNullSite &&
                      (!siteQuery.trim() ||
                        'no site'.includes(siteQuery.trim().toLowerCase())) && (
                        <button
                          type="button"
                          className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus:bg-accent"
                          onClick={() => onPickSite(NO_SITE)}
                        >
                          <Check
                            className={cn(
                              'h-4 w-4 shrink-0',
                              siteValue === NO_SITE ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="text-muted-foreground">No site</span>
                        </button>
                      )}
                  </>
                )}
              </div>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Step 2: Product picker, scoped to chosen site */}
        <Popover open={productPopoverOpen} onOpenChange={setProductPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={productPopoverOpen}
              disabled={siteValue === null}
              className="flex-1 min-w-[240px] justify-between font-normal"
            >
              <span className={cn('truncate', !selectedGroup && 'text-muted-foreground')}>
                {selectedGroup ? (
                  <>
                    {selectedGroup.baseName}
                    {selectedGroup.category && (
                      <span className="text-muted-foreground"> ({selectedGroup.category})</span>
                    )}
                  </>
                ) : siteValue === null ? (
                  'Choose a site first'
                ) : (
                  'Select product'
                )}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search products…"
                value={productQuery}
                onValueChange={setProductQuery}
              />
              <div
                className="max-h-72 overflow-y-auto overscroll-contain p-1"
                onWheel={(event) => event.stopPropagation()}
                role="listbox"
              >
                {filteredGroups.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No products found.
                  </div>
                ) : (
                  filteredGroups.map((g) => {
                    const onlyCycle =
                      !g.hasMonthly && !g.hasAnnual
                        ? (g.fallback.billing_cycle as string)
                        : null;
                    return (
                      <button
                        key={g.key}
                        type="button"
                        className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus:bg-accent"
                        onClick={() => {
                          setGroupKey(g.key);
                          setAnnual(false);
                          setProductPopoverOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'h-4 w-4 shrink-0',
                            groupKey === g.key ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate flex-1 min-w-0">
                          {g.baseName}
                          {g.category && (
                            <span className="text-muted-foreground"> ({g.category})</span>
                          )}
                          {onlyCycle && (
                            <span className="text-muted-foreground">
                              {' '}
                              · {onlyCycle.replace('_', ' ')}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </Command>
          </PopoverContent>
        </Popover>

        {showAnnualToggle && (
          <Label className="flex items-center gap-2 text-sm font-normal cursor-pointer select-none">
            <Checkbox
              checked={annual}
              onCheckedChange={(v) => setAnnual(v === true)}
            />
            Annual
          </Label>
        )}

        <Button onClick={addItem} disabled={!resolvedProduct || add.isPending}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No line items.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="w-20">Qty</TableHead>
              <TableHead className="w-28">Unit price</TableHead>
              <TableHead className="w-24">Discount %</TableHead>
              <TableHead className="w-28 text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.product_name}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={it.quantity}
                    onChange={(e) =>
                      update.mutate({ id: it.id, deal_id: dealId, quantity: Number(e.target.value) })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={it.unit_price}
                    onChange={(e) =>
                      update.mutate({ id: it.id, deal_id: dealId, unit_price: Number(e.target.value) })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    value={it.discount_pct}
                    onChange={(e) =>
                      update.mutate({ id: it.id, deal_id: dealId, discount_pct: Number(e.target.value) })
                    }
                  />
                </TableCell>
                <TableCell className="text-right">${Number(it.total).toLocaleString()}</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate({ id: it.id, deal_id: dealId })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={4} className="text-right font-medium">Subtotal</TableCell>
              <TableCell className="text-right font-semibold">
                ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell />
            </TableRow>
            {discountPct > 0 && (
              <>
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-muted-foreground">
                    Blanket discount ({discountPct}%)
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    −${(subtotal - total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-medium">Total</TableCell>
                  <TableCell className="text-right font-semibold">
                    ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
