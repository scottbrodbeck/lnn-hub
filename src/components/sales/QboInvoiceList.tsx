import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronRight, ExternalLink, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useQboCustomerInvoices, type QboInvoiceListItem, type QboInvoiceStatus } from '@/hooks/useQboCustomerInvoices';
import { TablePagination } from './TablePagination';
import { cn } from '@/lib/utils';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const statusLabel: Record<QboInvoiceStatus, string> = {
  paid: 'Paid',
  partially_paid: 'Partially paid',
  overdue: 'Overdue',
  open: 'Open',
};

const statusRank: Record<QboInvoiceStatus, number> = {
  overdue: 0,
  partially_paid: 1,
  open: 2,
  paid: 3,
};

function StatusBadge({ status }: { status: QboInvoiceStatus }) {
  const cls =
    status === 'paid'
      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200'
      : status === 'partially_paid'
        ? 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200'
        : status === 'overdue'
          ? 'bg-destructive/15 text-destructive hover:bg-destructive/15'
          : 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-200';
  return <Badge variant="secondary" className={cls}>{statusLabel[status]}</Badge>;
}

// Parse YYYY-MM-DD as a local-midnight date (avoids TZ shift)
function parseLocalDate(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function daysOverdue(due: string | null): number {
  const d = parseLocalDate(due);
  if (!d) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86_400_000));
}

interface Props {
  qboCustomerId: string;
  onSelect: (invoice: QboInvoiceListItem) => void;
}

export function QboInvoiceList({ qboCustomerId, onSelect }: Props) {
  const { data, isLoading, isError, error, isFetching, refetch } = useQboCustomerInvoices(qboCustomerId);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const invoices = data?.invoices ?? [];
  const total = invoices.length;

  // Aggregates across the full set
  const { totalBalance, overdueBalance, overdueCount, openCount } = useMemo(() => {
    let totalBal = 0;
    let overdueBal = 0;
    let overdueN = 0;
    let openN = 0;
    for (const inv of invoices) {
      if (inv.status !== 'paid') {
        totalBal += inv.balance;
        openN += 1;
      }
      if (inv.status === 'overdue') {
        overdueBal += inv.balance;
        overdueN += 1;
      }
    }
    return { totalBalance: totalBal, overdueBalance: overdueBal, overdueCount: overdueN, openCount: openN };
  }, [invoices]);

  // Sort: overdue first (oldest due), then partial/open (oldest due), then paid (newest first)
  const sorted = useMemo(() => {
    const copy = [...invoices];
    copy.sort((a, b) => {
      const r = statusRank[a.status] - statusRank[b.status];
      if (r !== 0) return r;
      if (a.status === 'paid') {
        return (b.txn_date ?? '').localeCompare(a.txn_date ?? '');
      }
      // unpaid buckets: oldest due first
      const ad = a.due_date ?? a.txn_date ?? '';
      const bd = b.due_date ?? b.txn_date ?? '';
      return ad.localeCompare(bd);
    });
    return copy;
  }, [invoices]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const showSummary = !isLoading && total > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading invoices…' : `${total} invoice${total === 1 ? '' : 's'} from QuickBooks`}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={isFetching} onClick={() => refetch()}>
            {isFetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh
          </Button>
          {data?.customer_qbo_url && (
            <Button size="sm" variant="outline" asChild>
              <a href={data.customer_qbo_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" /> View in QuickBooks
              </a>
            </Button>
          )}
        </div>
      </div>

      {showSummary && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Total Balance Due</div>
            <div className="text-xl font-semibold tabular-nums">{money.format(totalBalance)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {openCount} unpaid invoice{openCount === 1 ? '' : 's'}
            </div>
          </div>
          <div
            className={cn(
              'rounded-md border p-3',
              overdueBalance > 0 && 'border-destructive/40 bg-destructive/5',
            )}
          >
            <div
              className={cn(
                'text-xs flex items-center gap-1',
                overdueBalance > 0 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {overdueBalance > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
              Overdue Balance
            </div>
            <div
              className={cn(
                'text-xl font-semibold tabular-nums',
                overdueBalance > 0 ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {money.format(overdueBalance)}
            </div>
            <div
              className={cn(
                'text-xs mt-0.5',
                overdueBalance > 0 ? 'text-destructive/80' : 'text-muted-foreground',
              )}
            >
              {overdueCount} overdue invoice{overdueCount === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      )}

      {isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {(error as any)?.message ?? 'Failed to load invoices'}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : paged.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No invoices in QuickBooks for this customer.</TableCell></TableRow>
              ) : (
                paged.map((inv) => {
                  const isOverdue = inv.status === 'overdue';
                  const od = isOverdue ? daysOverdue(inv.due_date) : 0;
                  return (
                    <TableRow
                      key={inv.id}
                      className={cn(
                        'cursor-pointer',
                        isOverdue && 'bg-destructive/5 hover:bg-destructive/10',
                      )}
                      onClick={() => onSelect(inv)}
                    >
                      <TableCell className="font-medium">{inv.doc_number ?? inv.id}</TableCell>
                      <TableCell className="text-muted-foreground">{inv.txn_date ?? '—'}</TableCell>
                      <TableCell className={cn(isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                        {inv.due_date ?? '—'}
                        {isOverdue && od > 0 && (
                          <span className="ml-1 text-xs">· {od}d overdue</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money.format(inv.total)}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          isOverdue && 'text-destructive font-semibold',
                        )}
                      >
                        {money.format(inv.balance)}
                      </TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {total > pageSize && (
        <TablePagination
          total={total}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      )}
    </div>
  );
}
