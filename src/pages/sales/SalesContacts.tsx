import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';
import { useCrmContactsPaged, type CrmContactWithOrg } from '@/hooks/useCrmContacts';
import { useCrmOrganizations } from '@/hooks/useCrmOrganizations';
import { ContactFormDialog } from '@/components/sales/ContactFormDialog';
import { ContactDetailSheet } from '@/components/sales/ContactDetailSheet';
import { OwnerFilter, resolveOwnerFilter } from '@/components/sales/OwnerFilter';
import { useAuth } from '@/contexts/AuthContext';
import { SortableHeader, type SortState } from '@/components/sales/SortableHeader';
import { TablePagination } from '@/components/sales/TablePagination';

type ContactSortKey = 'first_name' | 'last_name' | 'title' | 'email' | 'phone' | 'is_primary' | 'updated_at';

export default function SalesContacts() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [orgId, setOrgId] = useState<string>('all');
  const ownerFilter = params.get('owner') ?? 'all';
  const setOwnerFilter = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === 'all') next.delete('owner');
    else next.set('owner', v);
    setParams(next, { replace: true });
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<CrmContactWithOrg | null>(null);
  const [sort, setSort] = useState<SortState<ContactSortKey>>({ key: 'first_name', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => { setPage(1); }, [search, orgId, ownerFilter, sort, pageSize]);

  const { data: orgs = [] } = useCrmOrganizations();
  const { data, isLoading } = useCrmContactsPaged({
    page,
    pageSize,
    search,
    organizationId: orgId === 'all' ? undefined : orgId,
    ownerId: resolveOwnerFilter(ownerFilter, user?.id),
    sortKey: sort.key,
    sortDir: sort.dir,
  });
  const contacts = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Contact
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All organizations</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader<ContactSortKey> label="Name" sortKey="first_name" sort={sort} onSortChange={setSort} />
              <SortableHeader<ContactSortKey> label="Title" sortKey="title" sort={sort} onSortChange={setSort} />
              <TableHead>Organization</TableHead>
              <SortableHeader<ContactSortKey> label="Email" sortKey="email" sort={sort} onSortChange={setSort} />
              <SortableHeader<ContactSortKey> label="Phone" sortKey="phone" sort={sort} onSortChange={setSort} />
              <SortableHeader<ContactSortKey> label="Primary" sortKey="is_primary" sort={sort} onSortChange={setSort} />
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : contacts.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No contacts.</TableCell></TableRow>
            ) : (
              contacts.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setActive(c)}>
                  <TableCell className="font-medium">
                    {`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '(no name)'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.title ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.organization_name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? '—'}</TableCell>
                  <TableCell>{c.is_primary ? <Badge>Primary</Badge> : null}</TableCell>
                  <TableCell className="text-muted-foreground">{c.owner_name ?? '—'}</TableCell>
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

      <ContactFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ContactDetailSheet open={!!active} onOpenChange={(o) => !o && setActive(null)} contact={active} />
    </div>
  );
}
