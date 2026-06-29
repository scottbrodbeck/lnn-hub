import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, FileText, Repeat } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useQboInvoicePreview,
  useQboCreateInvoice,
  useQboCreateRecurringInvoice,
} from '@/hooks/useQboInvoice';
import { GenerateAssignmentsDialog } from './GenerateAssignmentsDialog';
import { QboOrgLinkResolver } from './QboOrgLinkResolver';
import { QboOrgPicker } from './QboOrgPicker';
import { useCrmDeal } from '@/hooks/useCrmDeals';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dealId: string;
  onComplete?: () => void;
  /**
   * When true, skip the auto-opening of the assignment scheduler after the
   * invoice is created. The user can still launch it later from the deal sheet.
   */
  skipAssignments?: boolean;
  /** Details of the created invoice (used by the closed-won checklist). */
  onCreated?: (r: {
    qbo_invoices_id: string;
    doc_number?: string | null;
    qbo_url?: string | null;
    invoice_type: 'one_time' | 'recurring';
  }) => void;
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function todayISO() { return new Date().toISOString().slice(0, 10); }
function plusDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function QboCreateInvoiceDialog({ open, onOpenChange, dealId, onComplete, skipAssignments = false, onCreated }: Props) {
  const { data: preview, isLoading, error } = useQboInvoicePreview(dealId, open);
  const { data: deal } = useCrmDeal(open ? dealId : undefined);
  const createOne = useQboCreateInvoice();
  const createRecurring = useQboCreateRecurringInvoice();
  const qc = useQueryClient();

  const [mode, setMode] = useState<'one_time' | 'recurring'>('one_time');
  const [txnDate, setTxnDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(plusDaysISO(30));
  const [sendEmail, setSendEmail] = useState(true);
  const [sendTo, setSendTo] = useState('');
  const [memo, setMemo] = useState('');

  const [cadence, setCadence] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (open && preview) {
      setSendTo(preview.primary_contact_email ?? '');
      setMemo(`Re: ${preview.deal.title}`);
    }
  }, [open, preview?.deal?.id]);

  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);

  const blockers = preview?.blockers ?? [];
  const canSubmit = !!preview && blockers.length === 0;

  const submit = async () => {
    let result: { qbo_invoices_id: string } | undefined;
    if (mode === 'one_time') {
      result = await createOne.mutateAsync({
        deal_id: dealId,
        txn_date: txnDate,
        due_date: dueDate,
        send_email: sendEmail,
        send_to: sendTo || undefined,
        customer_memo: memo || undefined,
      });
    } else {
      result = await createRecurring.mutateAsync({
        deal_id: dealId,
        cadence,
        start_date: startDate,
        end_date: endDate || null,
        customer_memo: memo || undefined,
      }) as any;
    }
    onComplete?.();
    if (result?.qbo_invoices_id) {
      onCreated?.({
        qbo_invoices_id: result.qbo_invoices_id,
        doc_number: (result as any)?.doc_number ?? null,
        qbo_url: (result as any)?.qbo_url ?? null,
        invoice_type: mode,
      });
    }
    if (result?.qbo_invoices_id && !skipAssignments) {
      setCreatedInvoiceId(result.qbo_invoices_id);
      setAssignmentsOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  const totals = useMemo(() => preview?.totals ?? { subtotal: 0, total: 0 }, [preview]);

  return (
    <>
    <Dialog open={open && !assignmentsOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create QuickBooks invoice</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Generate an invoice for this deal. You can skip this step now and create one later from the deal panel.
          </p>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Building preview…
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive">Failed to load preview: {(error as Error).message}</div>
        )}

        {preview && (
          <div className="space-y-4">
            {/* Customer + line item summary */}
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{preview.organization.name}</p>
                  <p className="text-xs text-muted-foreground">
                    QBO customer: {preview.organization.qbo_customer_name ?? preview.organization.qbo_customer_id ?? '— not linked —'}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-lg font-semibold">{fmt.format(totals.total)}</div>
                </div>
              </div>
              <ul className="mt-3 space-y-1">
                {preview.line_items.map((l) => (
                  <li key={l.deal_product_id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <span className="truncate">{l.product_name}</span>
                      {!l.ready && (
                        <Badge variant="destructive" className="ml-2 text-[10px]">unlinked</Badge>
                      )}
                      <span className="text-xs text-muted-foreground ml-2">
                        {l.quantity} × {fmt.format(l.unit_price)}
                        {l.discount_pct > 0 && ` − ${l.discount_pct}%`}
                      </span>
                    </div>
                    <span>{fmt.format(l.total)}</span>
                  </li>
                ))}
                {preview.line_items.length === 0 && (
                  <li className="text-sm text-muted-foreground">No line items on this deal.</li>
                )}
              </ul>
            </div>

            {!preview.organization.id && (
              <QboOrgPicker
                dealId={dealId}
                currentPrimaryContactId={(deal as any)?.primary_contact_id ?? null}
                onLinked={() => {
                  qc.invalidateQueries({ queryKey: ['qbo', 'invoice-preview', dealId] });
                  qc.invalidateQueries({ queryKey: ['crm', 'deal', dealId] });
                }}
              />
            )}

            {preview.organization.id && !preview.organization.qbo_customer_id && (
              <QboOrgLinkResolver
                crmOrgId={preview.organization.id}
                crmOrgName={preview.organization.name}
                primaryContactEmail={preview.primary_contact_email}
                onLinked={() => {
                  qc.invalidateQueries({ queryKey: ['qbo', 'invoice-preview', dealId] });
                }}
              />
            )}

            {(() => {
              const otherBlockers = blockers.filter(
                (b) =>
                  !/not linked to a QuickBooks customer/i.test(b) &&
                  !/not linked to an organization/i.test(b),
              );
              if (otherBlockers.length === 0) return null;
              return (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1">
                  <div className="flex items-center gap-2 font-medium text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Cannot create invoice
                  </div>
                  <ul className="list-disc list-inside text-destructive/90">
                    {otherBlockers.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                  <p className="text-xs text-muted-foreground pt-1">
                    Link any unlinked products (Products → QBO) and try again.
                  </p>
                </div>
              );
            })()}

            <Tabs value={mode} onValueChange={(v) => setMode(v as 'one_time' | 'recurring')}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="one_time"><FileText className="h-4 w-4 mr-1" /> One-time</TabsTrigger>
                <TabsTrigger value="recurring"><Repeat className="h-4 w-4 mr-1" /> Recurring</TabsTrigger>
              </TabsList>

              <TabsContent value="one_time" className="space-y-3 mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1">
                    <Label>Invoice date</Label>
                    <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <Label>Due date</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="send-email" checked={sendEmail} onCheckedChange={(v) => setSendEmail(!!v)} />
                  <Label htmlFor="send-email" className="text-sm font-normal">Email invoice to customer immediately</Label>
                </div>
                {sendEmail && (
                  <div className="grid gap-1">
                    <Label>Recipient email</Label>
                    <Input
                      type="email"
                      value={sendTo}
                      onChange={(e) => setSendTo(e.target.value)}
                      placeholder="customer@example.com"
                    />
                    {!sendTo && (
                      <p className="text-xs text-muted-foreground">No primary contact email on the deal — add one or fill in here.</p>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="recurring" className="space-y-3 mt-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1">
                    <Label>Cadence</Label>
                    <Select value={cadence} onValueChange={(v) => setCadence(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label>Start date</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="grid gap-1">
                    <Label>End date (optional)</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  QuickBooks will generate each invoice automatically on the cadence above. Recurring invoices are not emailed by default — adjust send options on the recurring template in QBO if needed.
                </p>
              </TabsContent>
            </Tabs>

            <div className="grid gap-1">
              <Label>Memo (optional)</Label>
              <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Skip for now</Button>
          <Button
            onClick={submit}
            disabled={!canSubmit || createOne.isPending || createRecurring.isPending}
          >
            {(createOne.isPending || createRecurring.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {mode === 'one_time' ? 'Create invoice' : 'Schedule recurring invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <GenerateAssignmentsDialog
      open={assignmentsOpen}
      onOpenChange={(o) => {
        setAssignmentsOpen(o);
        if (!o) onOpenChange(false);
      }}
      qboInvoicesId={createdInvoiceId}
    />
    </>
  );
}
