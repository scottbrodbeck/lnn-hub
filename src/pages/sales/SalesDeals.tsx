import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Download } from 'lucide-react';
import { useCrmDealsPaged, type CrmDealStatus } from '@/hooks/useCrmDeals';
import { useCrmPipelines, useCrmStages } from '@/hooks/useCrmPipeline';
import { DealFormDialog } from '@/components/sales/DealFormDialog';
import { DealDetailSheet } from '@/components/sales/DealDetailSheet';
import { OwnerFilter, resolveOwnerFilter } from '@/components/sales/OwnerFilter';
import { useAuth } from '@/contexts/AuthContext';
import { downloadCsv } from '@/lib/crmCsv';
import { SortableHeader, type SortState } from '@/components/sales/SortableHeader';
import { TablePagination } from '@/components/sales/TablePagination';

type DealSortKey = 'title' | 'value' | 'expected_close_date' | 'status' | 'updated_at';

export default function SalesDeals() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [pipelineId, setPipelineId] = useState<string>('all');
  const [stageId, setStageId] = useState<string>('all');
  const [status, setStatus] = useState<CrmDealStatus | 'all'>('open');
  const ownerFilter = params.get('owner') ?? 'all';
  const setOwnerFilter = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === 'all') next.delete('owner');
    else next.set('owner', v);
    setParams(next, { replace: true });
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<DealSortKey>>({ key: 'title', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => { setPage(1); }, [search, pipelineId, stageId, status, ownerFilter, sort, pageSize]);

  const { data: pipelines = [] } = useCrmPipelines();
  const { data: stages = [] } = useCrmStages(pipelineId === 'all' ? undefined : pipelineId);
  const { data, isLoading } = useCrmDealsPaged({
    page,
    pageSize,
    search,
    pipelineId: pipelineId === 'all' ? undefined : pipelineId,
    stageId: stageId === 'all' ? undefined : stageId,
    ownerId: resolveOwnerFilter(ownerFilter, user?.id),
    status,
    sortKey: sort.key,
    sortDir: sort.dir,
  });
  const deals = data?.rows ?? [];
  const total = data?.total ?? 0;

  const exportCsv = () => {
    downloadCsv(
      `deals-${new Date().toISOString().slice(0, 10)}.csv`,
      deals.map((d) => ({
        title: d.title,
        organization: d.organization_name ?? '',
        contact: d.contact_name ?? '',
        stage: d.stage_name ?? '',
        value: d.value,
        currency: d.currency,
        expected_close: d.expected_close_date ?? '',
        owner: d.owner_name ?? '',
        status: d.status,
        updated_at: d.updated_at,
      }))
    );
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Deals</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={deals.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export CSV (page)
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Deal
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search title…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId('all'); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pipelines</SelectItem>
            {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stageId} onValueChange={setStageId} disabled={pipelineId === 'all'}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All stages" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader<DealSortKey> label="Title" sortKey="title" sort={sort} onSortChange={setSort} />
              <TableHead>Organization</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Stage</TableHead>
              <SortableHeader<DealSortKey> label="Value" sortKey="value" sort={sort} onSortChange={setSort} align="right" />
              <SortableHeader<DealSortKey> label="Expected close" sortKey="expected_close_date" sort={sort} onSortChange={setSort} />
              <TableHead>Owner</TableHead>
              <SortableHeader<DealSortKey> label="Status" sortKey="status" sort={sort} onSortChange={setSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : deals.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No deals.</TableCell></TableRow>
            ) : (
              deals.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => setActiveId(d.id)}>
                  <TableCell className="font-medium">{d.title}</TableCell>
                  <TableCell className="text-muted-foreground">{d.organization_name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{d.contact_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" style={d.stage_color ? { backgroundColor: d.stage_color, color: 'white' } : undefined}>
                      {d.stage_name ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">${Number(d.value).toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">{d.expected_close_date ? format(new Date(d.expected_close_date), 'M/d/yyyy') : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{d.owner_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={d.status === 'won' ? 'default' : d.status === 'lost' ? 'destructive' : 'secondary'}>
                      {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />

      <DealFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DealDetailSheet
        open={!!activeId}
        onOpenChange={(o) => !o && setActiveId(null)}
        dealId={activeId}
      />
    </div>
  );
}
