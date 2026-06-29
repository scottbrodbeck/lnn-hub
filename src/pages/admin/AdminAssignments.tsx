import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, ChevronUp, ChevronDown, ChevronsUpDown, Repeat, ExternalLink, Eye, Trash2, CheckCircle2, Undo2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { AssignmentDialog } from '@/components/AssignmentDialog';
import { EmailBlastPreview } from '@/components/EmailBlastPreview';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { generateRecurringEvents, AssignmentInstance } from '@/lib/recurrenceUtils';
import { addMonths, startOfDay, format } from 'date-fns';
import { recordAudit } from '@/lib/audit';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from '@/components/ui/pagination';

const ITEMS_PER_PAGE = 50;

type AssignmentStatus = 'completed' | 'completed_skipped' | 'draft' | 'started' | 'not_started';
type SortField = 'assignment_name' | 'site' | 'type' | 'due_date' | 'organization' | 'status';
type SortDirection = 'asc' | 'desc';

interface ExpandedAssignment {
  id: string; // composite ID for recurring (uuid_date) or regular ID
  originalId: string; // the actual assignment ID
  assignment: any; // the parent assignment record
  instanceDate: string | null; // null for one-time, date string for recurring
  instanceRecord?: AssignmentInstance; // the instance record if it exists
  isRecurring: boolean;
  submittedPostUrl?: string; // WordPress URL if post was published
}

const SortableHeader = ({ 
  field, 
  label, 
  currentField, 
  direction, 
  onSort 
}: { 
  field: SortField; 
  label: string; 
  currentField: SortField; 
  direction: SortDirection; 
  onSort: (field: SortField) => void;
}) => (
  <th 
    className="text-left p-4 font-semibold cursor-pointer hover:bg-muted/50 select-none transition-colors"
    onClick={() => onSort(field)}
  >
    <div className="flex items-center gap-1">
      {label}
      {currentField === field ? (
        direction === 'asc' 
          ? <ChevronUp className="h-4 w-4" />
          : <ChevronDown className="h-4 w-4" />
      ) : (
        <ChevronsUpDown className="h-4 w-4 opacity-30" />
      )}
    </div>
  </th>
);

