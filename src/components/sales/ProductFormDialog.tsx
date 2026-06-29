import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useCreateCrmProduct,
  useUpdateCrmProduct,
  useCrmProducts,
  type CrmProduct,
  type CrmBillingCycle,
} from '@/hooks/useCrmProducts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Lock, ChevronsUpDown, Check, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product?: Partial<CrmProduct> | null;
}

const CYCLES: CrmBillingCycle[] = ['one_time', 'monthly', 'quarterly', 'annual'];

const LOCKED_TOOLTIP = 'Synced from LNN Pricing API — edit in the source app.';

const SITE_OPTIONS: { slug: string; label: string }[] = [
  { slug: 'alxnow', label: 'ALXnow' },
  { slug: 'arlnow', label: 'ARLnow' },
  { slug: 'ffxnow', label: 'FFXnow' },
  { slug: 'mocoshow', label: 'MoCoShow' },
  { slug: 'popville', label: 'PoPville' },
  { slug: 'potomac', label: 'Potomac Local' },
];

const NETWORK_KEY = '__network__';

function parseSiteSlug(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export function ProductFormDialog({ open, onOpenChange, product }: Props) {
  const create = useCreateCrmProduct();
  const update = useUpdateCrmProduct();
  const [form, setForm] = useState<Partial<CrmProduct>>({});
  // Site selection: array of slugs, or [NETWORK_KEY] for network
  const [siteSelection, setSiteSelection] = useState<string[]>([]);
  const [sitePopoverOpen, setSitePopoverOpen] = useState(false);
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('');

  const { data: allProducts = [] } = useCrmProducts({});

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) {
      if (p.category?.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allProducts]);

  useEffect(() => {
    const init = product ?? { is_active: true, billing_cycle: 'one_time', unit_price: 0 };
    setForm(init);
    // Initialize site selection from existing product
    if (product?.id) {
      const slugs = parseSiteSlug(product.site_slug);
      // For synced LNN products with no site, treat as network only if synced
      if (slugs.length === 0 && product.source === 'lnn_pricing_api') {
        setSiteSelection([NETWORK_KEY]);
      } else {
        setSiteSelection(slugs);
      }
    } else {
      setSiteSelection([]);
    }
    setCategoryQuery('');
  }, [product, open]);

  const isEdit = !!product?.id;
  const isSynced = product?.source === 'lnn_pricing_api';
  const setField = (k: keyof CrmProduct, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const toggleSite = (slug: string) => {
    setSiteSelection((prev) => {
      if (slug === NETWORK_KEY) {
        return prev.includes(NETWORK_KEY) ? [] : [NETWORK_KEY];
      }
      const withoutNetwork = prev.filter((s) => s !== NETWORK_KEY);
      if (withoutNetwork.includes(slug)) {
        return withoutNetwork.filter((s) => s !== slug);
      }
      return [...withoutNetwork, slug];
    });
  };

  const computedSiteSlug = (): string | null => {
    if (siteSelection.length === 0) return null;
    if (siteSelection.includes(NETWORK_KEY)) return null;
    return siteSelection.join(',');
  };

  const submit = async () => {
    if (!form.name?.trim()) return;
    if (isEdit) {
      const isLocked = product?.source === 'lnn_pricing_api';
      const payload = isLocked
        ? { id: product!.id!, description: form.description ?? null, is_active: form.is_active ?? true }
        : ({ ...form, id: product!.id!, site_slug: computedSiteSlug() } as any);
      await update.mutateAsync(payload as any);
    } else {
      await create.mutateAsync({ ...form, site_slug: computedSiteSlug() } as any);
    }
    onOpenChange(false);
  };

  const lockedField = (node: React.ReactNode) =>
    isSynced ? (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">{node}</div>
          </TooltipTrigger>
          <TooltipContent>{LOCKED_TOOLTIP}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : (
      node
    );

  const siteTriggerLabel = () => {
    if (siteSelection.length === 0) return 'Select sites…';
    if (siteSelection.includes(NETWORK_KEY)) return null;
    return null;
  };

  const filteredCategories = categoryOptions.filter((c) =>
    c.toLowerCase().includes(categoryQuery.trim().toLowerCase()),
  );
  const showCreateCategory =
    categoryQuery.trim().length > 0 &&
    !categoryOptions.some((c) => c.toLowerCase() === categoryQuery.trim().toLowerCase());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? 'Edit Product' : 'New Product'}
            {isSynced && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> LNN
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Name *</Label>
            {lockedField(
              <Input
                value={form.name ?? ''}
                onChange={(e) => setField('name', e.target.value)}
                disabled={isSynced}
              />,
            )}
          </div>

          {/* Site(s) - manual products only */}
          {!isSynced && (
            <div className="grid gap-2">
              <Label>Site(s)</Label>
              <Popover open={sitePopoverOpen} onOpenChange={setSitePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal h-auto min-h-10 py-2"
                  >
                    <div className="flex flex-wrap gap-1 items-center">
                      {siteSelection.length === 0 && (
                        <span className="text-muted-foreground">Select sites…</span>
                      )}
                      {siteSelection.includes(NETWORK_KEY) && (
                        <Badge variant="secondary" className="text-xs">Network (all sites)</Badge>
                      )}
                      {!siteSelection.includes(NETWORK_KEY) &&
                        siteSelection.map((slug) => {
                          const opt = SITE_OPTIONS.find((s) => s.slug === slug);
                          return (
                            <Badge key={slug} variant="outline" className="text-xs gap-1 pr-1">
                              {opt?.label ?? slug}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleSite(slug); }}
                                className="hover:bg-muted rounded-sm"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                    </div>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => toggleSite(NETWORK_KEY)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm text-left"
                    >
                      <Checkbox checked={siteSelection.includes(NETWORK_KEY)} className="pointer-events-none" />
                      <span className="font-medium">Network (all sites)</span>
                    </button>
                    <div className="h-px bg-border my-1" />
                    {SITE_OPTIONS.map((opt) => {
                      const checked = siteSelection.includes(opt.slug);
                      const disabled = siteSelection.includes(NETWORK_KEY);
                      return (
                        <button
                          key={opt.slug}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleSite(opt.slug)}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded-sm text-left',
                            disabled && 'opacity-50 cursor-not-allowed',
                          )}
                        >
                          <Checkbox checked={checked} className="pointer-events-none" />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Category</Label>
              {isSynced ? (
                lockedField(
                  <Input
                    value={form.category ?? ''}
                    onChange={(e) => setField('category', e.target.value)}
                    disabled
                  />,
                )
              ) : (
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      <span className={cn(!form.category && 'text-muted-foreground')}>
                        {form.category || 'Select category…'}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search or type new…"
                        value={categoryQuery}
                        onValueChange={setCategoryQuery}
                      />
                      <CommandList>
                        <CommandEmpty>No matches.</CommandEmpty>
                        {filteredCategories.length > 0 && (
                          <CommandGroup>
                            {filteredCategories.map((c) => (
                              <CommandItem
                                key={c}
                                value={c}
                                onSelect={() => {
                                  setField('category', c);
                                  setCategoryPopoverOpen(false);
                                  setCategoryQuery('');
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    form.category === c ? 'opacity-100' : 'opacity-0',
                                  )}
                                />
                                {c}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {showCreateCategory && (
                          <CommandGroup>
                            <CommandItem
                              value={`__create__${categoryQuery}`}
                              onSelect={() => {
                                setField('category', categoryQuery.trim());
                                setCategoryPopoverOpen(false);
                                setCategoryQuery('');
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Create "{categoryQuery.trim()}"
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Unit price (USD)</Label>
              {lockedField(
                <Input
                  type="number"
                  step="0.01"
                  value={form.unit_price ?? 0}
                  onChange={(e) => setField('unit_price', Number(e.target.value))}
                  disabled={isSynced}
                />,
              )}
            </div>
            <div className="grid gap-2">
              <Label>Billing cycle</Label>
              {lockedField(
                <Select
                  value={(form.billing_cycle ?? 'one_time') as string}
                  onValueChange={(v) => setField('billing_cycle', v as CrmBillingCycle)}
                  disabled={isSynced}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CYCLES.map((c) => (
                      <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>,
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={form.description ?? ''}
              onChange={(e) => setField('description', e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setField('is_active', v)} />
            <Label>Active (available for new line items)</Label>
          </div>
          {isSynced && (
            <p className="text-xs text-muted-foreground">
              Synced from the LNN Pricing API. You can still edit the description and toggle active status locally.
            </p>
          )}
          {isSynced && product?.upstream_id && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Upstream ID</span>
                <code className="font-mono text-[11px] break-all">{product.upstream_id}</code>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => navigator.clipboard?.writeText(product.upstream_id ?? '')}
              >
                Copy
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={!form.name?.trim() || create.isPending || update.isPending}
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
