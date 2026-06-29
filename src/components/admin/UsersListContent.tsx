import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { UserManagementDialog } from '@/components/UserManagementDialog';
import { Search, Plus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

export function UsersListContent() {
  const { isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('full_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      // If filtering by role, first get the user IDs that match
      let userIdsForRole: string[] | null = null;
      if (roleFilter !== 'all') {
        const { data: roleRows, error: roleErr } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', roleFilter as any);
        if (roleErr) throw roleErr;
        userIdsForRole = (roleRows || []).map((r: any) => r.user_id);
        if (userIdsForRole.length === 0) {
          setUsers([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
      }

      let query = supabase
        .from('profiles')
        .select(`
          id, full_name, email, is_active, last_login, created_at,
          default_author_name, default_author_bio,
          user_roles(role),
          user_organizations(organization_id, is_primary, organizations(name))
        `, { count: 'exact' });

      if (userIdsForRole) {
        query = query.in('id', userIdsForRole);
      }

      if (search.trim()) {
        query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
      }

      if (statusFilter === 'active') query = query.eq('is_active', true);
      if (statusFilter === 'inactive') query = query.eq('is_active', false);

      const isAsc = sortDirection === 'asc';
      if (sortField === 'full_name') {
        query = query.order('full_name', { ascending: isAsc, nullsFirst: false });
      } else if (sortField === 'email') {
        query = query.order('email', { ascending: isAsc });
      } else if (sortField === 'created_at') {
        query = query.order('created_at', { ascending: isAsc });
      } else if (sortField === 'last_login') {
        query = query.order('last_login', { ascending: isAsc, nullsFirst: false });
      } else {
        query = query.order('full_name', { ascending: true, nullsFirst: false });
      }
      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      const transformed = (data || []).map((u: any) => ({
        ...u,
        roles: u.user_roles || [],
        organizations: (u.user_organizations || []).map((uo: any) => ({
          id: uo.organization_id,
          name: uo.organizations?.name || 'Unknown',
          is_primary: uo.is_primary,
        })),
      }));

      setUsers(transformed);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, sortField, sortDirection]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Deep-link: open user detail panel via ?user={id}
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const userId = searchParams.get('user');
    if (!userId) return;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id, full_name, email, is_active, last_login, created_at,
          default_author_name, default_author_bio,
          user_roles(role),
          user_organizations(organization_id, is_primary, organizations(name))
        `)
        .eq('id', userId)
        .maybeSingle();
      if (error || !data) {
        toast.error('User not found');
      } else {
        const transformed = {
          ...data,
          roles: (data as any).user_roles || [],
          organizations: ((data as any).user_organizations || []).map((uo: any) => ({
            id: uo.organization_id,
            name: uo.organizations?.name || 'Unknown',
            is_primary: uo.is_primary,
          })),
        };
        setSelectedUser(transformed);
        setDialogOpen(true);
      }
      const next = new URLSearchParams(searchParams);
      next.delete('user');
      setSearchParams(next, { replace: true });
    })();
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setPage(0);
  }, [search, roleFilter, statusFilter, sortField, sortDirection]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="ml-1 h-3 w-3" /> 
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getRoleBadge = (roles: any[]) => {
    const role = roles?.[0]?.role;
    switch (role) {
      case 'super_admin':
        return <Badge className="bg-purple-600 text-primary-foreground">Super Admin</Badge>;
      case 'admin':
        return <Badge>Admin</Badge>;
      case 'client':
        return <Badge variant="secondary">Client</Badge>;
      default:
        return <Badge variant="outline">No Role</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="super_admin">Super Admin</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="client">Client</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setSelectedUser(null); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('full_name')}>
                <span className="flex items-center">Name<SortIcon field="full_name" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('email')}>
                <span className="flex items-center">Email<SortIcon field="email" /></span>
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Organizations</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('last_login')}>
                <span className="flex items-center">Last Login<SortIcon field="last_login" /></span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow
                  key={user.id}
                  className="cursor-pointer"
                  onClick={() => { setSelectedUser(user); setDialogOpen(true); }}
                >
                  <TableCell className="font-medium">{user.full_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>{getRoleBadge(user.roles)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {user.organizations.length > 0
                      ? user.organizations.map((o: any) => o.name).join(', ')
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-xs">
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {user.last_login ? format(new Date(user.last_login), 'MMM d, yyyy') : 'Never'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
              const pageNum = totalPages <= 5 ? i : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    isActive={page === pageNum}
                    onClick={() => setPage(pageNum)}
                    className="cursor-pointer"
                  >
                    {pageNum + 1}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <UserManagementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchUsers}
        editingUser={selectedUser}
      />
    </div>
  );
}
