import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput } from '@/components/ui/command';
import { Trophy, X as XIcon, RotateCcw, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCrmDeal,
  useCrmDealStageHistory,
  useMarkDealLost,
  useMarkDealWon,
  useReopenDeal,
  useUpdateCrmDeal,
} from '@/hooks/useCrmDeals';
import { StagePicker } from './StagePicker';
import { DealLineItemsTable } from './DealLineItemsTable';
import { WonLostDialog } from './WonLostDialog';
import { MarkWonDialog } from './MarkWonDialog';
import { QboCreateInvoiceDialog } from './QboCreateInvoiceDialog';
import { GenerateAssignmentsDialog } from './GenerateAssignmentsDialog';
import { CalendarRange } from 'lucide-react';
import { ActivityTimeline } from './ActivityTimeline';
import { OwnerPicker } from './OwnerPicker';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useCrmOrganization, useCrmOrganizationsSearch } from '@/hooks/useCrmOrganizations';
import { useDealInvoices, useQboRefreshInvoice } from '@/hooks/useQboInvoice';
import { format } from 'date-fns';
import { FileText, RefreshCw } from 'lucide-react';
import { ClosedWonChecklist } from './closedWon/ClosedWonChecklist';
import { useUpdateWonFlow } from '@/hooks/useDealWonFlow';

import { Badge as DaysBadge } from '@/components/ui/badge';
import { SyncStatusBadge } from './SyncStatusBadge';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dealId: string | null;
}

