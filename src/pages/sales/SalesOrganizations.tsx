import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useCrmOrganizationsPaged, type CrmOrgWithStats, type OrgActivityFilter } from '@/hooks/useCrmOrganizations';
import { OrgFormDialog } from '@/components/sales/OrgFormDialog';
import { OrgDetailSheet } from '@/components/sales/OrgDetailSheet';
import { OwnerFilter, resolveOwnerFilter } from '@/components/sales/OwnerFilter';
import { useAuth } from '@/contexts/AuthContext';
import { SortableHeader, type SortState } from '@/components/sales/SortableHeader';
import { TablePagination } from '@/components/sales/TablePagination';

type OrgSortKey = 'name' | 'last_activity_at' | 'updated_at';

export default function SalesOrganizations() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [linkedFilter, setLinkedFilter] = useState<'any' | 'yes' | 'no'>('any');
  const [activityFilter, setActivityFilter] = useState<OrgActivityFilter>('any');
  const ownerFilter = params.get('owner') ?? 'all';
  const setOwnerFilter = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === 'all') next.delete('owner');
    else next.set('owner', v);
    setParams(next, { replace: true });
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<CrmOrgWithStats | null>(null);
  const [sort, setSort] = useState<SortState<OrgSortKey>>({ key: 'last_activity_at', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Reset to page 1 whenever filters or sort change
  useEffect(() => { setPage(1); }, [search, linkedFilter, activityFilter, ownerFilter, sort, pageSize]);

  const { data, isLoading } = useCrmOrganizationsPaged({
    page,
    pageSize,
    search,
    ownerId: resolveOwnerFilter(ownerFilter, user?.id),
    linked: linkedFilter,
    activityFilter,
    sortKey: sort.key,
    sortDir: sort.dir,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Organizations</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Organization
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or website…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['any', 'yes', 'no'] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={linkedFilter === v ? 'default' : 'outline'}
              onClick={() => setLinkedFilter(v)}
            >
              {v === 'any' ? 'All' : v === 'yes' ? 'Linked' : 'Unlinked'}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={activityFilter === 'any' ? 'default' : 'outline'}
            onClick={() => setActivityFilter('any')}
          >
            Any activity
          </Button>
          <Button
            size="sm"
            variant={activityFilter === 'older_6mo' ? 'default' : 'outline'}
            onClick={() => setActivityFilter('older_6mo')}
          >
            Activity 6+ mos
          </Button>
        </div>
        <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader<OrgSortKey> label="Name" sortKey="name" sort={sort} onSortChange={setSort} />
              <SortableHeader<OrgSortKey> label="Last Activity" sortKey="last_activity_at" sort={sort} onSortChange={setSort} />
              <TableHead className="text-right">Contacts</TableHead>
              <TableHead className="text-right">Open deals</TableHead>
              <TableHead className="text-right">Open value</TableHead>
              <TableHead className="text-right">QBO balance</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Linked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No organizations.</TableCell></TableRow>
            ) : (
              rows.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setActive(o)}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell
                    className="text-muted-foreground"
                    title={o.last_activity_at ?? undefined}
                  >
                    {o.last_activity_at
                      ? formatDistanceToNow(new Date(o.last_activity_at), { addSuffix: true })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right">{o.contacts_count}</TableCell>
                  <TableCell className="text-right">{o.open_deals_count}</TableCell>
                  <TableCell className="text-right">${o.open_value.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {o.qbo_customer_id ? (
                      <span className={(o.qbo_balance ?? 0) > 0 ? 'font-medium' : 'text-muted-foreground'}>
                        ${Number(o.qbo_balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.owner_name ?? '—'}</TableCell>
                  <TableCell>
                    {o.linked_org_name ? (
                      <Badge>{o.linked_org_name}</Badge>
                    ) : (
                      <Badge variant="outline">—</Badge>
                    )}
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

      <OrgFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <OrgDetailSheet open={!!active} onOpenChange={(o) => !o && setActive(null)} org={active} />
    </div>
  );
}
