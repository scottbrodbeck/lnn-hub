import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useQboInvoiceDetail, type QboInvoiceStatus } from '@/hooks/useQboCustomerInvoices';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const statusLabel: Record<QboInvoiceStatus, string> = {
  paid: 'Paid',
  partially_paid: 'Partially paid',
  overdue: 'Overdue',
  open: 'Open',
};

function StatusBadge({ status }: { status: QboInvoiceStatus }) {
  const cls =
    status === 'paid'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : status === 'partially_paid'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
        : status === 'overdue'
          ? 'bg-destructive/15 text-destructive'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200';
  return <Badge variant="secondary" className={cls}>{statusLabel[status]}</Badge>;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  qboInvoiceId: string | null;
}

export function QboInvoiceDetailSheet({ open, onOpenChange, qboInvoiceId }: Props) {
  const { data, isLoading, isError, error } = useQboInvoiceDetail(qboInvoiceId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {data?.doc_number ? `Invoice #${data.doc_number}` : 'Invoice'}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…
          </div>
        ) : isError ? (
          <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {(error as any)?.message ?? 'Failed to load invoice'}
          </div>
        ) : !data ? null : data.voided ? (
          <p className="mt-6 text-sm text-muted-foreground">This invoice has been voided in QuickBooks.</p>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={data.status} />
                <span className="text-xs text-muted-foreground">
                  {data.txn_date && <>Issued {data.txn_date}</>}
                  {data.due_date && <> · Due {data.due_date}</>}
                </span>
              </div>
              {data.qbo_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={data.qbo_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> Open in QuickBooks
                  </a>
                </Button>
              )}
            </div>

            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{data.customer.name ?? '—'}</p>
              {data.customer.email && (
                <p className="text-muted-foreground text-xs">{data.customer.email}</p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Line items</p>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.line_items.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No line items</TableCell></TableRow>
                    ) : (
                      data.line_items.map((li, i) => (
                        <TableRow key={i}>
                          <TableCell>{li.description ?? '—'}</TableCell>
                          <TableCell className="text-right">{li.qty}</TableCell>
                          <TableCell className="text-right">{money.format(li.unit_price)}</TableCell>
                          <TableCell className="text-right">{money.format(li.amount)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="rounded-md border p-3 text-sm space-y-1">
              <Row label="Subtotal" value={money.format(data.totals.subtotal)} />
              {data.totals.discount_total !== 0 && (
                <Row label="Discount" value={`-${money.format(Math.abs(data.totals.discount_total))}`} />
              )}
              {data.totals.tax_total !== 0 && (
                <Row label="Tax" value={money.format(data.totals.tax_total)} />
              )}
              <Row label="Total" value={money.format(data.totals.total)} bold />
              <Row label="Amount paid" value={money.format(data.totals.amount_paid)} />
              <Row label="Balance" value={money.format(data.totals.balance)} bold />
            </div>

            {data.payments.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Payments</p>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.date ?? '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{p.method ?? '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{p.ref ?? '—'}</TableCell>
                          <TableCell className="text-right">{money.format(p.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {data.memo && (
              <div>
                <p className="text-sm font-medium mb-1">Customer message</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.memo}</p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : 'text-muted-foreground'}`}>
      <span>{label}</span>
      <span className={bold ? 'text-foreground' : ''}>{value}</span>
    </div>
  );
}