export function DealDetailSheet({ open, onOpenChange, dealId }: Props) {
  const { data: deal } = useCrmDeal(dealId ?? undefined);
  const update = useUpdateCrmDeal();
  
  const won = useMarkDealWon();
  const lost = useMarkDealLost();
  const reopen = useReopenDeal();
  const { data: history = [] } = useCrmDealStageHistory(dealId ?? undefined);
  const { data: contacts = [] } = useCrmContacts({ organizationId: (deal as any)?.crm_organization_id });
  const [debouncedOrgQuery, setDebouncedOrgQuery] = useState('');
  const { data: orgs = [] } = useCrmOrganizationsSearch(debouncedOrgQuery);
  const { data: selectedOrgRow } = useCrmOrganization(
    (deal as any)?.crm_organization_id ?? undefined,
  );
  

  
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [assignInvoiceId, setAssignInvoiceId] = useState<string | null>(null);
  const updateWonFlow = useUpdateWonFlow();
  const [lineSubtotal, setLineSubtotal] = useState<number>(0);
  const [lineTotal, setLineTotal] = useState<number>(0);
  const [titleDraft, setTitleDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [valueDraft, setValueDraft] = useState<string>('');
  const [discountDraft, setDiscountDraft] = useState<string>('0');
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false);
  const [orgQuery, setOrgQuery] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedOrgQuery(orgQuery), 200);
    return () => clearTimeout(t);
  }, [orgQuery]);

  const { data: invoices = [] } = useDealInvoices(dealId ?? undefined);
  const refreshInvoice = useQboRefreshInvoice();

  useEffect(() => {
    setTitleDraft((deal as any)?.title ?? '');
    setNotesDraft((deal as any)?.notes ?? '');
    setValueDraft(((deal as any)?.value ?? 0).toString());
    setDiscountDraft(((deal as any)?.blanket_discount_pct ?? 0).toString());
  }, [deal?.id]);

  if (!deal) return null;
  const d: any = deal;

  // Days in current stage = days since most recent stage change (or deal creation)
  const lastStageChange = history?.[0]?.changed_at ?? d.created_at;
  const daysInStage = Math.max(
    0,
    Math.floor((Date.now() - new Date(lastStageChange).getTime()) / (1000 * 60 * 60 * 24))
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <Input
                className="text-3xl font-bold border-0 focus-visible:ring-0 px-0 h-auto py-1"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => titleDraft !== d.title && update.mutate({ id: d.id, title: titleDraft } as any)}
              />
              <SheetTitle className="sr-only">{d.title}</SheetTitle>
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <Badge style={d.stage?.color ? { backgroundColor: d.stage.color } : undefined}>
                  {d.stage?.name}
                </Badge>
                <Badge variant={d.status === 'won' ? 'default' : d.status === 'lost' ? 'destructive' : 'secondary'}>
                  {d.status}
                </Badge>
                <DaysBadge variant="outline">
                  {daysInStage} {daysInStage === 1 ? 'day' : 'days'} in stage
                </DaysBadge>
                <SyncStatusBadge
                  status={(d as any).sync_status}
                  error={(d as any).sync_error}
                  hubspotId={(d as any).hubspot_id}
                />
                {d.organization?.name && <span className="text-sm text-muted-foreground">· {d.organization.name}</span>}
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="line-items">Products</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {d.status === 'won' && (
              <ClosedWonChecklist
                deal={d}
                crmOrg={selectedOrgRow}
                invoices={invoices}
                onCreateInvoice={() => setInvoiceOpen(true)}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Stage</Label>
                <StagePicker
                  pipelineId={d.pipeline_id}
                  value={d.stage_id}
                  onChange={(v) => update.mutate({ id: d.id, stage_id: v } as any)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Value (USD)</Label>
                <Input
                  type="number"
                  value={valueDraft}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setValueDraft(e.target.value)}
                  onBlur={() => {
                    const next = valueDraft === '' ? 0 : Number(valueDraft);
                    if (!Number.isNaN(next) && next !== Number(d.value)) {
                      update.mutate({ id: d.id, value: next } as any);
                    }
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label>Expected close</Label>
                <Input
                  type="date"
                  value={d.expected_close_date ?? ''}
                  onChange={(e) => update.mutate({ id: d.id, expected_close_date: e.target.value } as any)}
                />
              </div>
              {(() => {
                const list = orgs as any[];
                const selectedOrg =
                  list.find((o) => o.id === d.crm_organization_id) ??
                  (d.crm_organization_id && selectedOrgRow
                    ? { id: selectedOrgRow.id, name: (selectedOrgRow as any).name }
                    : null);
                const filteredOrgs = list;
                return (
                  <div className="grid gap-2">
                    <Label>Organization</Label>
                    <Popover
                      open={orgPopoverOpen}
                      onOpenChange={(nextOpen) => {
                        setOrgPopoverOpen(nextOpen);
                        if (!nextOpen) setOrgQuery('');
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={orgPopoverOpen}
                          className={cn(
                            'w-full justify-between font-normal',
                            !selectedOrg && 'text-muted-foreground',
                          )}
                        >
                          {selectedOrg?.name ?? 'Select organization'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-0 w-[--radix-popover-trigger-width]"
                        align="start"
                      >
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search organizations…"
                            value={orgQuery}
                            onValueChange={setOrgQuery}
                          />
                          <div
                            className="max-h-72 overflow-y-auto overscroll-contain p-1"
                            onWheel={(event) => event.stopPropagation()}
                            role="listbox"
                          >
                            {filteredOrgs.length === 0 ? (
                              <div className="py-6 text-center text-sm text-muted-foreground">
                                No organizations found.
                              </div>
                            ) : (
                              filteredOrgs.map((o: any) => (
                                <button
                                  key={o.id}
                                  type="button"
                                  role="option"
                                  aria-selected={d.crm_organization_id === o.id}
                                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                                  onClick={() => {
                                    if (o.id !== d.crm_organization_id) {
                                      const patch: any = { id: d.id, crm_organization_id: o.id };
                                      // Contact is org-scoped — clear it when switching orgs so we
                                      // don't keep a stale cross-org reference.
                                      if (d.primary_contact_id) patch.primary_contact_id = null;
                                      update.mutate(patch);
                                    }
                                    setOrgPopoverOpen(false);
                                    setOrgQuery('');
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      d.crm_organization_id === o.id ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
                                  {o.name}
                                </button>
                              ))
                            )}
                          </div>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              })()}
              {(() => {
                const contactLabel = (c: any) =>
                  `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email || '(no name)';
                const selectedContact = (contacts as any[]).find(
                  (c) => c.id === d.primary_contact_id,
                );
                const q = contactQuery.trim().toLowerCase();
                const base = q
                  ? (contacts as any[]).filter((c) => contactLabel(c).toLowerCase().includes(q))
                  : (contacts as any[]);
                const filtered = base
                  .slice()
                  .sort((a, b) =>
                    contactLabel(a).localeCompare(contactLabel(b), undefined, { sensitivity: 'base' }),
                  );
                return (
                  <div className="grid gap-2">
                    <Label>Primary contact</Label>
                    <Popover
                      open={contactPopoverOpen}
                      onOpenChange={(nextOpen) => {
                        setContactPopoverOpen(nextOpen);
                        if (!nextOpen) setContactQuery('');
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={contactPopoverOpen}
                          className={cn(
                            'w-full justify-between font-normal',
                            !selectedContact && 'text-muted-foreground',
                          )}
                        >
                          {selectedContact ? contactLabel(selectedContact) : 'None'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-0 w-[--radix-popover-trigger-width]"
                        align="start"
                      >
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search contacts…"
                            value={contactQuery}
                            onValueChange={setContactQuery}
                          />
                          <div
                            className="max-h-72 overflow-y-auto overscroll-contain p-1"
                            onWheel={(event) => event.stopPropagation()}
                            role="listbox"
                          >
                            {filtered.length === 0 ? (
                              <div className="py-6 text-center text-sm text-muted-foreground">
                                No contacts found.
                              </div>
                            ) : (
                              filtered.map((c: any) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  role="option"
                                  aria-selected={d.primary_contact_id === c.id}
                                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                                  onClick={() => {
                                    update.mutate({ id: d.id, primary_contact_id: c.id } as any);
                                    setContactPopoverOpen(false);
                                    setContactQuery('');
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      d.primary_contact_id === c.id ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
                                  {contactLabel(c)}
                                </button>
                              ))
                            )}
                          </div>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              })()}
              <div className="grid gap-2">
                <Label>Owner</Label>
                <OwnerPicker
                  value={d.owner_user_id ?? null}
                  onChange={(v) => update.mutate({ id: d.id, owner_user_id: v } as any)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                rows={4}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => notesDraft !== d.notes && update.mutate({ id: d.id, notes: notesDraft } as any)}
              />
            </div>

            <div className="flex items-center gap-3 pt-2 border-t flex-wrap">
              {d.status === 'open' ? (
                <>
                  <Button onClick={() => setWonOpen(true)}>
                    <Trophy className="h-4 w-4 mr-1" /> Mark Won
                  </Button>
                  <Button variant="outline" onClick={() => setLostOpen(true)}>
                    <XIcon className="h-4 w-4 mr-1" /> Mark Lost
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => reopen.mutate(d.id)}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Reopen
                </Button>
              )}
              <Button variant="outline" onClick={() => setInvoiceOpen(true)}>
                <FileText className="h-4 w-4 mr-1" /> Create QBO invoice
              </Button>
            </div>
            {d.status === 'lost' && d.lost_reason && (
              <p className="text-sm"><span className="text-muted-foreground">Lost reason: </span>{d.lost_reason}</p>
            )}

            {invoices.length > 0 && (
              <div className="rounded-md border p-3 mt-3">
                <p className="text-sm font-medium mb-2">QuickBooks invoices</p>
                <ul className="space-y-2">
                  {invoices.map((inv: any) => (
                    <li key={inv.id} className="flex items-center justify-between text-sm gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {inv.invoice_type === 'recurring'
                              ? `Recurring (${inv.recurrence_cadence})`
                              : `Invoice ${inv.doc_number ?? inv.qbo_invoice_id ?? ''}`}
                          </span>
                          <Badge
                            variant={
                              inv.status === 'paid' ? 'default'
                              : inv.status === 'overdue' || inv.status === 'failed' ? 'destructive'
                              : 'secondary'
                            }
                            className="text-[10px]"
                          >
                            {inv.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ${Number(inv.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          {inv.balance != null && Number(inv.balance) !== Number(inv.total) &&
                            ` · balance $${Number(inv.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                          {inv.due_date && ` · due ${format(new Date(inv.due_date), 'MMM d, yyyy')}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Generate assignments"
                          onClick={() => setAssignInvoiceId(inv.id)}
                        >
                          <CalendarRange className="h-3 w-3" />
                        </Button>
                        {inv.invoice_type === 'one_time' && inv.qbo_invoice_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={refreshInvoice.isPending}
                            onClick={() => refreshInvoice.mutate({ id: inv.id })}
                            title="Refresh status"
                          >
                            <RefreshCw className={`h-3 w-3 ${refreshInvoice.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="line-items" className="space-y-3 mt-4">
            <DealLineItemsTable
              dealId={d.id}
              blanketDiscountPct={Number(discountDraft) || 0}
              onTotalsChange={({ subtotal, total }) => {
                setLineSubtotal(subtotal);
                setLineTotal(total);
              }}
            />
            {lineSubtotal > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="blanket-discount" className="text-sm text-muted-foreground whitespace-nowrap">
                    Blanket discount %
                  </Label>
                  <Input
                    id="blanket-discount"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    className="w-24 h-9"
                    value={discountDraft}
                    onChange={(e) => setDiscountDraft(e.target.value)}
                    onBlur={() => {
                      const next = Math.max(0, Math.min(100, Number(discountDraft) || 0));
                      if (next !== Number(d.blanket_discount_pct ?? 0)) {
                        update.mutate({ id: d.id, blanket_discount_pct: next } as any);
                      }
                      setDiscountDraft(String(next));
                    }}
                  />
                </div>
                {lineTotal === Number(d.value) ? (
                  <Button variant="outline" size="sm" disabled>
                    Deal value matches products total
                  </Button>
                ) : (
                  <Button
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: d.id, value: lineTotal } as any)}
                    className="shadow-sm"
                  >
                    {update.isPending ? 'Updating…' : 'Set deal value to products total'}
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stage changes yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h: any) => (
                  <li key={h.id} className="text-sm border rounded-md p-3">
                    <span className="text-muted-foreground">
                      {new Date(h.changed_at).toLocaleString()} —{' '}
                    </span>
                    {h.from_stage?.name ?? '∅'} → <strong>{h.to_stage?.name ?? '∅'}</strong>
                    {h.changed_by_profile && (
                      <span className="text-muted-foreground"> by {h.changed_by_profile.full_name ?? h.changed_by_profile.email}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="activities" className="mt-4">
            <ActivityTimeline dealId={d.id} />
          </TabsContent>
        </Tabs>

        <MarkWonDialog
          open={wonOpen}
          onOpenChange={setWonOpen}
          onConfirm={async ({ closeDate }) => {
            const result: any = await won.mutateAsync({
              id: d.id,
              expected_close_date: closeDate,
              pipeline_id: d.pipeline_id,
              stage_id: d.stage_id,
            });
            if (result?.wonStageMissing) {
              void updateWonFlow(d, { hubspot: { won_stage_missing: true } });
            }
          }}
        />
        <WonLostDialog
          open={lostOpen}
          onOpenChange={setLostOpen}
          mode="lost"
          onConfirm={async ({ reason }) => { await lost.mutateAsync({ id: d.id, lost_reason: reason ?? '' }); }}
        />
        <QboCreateInvoiceDialog
          open={invoiceOpen}
          onOpenChange={setInvoiceOpen}
          dealId={d.id}
          skipAssignments={d.status === 'won'}
          onCreated={(r) => {
            if (d.status === 'won') {
              void updateWonFlow(d, {
                invoice: {
                  status: 'done',
                  qbo_invoices_id: r.qbo_invoices_id,
                  doc_number: r.doc_number ?? null,
                  qbo_url: r.qbo_url ?? null,
                  invoice_type: r.invoice_type,
                },
              });
            }
          }}
        />
        <GenerateAssignmentsDialog
          open={!!assignInvoiceId}
          onOpenChange={(o) => { if (!o) setAssignInvoiceId(null); }}
          qboInvoicesId={assignInvoiceId}
        />
      </SheetContent>
    </Sheet>
  );
}