export default function AdminAssignments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [instances, setInstances] = useState<AssignmentInstance[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [orgFilter, setOrgFilter] = useState<string>(searchParams.get('org') || 'all');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'current');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [draftAssignmentIds, setDraftAssignmentIds] = useState<Set<string>>(new Set());
  const [publishedPostUrls, setPublishedPostUrls] = useState<Map<string, string>>(new Map());
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [emailBlastMap, setEmailBlastMap] = useState<Map<string, string>>(new Map());
  const [blastPreviewId, setBlastPreviewId] = useState<string | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      setDeletingId(assignmentId);

      // Snapshot for audit before destructive ops
      const { data: before } = await supabase
        .from('post_assignments')
        .select('id, assignment_name, due_date, content_category, post_type, organization_id, site_id, recurrence_type')
        .eq('id', assignmentId)
        .single();

      // 1. Delete related assignment instances
      await supabase
        .from('assignment_instances')
        .delete()
        .eq('assignment_id', assignmentId);

      // 2. Nullify assignment_id on related email_blasts
      await supabase
        .from('email_blasts')
        .update({ assignment_id: null })
        .eq('assignment_id', assignmentId);

      // 3. Nullify assignment_id on related email_sponsorships
      await supabase
        .from('email_sponsorships')
        .update({ assignment_id: null })
        .eq('assignment_id', assignmentId);

      // 4. Delete the assignment itself
      const { error } = await supabase
        .from('post_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      if (before?.organization_id) {
        void recordAudit({
          organizationId: before.organization_id,
          action: 'assignment.deleted',
          entityType: 'assignment',
          entityId: assignmentId,
          summary: `Deleted assignment "${before.assignment_name ?? assignmentId.slice(0, 8)}" (due ${before.due_date ?? '—'})`,
          before: {
            title: before.assignment_name,
            due_date: before.due_date,
            content_category: before.content_category,
            post_type: before.post_type,
            site_id: before.site_id,
          },
          metadata: { recurrence_type: before.recurrence_type },
        });
      }

      toast.success('Assignment deleted successfully');
      fetchData();
    } catch (error: any) {
      console.error('Error deleting assignment:', error);
      toast.error('Failed to delete assignment');
    } finally {
      setDeletingId(null);
    }
  };

  const [markingDoneId, setMarkingDoneId] = useState<string | null>(null);

  const handleToggleDone = async (expanded: ExpandedAssignment, markDone: boolean) => {
    try {
      setMarkingDoneId(expanded.id);
      const { assignment, instanceRecord, instanceDate, isRecurring, originalId } = expanded;
      const completedAt = markDone ? new Date().toISOString() : null;

      if (isRecurring) {
        if (instanceRecord?.id) {
          const { error } = await supabase
            .from('assignment_instances')
            .update({ is_completed: markDone, completed_at: completedAt })
            .eq('id', instanceRecord.id);
          if (error) throw error;
        } else {
          if (!instanceDate) throw new Error('Missing instance date');
          const { error } = await supabase
            .from('assignment_instances')
            .insert({
              assignment_id: originalId,
              instance_date: instanceDate,
              is_completed: markDone,
              completed_at: completedAt,
            });
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from('post_assignments')
          .update({ is_completed: markDone, completed_at: completedAt })
          .eq('id', originalId);
        if (error) throw error;
      }

      if (assignment.organization_id) {
        void recordAudit({
          organizationId: assignment.organization_id,
          action: markDone ? 'assignment.marked_done' : 'assignment.unmarked_done',
          entityType: 'assignment',
          entityId: originalId,
          summary: `${markDone ? 'Marked as done' : 'Unmarked done'}: "${assignment.assignment_name}"${instanceDate ? ` (${instanceDate})` : ''}`,
          metadata: { instance_date: instanceDate, is_recurring: isRecurring },
        });
      }

      toast.success(markDone ? 'Marked as done' : 'Reverted to not done');
      fetchData();
    } catch (error: any) {
      console.error('Error toggling done state:', error);
      toast.error(error.message || 'Failed to update assignment');
    } finally {
      setMarkingDoneId(null);
    }
  };




  useEffect(() => {
    setCurrentPage(1);
  }, [orgFilter, statusFilter, categoryFilter]);

  // Helper to get type label based on content_category and recurrence
  const getTypeLabel = (assignment: any): string => {
    switch (assignment.content_category) {
      case 'email_blast':
        return 'Email Blast';
      case 'email_sponsorship':
        return 'Email Sponsorship';
      case 'website':
      default:
        return assignment.recurrence_type === 'one_time' ? 'Standard' : 'Recurring';
    }
  };

  // Handle deep link to specific assignment
  useEffect(() => {
    const assignmentId = searchParams.get('assignment');
    if (assignmentId && assignments.length > 0 && !loading) {
      const targetAssignment = assignments.find(a => a.id === assignmentId);
      if (targetAssignment) {
        setEditingAssignment(targetAssignment);
        setDialogOpen(true);
        // Clear the parameter after opening
        searchParams.delete('assignment');
        setSearchParams(searchParams, { replace: true });
      } else {
        toast.info('Assignment not found. It may be filtered out or no longer exists.');
        searchParams.delete('assignment');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [assignments, loading, searchParams, setSearchParams]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [assignmentsRes, orgsRes, draftsRes, instancesRes, publishedPostsRes, emailBlastsRes] = await Promise.all([
        supabase
          .from('post_assignments')
          .select(`
            *,
            site:sites(name),
            organization:organizations(id, name)
          `)
          .order('due_date', { ascending: true }),
        supabase
          .from('organizations')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('posts')
          .select('id, assignment_ids')
          .eq('status', 'draft'),
        supabase
          .from('assignment_instances')
          .select('*'),
        supabase
          .from('posts')
          .select('id, assignment_ids, wordpress_post_url')
          .eq('status', 'published')
          .not('wordpress_post_url', 'is', null),
        supabase
          .from('email_blasts')
          .select('id, assignment_id')
          .not('assignment_id', 'is', null)
      ]);

      if (assignmentsRes.error) throw assignmentsRes.error;
      if (orgsRes.error) throw orgsRes.error;
      if (draftsRes.error) throw draftsRes.error;
      if (instancesRes.error) throw instancesRes.error;
      if (publishedPostsRes.error) throw publishedPostsRes.error;
      if (emailBlastsRes.error) throw emailBlastsRes.error;

      // Build set of assignment IDs that have drafts (including composite IDs)
      const draftIds = new Set<string>();
      draftsRes.data?.forEach(draft => {
        draft.assignment_ids?.forEach((id: string) => {
          draftIds.add(id);
          // Also add the base UUID for matching
          const baseId = id.split('_')[0];
          if (baseId !== id) draftIds.add(baseId);
        });
      });
      setDraftAssignmentIds(draftIds);

      // Build map of assignment IDs to WordPress URLs
      const wpUrlMap = new Map<string, string>();
      publishedPostsRes.data?.forEach(post => {
        post.assignment_ids?.forEach((id: string) => {
          if (post.wordpress_post_url) {
            wpUrlMap.set(id, post.wordpress_post_url);
          }
        });
      });
      setPublishedPostUrls(wpUrlMap);

      // Build map of assignment IDs to email blast IDs
      const blastMap = new Map<string, string>();
      emailBlastsRes.data?.forEach(blast => {
        if (blast.assignment_id) {
          blastMap.set(blast.assignment_id, blast.id);
        }
      });
      setEmailBlastMap(blastMap);

      setAssignments(assignmentsRes.data || []);
      setInstances(instancesRes.data || []);
      setOrganizations(orgsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentStatus = (expanded: ExpandedAssignment): AssignmentStatus => {
    const { assignment, instanceRecord, id } = expanded;
    
    // For recurring assignments, check instance-level status first
    if (instanceRecord) {
      if (instanceRecord.is_skipped) return 'completed_skipped';
      if (instanceRecord.is_completed || instanceRecord.submitted_post_id) return 'completed';
      // Check if this specific instance has a draft (using composite ID)
      if (draftAssignmentIds.has(id)) return 'draft';
      if (instanceRecord.started_at) return 'started';
      return 'not_started';
    }
    
    // For one-time assignments or virtual instances without records
    if (assignment.is_skipped) return 'completed_skipped';
    if (assignment.is_completed || assignment.submitted_post_id) return 'completed';
    if (draftAssignmentIds.has(id) || draftAssignmentIds.has(assignment.id)) return 'draft';
    if (assignment.started_at) return 'started';
    return 'not_started';
  };

  const getStatusBadge = (status: AssignmentStatus) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500 hover:bg-green-600 whitespace-nowrap">Completed</Badge>;
      case 'completed_skipped':
        return <Badge className="bg-green-500 hover:bg-green-600 whitespace-nowrap">Completed (Skipped)</Badge>;
      case 'draft':
        return <Badge className="bg-orange-500 hover:bg-orange-600 whitespace-nowrap">Draft</Badge>;
      case 'started':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black whitespace-nowrap">Started</Badge>;
      case 'not_started':
      default:
        return <Badge variant="destructive" className="whitespace-nowrap">Not Started</Badge>;
    }
  };

  // Expand recurring assignments into individual instances
  const expandedAssignments = useMemo((): ExpandedAssignment[] => {
    const today = startOfDay(new Date());
    const viewStart = new Date(today);
    viewStart.setMonth(viewStart.getMonth() - 6); // Look back 6 months
    const viewEnd = addMonths(today, 12); // Look ahead 12 months
    
    const expanded: ExpandedAssignment[] = [];
    
    assignments.forEach(assignment => {
      if (assignment.recurrence_type === 'one_time') {
        // One-time assignments - add as-is
        // Check for WordPress URL
        const wpUrl = publishedPostUrls.get(assignment.id);
        expanded.push({
          id: assignment.id,
          originalId: assignment.id,
          assignment,
          instanceDate: assignment.due_date,
          instanceRecord: undefined,
          isRecurring: false,
          submittedPostUrl: wpUrl,
        });
      } else {
        // Recurring assignments - generate instances
        const assignmentInstances = instances.filter(
          inst => inst.assignment_id === assignment.id
        );
        const events = generateRecurringEvents(assignment, viewStart, viewEnd, assignmentInstances);
        
        events.forEach(event => {
          const dateStr = format(event.instanceDate, 'yyyy-MM-dd');
          const compositeId = event.id;
          // Check for WordPress URL using composite ID
          const wpUrl = publishedPostUrls.get(compositeId) || publishedPostUrls.get(assignment.id);
          expanded.push({
            id: compositeId,
            originalId: assignment.id,
            assignment,
            instanceDate: dateStr,
            instanceRecord: event.instanceRecord,
            isRecurring: true,
            submittedPostUrl: wpUrl,
          });
        });
      }
    });
    
    return expanded;
  }, [assignments, instances, publishedPostUrls]);

  const filteredAssignments = useMemo(() => {
    let filtered = expandedAssignments;
    
    // Filter by organization
    if (orgFilter === 'unassigned') {
      filtered = filtered.filter(e => !e.assignment.organization_id);
    } else if (orgFilter !== 'all') {
      filtered = filtered.filter(e => e.assignment.organization_id === orgFilter);
    }
    
    // Filter by content category and post pattern
    if (categoryFilter === 'all') {
      // No filtering
    } else if (categoryFilter === 'all_posts') {
      // Website posts only (both standard and recurring)
      filtered = filtered.filter(e => e.assignment.content_category === 'website');
    } else if (categoryFilter === 'standard') {
      // Website + one-time only
      filtered = filtered.filter(e => 
        e.assignment.content_category === 'website' && 
        e.assignment.recurrence_type === 'one_time'
      );
    } else if (categoryFilter === 'recurring') {
      // Website + recurring only
      filtered = filtered.filter(e => 
        e.assignment.content_category === 'website' && 
        e.assignment.recurrence_type !== 'one_time'
      );
    } else if (categoryFilter === 'email_blast') {
      filtered = filtered.filter(e => e.assignment.content_category === 'email_blast');
    } else if (categoryFilter === 'email_sponsorship') {
      filtered = filtered.filter(e => e.assignment.content_category === 'email_sponsorship');
    }
    
    // Filter by status
    if (statusFilter === 'current') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      filtered = filtered.filter(e => {
        if (!e.instanceDate) return true;
        
        const dueDate = new Date(e.instanceDate + 'T00:00:00');
        const status = getAssignmentStatus(e);
        const isCompleted = status === 'completed' || status === 'completed_skipped';
        
        if (dueDate >= today) return true;
        if (dueDate >= sevenDaysAgo && !isCompleted) return true;
        
        return false;
      });
    } else if (statusFilter === 'no_date') {
      filtered = filtered.filter(e => !e.instanceDate);
    } else if (statusFilter === 'completed') {
      filtered = filtered.filter(e => {
        const status = getAssignmentStatus(e);
        return status === 'completed' || status === 'completed_skipped';
      });
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(e => getAssignmentStatus(e) === statusFilter);
    }
    
    // Apply dynamic sorting
    const statusOrder: Record<AssignmentStatus, number> = { 
      not_started: 0, started: 1, draft: 2, completed: 3, completed_skipped: 4 
    };
    
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'assignment_name':
          comparison = (a.assignment.assignment_name || '').localeCompare(b.assignment.assignment_name || '');
          break;
        case 'site':
          comparison = (a.assignment.site?.name || '').localeCompare(b.assignment.site?.name || '');
          break;
        case 'type':
          comparison = getTypeLabel(a.assignment).localeCompare(getTypeLabel(b.assignment));
          break;
        case 'due_date':
          // Handle null dates - sort them alphabetically by name at end
          if (!a.instanceDate && !b.instanceDate) {
            return (a.assignment.assignment_name || '').localeCompare(b.assignment.assignment_name || '');
          }
          if (!a.instanceDate) return 1;
          if (!b.instanceDate) return -1;
          comparison = new Date(a.instanceDate).getTime() - new Date(b.instanceDate).getTime();
          break;
        case 'organization':
          comparison = (a.assignment.organization?.name || 'zzz').localeCompare(b.assignment.organization?.name || 'zzz');
          break;
        case 'status':
          comparison = statusOrder[getAssignmentStatus(a)] - statusOrder[getAssignmentStatus(b)];
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [expandedAssignments, orgFilter, statusFilter, categoryFilter, draftAssignmentIds, sortField, sortDirection]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Assignments</h1>
          <p className="text-muted-foreground mt-1">Manage all post assignments</p>
        </div>
        <Button onClick={() => {
          setEditingAssignment(null);
          setDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          New Assignment
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label htmlFor="org-filter" className="text-sm whitespace-nowrap">Organization:</Label>
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger id="org-filter" className="w-[200px]">
              <SelectValue placeholder="All organizations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Organizations</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="category-filter" className="text-sm whitespace-nowrap">Type:</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger id="category-filter" className="w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="all_posts">All Posts</SelectItem>
              <SelectItem value="standard">Standard Posts</SelectItem>
              <SelectItem value="recurring">Recurring Posts</SelectItem>
              <SelectSeparator />
              <SelectItem value="email_blast">Email Blast</SelectItem>
              <SelectItem value="email_sponsorship">Email Sponsorship</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter" className="text-sm whitespace-nowrap">Status:</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="status-filter" className="w-[180px]">
              <SelectValue placeholder="All Current" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">All Current</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="started">Started</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="no_date">No Date Set</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Pagination calculations */}
      {(() => {
        const totalPages = Math.ceil(filteredAssignments.length / ITEMS_PER_PAGE);
        const paginatedAssignments = filteredAssignments.slice(
          (currentPage - 1) * ITEMS_PER_PAGE,
          currentPage * ITEMS_PER_PAGE
        );
        const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
        const endItem = Math.min(currentPage * ITEMS_PER_PAGE, filteredAssignments.length);

        return (
          <>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <SortableHeader field="assignment_name" label="Assignment" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                    <SortableHeader field="site" label="Site" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                    <SortableHeader field="type" label="Type" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                    <SortableHeader field="due_date" label="Publication Date" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                    <SortableHeader field="organization" label="Organization" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                    <SortableHeader field="status" label="Status" currentField={sortField} direction={sortDirection} onSort={handleSort} />
                    <th className="text-left p-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">
                        No assignments found. {(orgFilter !== 'all' || statusFilter !== 'all') && 'Try adjusting your filters.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedAssignments.map((expanded) => {
                      const status = getAssignmentStatus(expanded);
                      const { assignment, instanceDate, isRecurring } = expanded;
                      return (
                        <tr key={expanded.id} className="border-t border-border hover:bg-muted/50">
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              {assignment.assignment_name}
                              {isRecurring && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Recurring {assignment.recurrence_type} assignment</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </td>
                          <td className="p-4">{assignment.site?.name}</td>
                          <td className="p-4">{getTypeLabel(assignment)}</td>
                          <td className="p-4">
                            {instanceDate 
                              ? new Date(instanceDate + 'T00:00:00').toLocaleDateString()
                              : <span className="text-muted-foreground italic">TBD</span>
                            }
                          </td>
                          <td className="p-4">
                            {assignment.organization ? (
                              <Badge
                                variant="default"
                                className="inline-flex max-w-[220px] rounded-md px-2 py-1 text-xs leading-tight whitespace-normal break-words text-left items-start justify-start h-auto"
                              >
                                {assignment.organization.name}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">Unassigned</span>
                            )}
                          </td>
                          <td className="p-4">
                            {getStatusBadge(status)}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingAssignment(assignment);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {status !== 'completed' && status !== 'completed_skipped' ? (
                                <AlertDialog>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-green-600 hover:text-green-700"
                                            disabled={markingDoneId === expanded.id}
                                          >
                                            <CheckCircle2 className="h-4 w-4" />
                                          </Button>
                                        </AlertDialogTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Mark as done</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Mark as Done</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Mark &ldquo;{assignment.assignment_name}&rdquo;{instanceDate ? ` (${new Date(instanceDate + 'T00:00:00').toLocaleDateString()})` : ''} as completed? The assignment record will be preserved for history.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleToggleDone(expanded, true)}
                                        className="bg-green-600 hover:bg-green-700"
                                      >
                                        Mark Done
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              ) : !expanded.submittedPostUrl && !(expanded.instanceRecord?.submitted_post_id) && !assignment.submitted_post_id ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-muted-foreground"
                                        disabled={markingDoneId === expanded.id}
                                        onClick={() => handleToggleDone(expanded, false)}
                                      >
                                        <Undo2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Unmark done</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : null}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    disabled={deletingId === expanded.originalId}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Assignment</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete &ldquo;{assignment.assignment_name}&rdquo;? This will permanently remove this assignment and all its instances. This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteAssignment(expanded.originalId)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                              {assignment.content_category === 'email_blast' && emailBlastMap.has(expanded.originalId) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setBlastPreviewId(emailBlastMap.get(expanded.originalId)!)}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>View Email Blast</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {expanded.submittedPostUrl && (status === 'completed' || status === 'completed_skipped') && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        asChild
                                      >
                                        <a 
                                          href={expanded.submittedPostUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                        </a>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>View on WordPress</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Showing {startItem}-{endItem} of {filteredAssignments.length} assignments
                </span>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    
                    {/* First page */}
                    <PaginationItem>
                      <PaginationLink
                        onClick={() => setCurrentPage(1)}
                        isActive={currentPage === 1}
                        className="cursor-pointer"
                      >
                        1
                      </PaginationLink>
                    </PaginationItem>
                    
                    {/* Ellipsis before current range */}
                    {currentPage > 3 && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}
                    
                    {/* Pages around current */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(page => page !== 1 && page !== totalPages && page >= currentPage - 1 && page <= currentPage + 1)
                      .map(page => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))
                    }
                    
                    {/* Ellipsis after current range */}
                    {currentPage < totalPages - 2 && (
                      <PaginationItem>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )}
                    
                    {/* Last page */}
                    {totalPages > 1 && (
                      <PaginationItem>
                        <PaginationLink
                          onClick={() => setCurrentPage(totalPages)}
                          isActive={currentPage === totalPages}
                          className="cursor-pointer"
                        >
                          {totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    )}
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        );
      })()}

      <AssignmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchData}
        editingAssignment={editingAssignment}
      />

      {blastPreviewId && (
        <EmailBlastPreview
          open={!!blastPreviewId}
          onOpenChange={(open) => { if (!open) setBlastPreviewId(null); }}
          blastId={blastPreviewId}
        />
      )}
    </div>
  );
}
