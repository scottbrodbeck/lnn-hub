import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Search, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { OrganizationDialog } from '@/components/OrganizationDialog';
import { UserManagementDialog } from '@/components/UserManagementDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OrganizationDetailPanel } from '@/components/admin/OrganizationDetailPanel';
import { useAdminEligibleUsers } from '@/hooks/useAdminEligibleUsers';


export default function AdminClients() {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [activeOrgIds, setActiveOrgIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  
  // Organization management state
  const [organizationDialogOpen, setOrganizationDialogOpen] = useState(false);
  const [editingOrganization, setEditingOrganization] = useState<any>(null);
  const [deletingOrganizationId, setDeletingOrganizationId] = useState<string | null>(null);
  
  // Detail panel state
  const [selectedOrganization, setSelectedOrganization] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Organizations filter state
  const [orgSearchTerm, setOrgSearchTerm] = useState('');
  const [debouncedOrgSearch, setDebouncedOrgSearch] = useState('');
  const [orgStatusFilter, setOrgStatusFilter] = useState<'all' | 'active' | 'inactive' | 'archived'>('all');
  const [repFilter, setRepFilter] = useState<string>('all'); // 'all' | 'unassigned' | user_id
  const [orgSortField, setOrgSortField] = useState<'name' | 'client_code' | 'created_at' | 'sales_rep'>('name');
  const [orgSortDirection, setOrgSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: reps = [] } = useAdminEligibleUsers();
  const repNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reps) m.set(r.id, r.full_name || r.email);
    return m;
  }, [reps]);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    fetchData();
  }, []);

  // Deep-link: open organization detail panel via ?org={id}
  useEffect(() => {
    const orgId = searchParams.get('org');
    if (!orgId || organizations.length === 0) return;
    const found = organizations.find((o) => o.id === orgId);
    if (found) {
      setSelectedOrganization(found);
    } else {
      toast.error('Organization not found');
    }
    // Clear param so closing the panel doesn't re-trigger
    const next = new URLSearchParams(searchParams);
    next.delete('org');
    setSearchParams(next, { replace: true });
  }, [organizations, searchParams, setSearchParams]);

  // Debounce organization search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedOrgSearch(orgSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [orgSearchTerm]);

  const fetchData = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [orgsRes, adsRes, blastsRes, postsRes] = await Promise.all([
        supabase.from('organizations').select('*').order('name'),
        supabase
          .from('display_ad_campaigns')
          .select('organization_id')
          .eq('is_active', true)
          .or(`end_date.is.null,end_date.gte.${today}`),
        supabase
          .from('email_blasts')
          .select('organization_id')
          .not('status', 'in', '("published","sent","cancelled")'),
        supabase
          .from('post_assignments')
          .select('organization_id')
          .eq('is_completed', false)
          .eq('is_skipped', false)
          .or(`due_date.is.null,due_date.gte.${today},recurrence_end_date.is.null,recurrence_end_date.gte.${today}`),
      ]);

      if (orgsRes.error) throw orgsRes.error;
      setOrganizations(orgsRes.data || []);

      const ids = new Set<string>();
      for (const r of adsRes.data || []) if (r.organization_id) ids.add(r.organization_id as string);
      for (const r of blastsRes.data || []) if (r.organization_id) ids.add(r.organization_id as string);
      for (const r of postsRes.data || []) if (r.organization_id) ids.add(r.organization_id as string);
      setActiveOrgIds(ids);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrganization = async (organizationId: string) => {
    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', organizationId);

      if (error) throw error;
      toast.success('Organization deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting organization:', error);
      toast.error('Failed to delete organization');
    } finally {
      setDeletingOrganizationId(null);
    }
  };

  // Process organizations with search, filter, and sort
  const processedOrganizations = useMemo(() => {
    let result = [...organizations];

    if (debouncedOrgSearch.trim()) {
      const term = debouncedOrgSearch.toLowerCase();
      result = result.filter(org =>
        org.name?.toLowerCase().includes(term) ||
        org.client_code?.toLowerCase().includes(term)
      );
    }

    if (orgStatusFilter === 'archived') {
      result = result.filter(org => !org.is_active);
    } else if (orgStatusFilter !== 'all') {
      // Exclude archived from active/inactive activity buckets
      result = result.filter(org => org.is_active);
      result = result.filter(org =>
        orgStatusFilter === 'active' ? activeOrgIds.has(org.id) : !activeOrgIds.has(org.id)
      );
    } else {
      // 'all' excludes archived by default; archived only appears under 'archived' filter
      result = result.filter(org => org.is_active);
    }

    if (repFilter === 'unassigned') {
      result = result.filter(org => !org.sales_rep_user_id);
    } else if (repFilter !== 'all') {
      result = result.filter(org => org.sales_rep_user_id === repFilter);
    }

    result.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (orgSortField) {
        case 'name':
          aVal = a.name?.toLowerCase() || '';
          bVal = b.name?.toLowerCase() || '';
          break;
        case 'client_code':
          aVal = a.client_code?.toLowerCase() || '';
          bVal = b.client_code?.toLowerCase() || '';
          break;
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'sales_rep': {
          // Unassigned always at the end regardless of direction
          const aHas = !!a.sales_rep_user_id;
          const bHas = !!b.sales_rep_user_id;
          if (aHas !== bHas) return aHas ? -1 : 1;
          aVal = (repNameById.get(a.sales_rep_user_id) || '').toLowerCase();
          bVal = (repNameById.get(b.sales_rep_user_id) || '').toLowerCase();
          break;
        }
        default:
          return 0;
      }

      if (aVal < bVal) return orgSortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return orgSortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [organizations, activeOrgIds, debouncedOrgSearch, orgStatusFilter, repFilter, orgSortField, orgSortDirection, repNameById]);

  const clearOrgFilters = () => {
    setOrgSearchTerm('');
    setOrgStatusFilter('all');
    setRepFilter('all');
  };

  const hasOrgFilters = orgSearchTerm || orgStatusFilter !== 'all' || repFilter !== 'all';


  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Clients</h1>
        <p className="text-muted-foreground mt-1">Manage organizations</p>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Organizations</h2>
        <Button onClick={() => {
          setEditingOrganization(null);
          setOrganizationDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Organization
        </Button>
      </div>

      {/* Organizations Filter Bar */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or client code..."
              value={orgSearchTerm}
              onChange={(e) => setOrgSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={orgStatusFilter} onValueChange={(value: any) => setOrgStatusFilter(value)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients (not archived)</SelectItem>
              <SelectItem value="active">Active (has live ads/blasts/posts)</SelectItem>
              <SelectItem value="inactive">Inactive (nothing scheduled)</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          <Select value={repFilter} onValueChange={(value) => setRepFilter(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sales Rep" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sales Reps</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {reps.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.full_name || r.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={`${orgSortField}-${orgSortDirection}`}
            onValueChange={(value) => {
              const idx = value.lastIndexOf('-');
              setOrgSortField(value.slice(0, idx) as any);
              setOrgSortDirection(value.slice(idx + 1) as any);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z-A)</SelectItem>
              <SelectItem value="client_code-asc">Client Code (A-Z)</SelectItem>
              <SelectItem value="client_code-desc">Client Code (Z-A)</SelectItem>
              <SelectItem value="sales_rep-asc">Sales Rep (A-Z)</SelectItem>
              <SelectItem value="sales_rep-desc">Sales Rep (Z-A)</SelectItem>
              <SelectItem value="created_at-desc">Newest First</SelectItem>
              <SelectItem value="created_at-asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>

        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {processedOrganizations.length} of {organizations.length} organizations
          </span>
          {hasOrgFilters && (
            <Button variant="ghost" size="sm" onClick={clearOrgFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {processedOrganizations.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-lg">
            <p className="text-muted-foreground">
              {organizations.length === 0
                ? 'No organizations yet. Add one to get started.'
                : 'No organizations match your search criteria.'}
            </p>
            {organizations.length > 0 && (
              <Button variant="link" className="mt-2" onClick={clearOrgFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          processedOrganizations.map((org) => (
            <div 
              key={org.id} 
              className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedOrganization(org)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-foreground">{org.name}</h3>
                    {!org.is_active && (
                      <Badge variant="secondary">Archived</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                    <span>Client Code: <span className="font-mono text-foreground">{org.client_code}</span></span>
                    <span>Created: {new Date(org.created_at).toLocaleDateString()}</span>
                    <span>
                      Rep:{' '}
                      {org.sales_rep_user_id ? (
                        <span className="text-foreground">{repNameById.get(org.sales_rep_user_id) || '—'}</span>
                      ) : (
                        <span className="italic">Unassigned</span>
                      )}
                    </span>
                  </div>

                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingOrganization(org);
                      setOrganizationDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingOrganizationId(org.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Organization Detail Panel */}
      <OrganizationDetailPanel
        organization={selectedOrganization}
        open={!!selectedOrganization}
        onOpenChange={(open) => !open && setSelectedOrganization(null)}
        onSelectUser={(user) => {
          setSelectedOrganization(null);
          setSelectedUser(user);
        }}
      />

      {/* User Detail Panel (from org drill-down) */}
      <UserManagementDialog
        open={!!selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
        editingUser={selectedUser}
        onSuccess={fetchData}
        onSelectOrganization={(org) => {
          setSelectedUser(null);
          setSelectedOrganization(org);
        }}
      />

      {/* Organization Dialog */}
      <OrganizationDialog
        open={organizationDialogOpen}
        onOpenChange={setOrganizationDialogOpen}
        editingOrganization={editingOrganization}
        onSuccess={fetchData}
      />

      {/* Delete Organization Confirmation */}
      <AlertDialog open={!!deletingOrganizationId} onOpenChange={() => setDeletingOrganizationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this organization? This action cannot be undone and will remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingOrganizationId && handleDeleteOrganization(deletingOrganizationId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
