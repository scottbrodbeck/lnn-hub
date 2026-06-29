import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, CalendarRange, Repeat, FileText } from 'lucide-react';
import {
  useAssignmentPlan,
  useCreateAssignments,
  type AssignmentLinePlan,
} from '@/hooks/useQboInvoiceAssignments';
import { useCrmOrganization } from '@/hooks/useCrmOrganizations';
import { LinkAdminClientDialog } from './LinkAdminClientDialog';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  qboInvoicesId?: string | null;
  /** Plan straight from deal products when there is no invoice. */
  dealId?: string | null;
  onComplete?: () => void;
  onResult?: (r: { created: number; assignment_ids: string[]; unscheduled: boolean }) => void;
}

export function GenerateAssignmentsDialog({ open, onOpenChange, qboInvoicesId, dealId, onComplete, onResult }: Props) {
  const { data: plan, isLoading, error } = useAssignmentPlan(
    { qboInvoicesId: qboInvoicesId ?? null, dealId: dealId ?? null },
    open,
  );
  const createMut = useCreateAssignments();

  const [lines, setLines] = useState<AssignmentLinePlan[]>([]);
  const [months, setMonths] = useState<number>(3);
  const [baseDate, setBaseDate] = useState<string>('');
  const [unscheduled, setUnscheduled] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const { data: crmOrg } = useCrmOrganization(plan?.invoice.organization_id);

  useEffect(() => {
    if (plan) {
      setLines(plan.lines);
      setMonths(plan.defaults.default_months_for_recurring);
      setUnscheduled(false);
      setBaseDate(
        plan.invoice.invoice_type === 'recurring'
          ? plan.invoice.recurrence_start_date ?? new Date().toISOString().slice(0, 10)
          : plan.invoice.txn_date ?? new Date().toISOString().slice(0, 10),
      );
    }
  }, [plan?.invoice?.id, plan?.invoice?.deal_id]);

  const isRecurring = plan?.invoice.invoice_type === 'recurring';
  const cadence = plan?.invoice.recurrence_cadence ?? 'monthly';
  const intervalMonths = cadence === 'quarterly' ? 3 : cadence === 'yearly' ? 12 : 1;
  const cycles = isRecurring ? Math.max(1, Math.ceil(months / intervalMonths)) : 1;

  const totalToCreate = useMemo(
    () => lines.filter((l) => !l.skip).reduce((s, l) => s + l.count * cycles, 0),
    [lines, cycles],
  );

  const orgBlocker = plan && !plan.invoice.organization_linked_org_id
    ? 'This sales organization is not linked to an admin organization. Link it from the org panel before generating assignments.'
    : null;

  const lineBlockers = lines.flatMap((l) =>
    l.skip ? [] : (!l.site_id ? [`"${l.product_name}" — pick a site`] : [])
  );
  const canSubmit = !!plan && !orgBlocker && lineBlockers.length === 0 && totalToCreate > 0;

  const updateLine = (idx: number, patch: Partial<AssignmentLinePlan>) => {
    setLines((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const submit = async () => {
    if (!plan || (!qboInvoicesId && !dealId)) return;
    const result = await createMut.mutateAsync({
      ...(qboInvoicesId ? { qbo_invoices_id: qboInvoicesId } : { deal_id: dealId }),
      months_to_schedule: isRecurring ? months : undefined,
      base_date: baseDate,
      unscheduled,
      lines: lines.map((l) => ({
        deal_product_id: l.deal_product_id,
        product_id: l.product_id,
        product_name: l.product_name,
        count: l.count,
        site_id: l.site_id ?? '',
        post_type: l.post_type,
        content_category: l.content_category,
        stagger: l.stagger,
        skip: l.skip,
        bundle_label: l.bundle_label ?? null,
      })),
    });
    onResult?.({ created: result.created, assignment_ids: result.assignment_ids, unscheduled });
    onComplete?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Generate assignments
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Materialize content assignments for each invoice line. They will appear in the
            admin assignment list, ready to be scheduled and edited.
          </p>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading plan…
          </div>
        )}
        {error && <div className="text-sm text-destructive">Failed: {(error as Error).message}</div>}

        {plan && (
          <div className="space-y-4">
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isRecurring ? <Repeat className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  <span className="font-medium">
                    {plan.source === 'deal'
                      ? 'From deal products (no invoice)'
                      : isRecurring
                        ? `Recurring (${cadence})`
                        : 'One-time invoice'}
                  </span>
                  <span className="text-muted-foreground">· {plan.invoice.organization_name}</span>
                </div>
                <Badge variant="secondary">
                  {totalToCreate} assignment{totalToCreate === 1 ? '' : 's'} will be created
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Assignments will be created under admin client:</span>
                {plan.invoice.organization_linked_org_id ? (
                  <Badge variant="outline" className="font-medium">
                    {plan.invoice.organization_linked_org_name ?? 'Linked organization'}
                    {plan.invoice.organization_linked_org_client_code
                      ? ` · ${plan.invoice.organization_linked_org_client_code}`
                      : ''}
                  </Badge>
                ) : (
                  <Badge variant="destructive">Not linked</Badge>
                )}
              </div>
            </div>


            {plan.already_created_count > 0 && (
              <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                {plan.already_created_count} assignment(s) were previously generated for this
                {plan.source === 'deal' ? ' deal' : ' invoice'}. Re-running will skip duplicates.
              </div>
            )}

            {orgBlocker && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive space-y-2">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <span>{orgBlocker}</span>
                </div>
                <div className="flex gap-2 pl-6">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!crmOrg}
                    onClick={() => setLinkOpen(true)}
                  >
                    Link or create admin client
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="unscheduled-toggle"
                checked={unscheduled}
                onCheckedChange={(v) => setUnscheduled(!!v)}
              />
              <Label htmlFor="unscheduled-toggle" className="text-sm font-normal">
                Create as unscheduled (no due dates — schedule later from the admin dashboard)
              </Label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <Label>{isRecurring ? 'First cycle start' : 'Base due date'}</Label>
                <Input
                  type="date"
                  value={baseDate}
                  disabled={unscheduled}
                  onChange={(e) => setBaseDate(e.target.value)}
                />
              </div>
              {isRecurring && (
                <div className="grid gap-1">
                  <Label>Months to schedule (max {plan.defaults.max_months_for_recurring})</Label>
                  <Input
                    type="number"
                    min={1}
                    max={plan.defaults.max_months_for_recurring}
                    value={months}
                    onChange={(e) => setMonths(Math.max(1, Math.min(plan.defaults.max_months_for_recurring, Number(e.target.value) || 1)))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {cycles} cycle{cycles === 1 ? '' : 's'} of {cadence} invoicing
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Line items</Label>
              {lines.map((l, idx) => {
                const isPost = l.assignment_kind === 'post';
                const isDisplayAd = l.assignment_kind === 'display_ad';
                const isUnknown = l.assignment_kind === 'unknown';
                const allowSkipToggle = isPost || isUnknown; // display ads are always skipped here
                return (
                  <div
                    key={l.line_key}
                    className={`rounded-md border p-3 space-y-2 ${l.skip ? 'opacity-70 bg-muted/20' : ''} ${l.parent_deal_product_id ? 'ml-4 border-l-2' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {l.bundle_label ? <span className="text-xs text-muted-foreground">↳</span> : null}
                          {l.bundle_label ?? l.product_name}
                          {l.parent_deal_product_id && (
                            <Badge variant="outline" className="text-[10px]">Bundle item</Badge>
                          )}
                          {isDisplayAd && (
                            <Badge variant="secondary" className="text-[10px]">Display ad</Badge>
                          )}
                          {isUnknown && (
                            <Badge variant="destructive" className="text-[10px]">Unmapped</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {l.parent_deal_product_id ? `from ${l.product_name} · ` : ''}
                          {l.product_category ?? 'Uncategorized'} ·{' '}
                          {l.product_site_slug ?? 'no site slug'}
                        </div>
                      </div>
                      {allowSkipToggle && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Checkbox
                            id={`skip-${l.line_key}`}
                            checked={l.skip}
                            onCheckedChange={(v) =>
                              updateLine(idx, { skip: !!v, count: v ? 0 : Math.max(1, l.count || 1) })
                            }
                          />
                          <Label htmlFor={`skip-${l.line_key}`} className="text-xs font-normal">
                            Skip
                          </Label>
                        </div>
                      )}
                    </div>

                    {isDisplayAd && (
                      <div className="text-xs text-muted-foreground rounded bg-muted/40 px-2 py-1.5">
                        Display ad — managed in <span className="font-medium">Display Ads</span>, not as a post assignment. This line is skipped here.
                      </div>
                    )}

                    {isUnknown && l.skip && (
                      <div className="text-xs text-muted-foreground rounded bg-muted/40 px-2 py-1.5">
                        Unmapped category. Use <span className="font-medium">Override mapping</span> below to route it manually, or fix the product category and reopen this dialog.
                      </div>
                    )}

                    {!l.skip && isPost && (
                      <div className="grid gap-2 md:grid-cols-4">
                        <div className="grid gap-1">
                          <Label className="text-xs">Count / cycle</Label>
                          <Input
                            type="number"
                            min={0}
                            value={l.count}
                            onChange={(e) => updateLine(idx, { count: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </div>
                        <div className="grid gap-1 md:col-span-2">
                          <Label className="text-xs">Site</Label>
                          <Select
                            value={l.site_id ?? ''}
                            onValueChange={(v) => {
                              const s = plan.sites.find((x) => x.id === v);
                              updateLine(idx, { site_id: v, site_name: s?.name ?? null });
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                            <SelectContent>
                              {plan.sites.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Stagger</Label>
                          <Select value={l.stagger} onValueChange={(v) => updateLine(idx, { stagger: v as any })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None (same day)</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="biweekly">Bi-weekly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {!l.skip && isPost && (
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="mr-1">{l.content_category}</Badge>
                        <Badge variant="outline">{l.post_type}</Badge>
                        <span className="ml-2">
                          → {l.count * cycles} assignment{l.count * cycles === 1 ? '' : 's'} total
                        </span>
                      </div>
                    )}

                    {/* Per-line override (post path only — unknown can also use it to route manually) */}
                    {(isPost || isUnknown) && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Override mapping
                        </summary>
                        <div className="grid gap-2 md:grid-cols-2 mt-2">
                          <div className="grid gap-1">
                            <Label className="text-xs">Content category</Label>
                            <Select
                              value={l.content_category}
                              onValueChange={(v) =>
                                updateLine(idx, {
                                  content_category: v,
                                  assignment_kind: 'post',
                                  skip: false,
                                  count: Math.max(1, l.count || 1),
                                })
                              }
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="website">website</SelectItem>
                                <SelectItem value="email_blast">email_blast</SelectItem>
                                <SelectItem value="email_sponsorship">email_sponsorship</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-1">
                            <Label className="text-xs">Post type</Label>
                            <Select
                              value={l.post_type}
                              onValueChange={(v) =>
                                updateLine(idx, {
                                  post_type: v,
                                  assignment_kind: 'post',
                                  skip: false,
                                  count: Math.max(1, l.count || 1),
                                })
                              }
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="standard">standard</SelectItem>
                                <SelectItem value="sponsored">sponsored</SelectItem>
                                <SelectItem value="newsletter">newsletter</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </details>
                    )}

                    {l.blockers.length > 0 && !l.skip && (
                      <div className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {l.blockers.join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })}
              {lines.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No line items on this {plan.source === 'deal' ? 'deal' : 'invoice'}.
                </div>
              )}
            </div>

            {lineBlockers.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                Resolve before continuing: {lineBlockers.join(' · ')}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!canSubmit || createMut.isPending} onClick={submit}>
            {createMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Create {totalToCreate} assignment{totalToCreate === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
      {crmOrg && (
        <LinkAdminClientDialog open={linkOpen} onOpenChange={setLinkOpen} crmOrg={crmOrg} />
      )}
    </Dialog>
  );
}
