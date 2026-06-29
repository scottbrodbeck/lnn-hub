import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, SquareCheck, Pencil, User, Globe, Repeat, Clock, Send, Circle, ChevronLeft, ChevronRight, Mail, Megaphone, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AssignmentDialog } from '@/components/AssignmentDialog';
import { EmailBlastPreview } from '@/components/EmailBlastPreview';
import { EditInstanceDialog } from '@/components/EditInstanceDialog';
import { format, subMonths, addMonths, parseISO, startOfWeek } from 'date-fns';
import { generateAllCalendarEvents, GeneratedEvent, AssignmentInstance } from '@/lib/recurrenceUtils';
import { parseCompositeId } from '@/lib/assignmentUtils';
import { WeekdayMonthCalendar, WeekdayCalendarEvent } from '@/components/admin/WeekdayMonthCalendar';
import { recordAudit } from '@/lib/audit';


interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: any;
}

type AssignmentStatus = 'not_started' | 'in_progress' | 'in_progress_draft' | 'pending_request' | 'published';

const getStatusIcon = (status: AssignmentStatus) => {
  switch (status) {
    case 'not_started':
      return <Circle className="h-3 w-3 text-white/70" />;
    case 'in_progress':
      return <Clock className="h-3 w-3 text-amber-400" />;
    case 'in_progress_draft':
      return <Pencil className="h-3 w-3 text-amber-400" />;
    case 'pending_request':
      return <Send className="h-3 w-3 text-blue-400" />;
    case 'published':
      return <SquareCheck className="h-3 w-3 text-green-400" />;
    default:
      return <Circle className="h-3 w-3 text-white/70" />;
  }
};

export default function AdminCalendar() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [instances, setInstances] = useState<AssignmentInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [editInstanceDialogOpen, setEditInstanceDialogOpen] = useState(false);
  const [postStatuses, setPostStatuses] = useState<Map<string, string>>(new Map());
  const [sites, setSites] = useState<{id: string, name: string}[]>([]);
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'website' | 'email_blast' | 'email_sponsorship'>('all');
  const [draftAssignmentIds, setDraftAssignmentIds] = useState<Set<string>>(new Set());
  const [startedAssignmentIds, setStartedAssignmentIds] = useState<Set<string>>(new Set());
  const [pendingRequestAssignmentIds, setPendingRequestAssignmentIds] = useState<Set<string>>(new Set());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [defaultDate, setDefaultDate] = useState<Date | undefined>(undefined);
  const [emailBlastMap, setEmailBlastMap] = useState<Map<string, string>>(new Map());
  const [blastPreviewId, setBlastPreviewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteAssignment = async (assignmentId: string) => {
    try {
      setDeletingId(assignmentId);

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

      toast.success('Assignment deleted successfully');
      setDetailsDialogOpen(false);
      setSelectedAssignment(null);
      fetchAssignments();
    } catch (error: any) {
      console.error('Error deleting assignment:', error);
      toast.error('Failed to delete assignment');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelectSlot = (slotInfo: { start: Date }) => {
    const day = slotInfo.start.getDay();
    if (day === 0 || day === 6) {
      toast.error('Assignments cannot be scheduled on weekends');
      return;
    }
    setEditingAssignment(null);
    setDefaultDate(slotInfo.start);
    setAssignmentDialogOpen(true);
  };

  useEffect(() => {
    fetchAssignments();
    fetchSites();
  }, []);

  const fetchSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setSites(data);
    }
  };

  useEffect(() => {
    // Generate calendar events including recurring instances
    const viewStart = subMonths(new Date(), 3);
    const viewEnd = addMonths(new Date(), 12);
    const calendarEvents = generateAllCalendarEvents(assignments, viewStart, viewEnd, instances);
    setEvents(calendarEvents as CalendarEvent[]);
  }, [assignments, instances]);

  // Filter events based on selected site
  const filteredEvents = useMemo(() => {
    let result = events;
    if (selectedSiteFilter !== 'all') {
      result = result.filter(event => event.resource.site_id === selectedSiteFilter);
    }
    if (categoryFilter !== 'all') {
      result = result.filter(event => {
        const cat = event.resource.content_category || 'website';
        return cat === categoryFilter;
      });
    }
    return result;
  }, [events, selectedSiteFilter, categoryFilter]);

  const fetchAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from('post_assignments')
        .select(`
          *,
          site:sites(name),
          client:profiles!post_assignments_assigned_to_fkey(full_name, email)
        `)
        .order('due_date', { ascending: true });

      if (error) throw error;
      setAssignments(data || []);

      // Fetch all assignment instances
      const { data: instancesData, error: instancesError } = await supabase
        .from('assignment_instances')
        .select('*');

      if (instancesError) throw instancesError;
      setInstances(instancesData || []);

      // Track started assignments from both tables
      const startedIds = new Set<string>();
      (data || []).forEach((a: any) => {
        if (a.started_at) startedIds.add(a.id);
      });
      (instancesData || []).forEach((i: any) => {
        if (i.started_at) {
          // Use composite ID for recurring instances
          const compositeId = `${i.assignment_id}_${i.instance_date}`;
          startedIds.add(compositeId);
        }
      });
      setStartedAssignmentIds(startedIds);

      // Fetch draft posts to detect "In Progress (Draft)" status
      const { data: draftsData, error: draftsError } = await supabase
        .from('posts')
        .select('id, assignment_ids')
        .eq('status', 'draft');

      if (!draftsError && draftsData) {
        const draftIds = new Set<string>();
        draftsData.forEach((draft) => {
          draft.assignment_ids?.forEach((id: string) => {
            draftIds.add(id);
          });
        });
        setDraftAssignmentIds(draftIds);
      }

      // Fetch pending edit/date requests
      const { data: pendingRequests, error: pendingError } = await supabase
        .from('post_edit_requests')
        .select('assignment_id, instance_date')
        .eq('status', 'pending');

      if (!pendingError && pendingRequests) {
        const pendingIds = new Set<string>();
        pendingRequests.forEach((req) => {
          if (req.assignment_id) {
            if (req.instance_date) {
              // Composite ID for recurring instance
              pendingIds.add(`${req.assignment_id}_${req.instance_date}`);
            } else {
              pendingIds.add(req.assignment_id);
            }
          }
        });
        setPendingRequestAssignmentIds(pendingIds);
      }

      // Build map of assignment IDs to email blast IDs
      const { data: emailBlastsData } = await supabase
        .from('email_blasts')
        .select('id, assignment_id')
        .not('assignment_id', 'is', null);

      const blastMap = new Map<string, string>();
      emailBlastsData?.forEach(blast => {
        if (blast.assignment_id) {
          blastMap.set(blast.assignment_id, blast.id);
        }
      });
      setEmailBlastMap(blastMap);

      // Collect all post IDs from assignments and instances
      const postIds = new Set<string>();
      (data || []).forEach((a: any) => {
        if (a.submitted_post_id) postIds.add(a.submitted_post_id);
      });
      (instancesData || []).forEach((i: any) => {
        if (i.submitted_post_id) postIds.add(i.submitted_post_id);
      });

      // Fetch post statuses
      if (postIds.size > 0) {
        const { data: postsData, error: postsError } = await supabase
          .from('posts')
          .select('id, status')
          .in('id', Array.from(postIds));

        if (!postsError && postsData) {
          const statusMap = new Map<string, string>();
          postsData.forEach((p) => statusMap.set(p.id, p.status));
          setPostStatuses(statusMap);
        }
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentStatus = (resource: any): AssignmentStatus => {
    const postId = resource.submitted_post_id;
    const assignmentId = resource.id;
    // For recurring instances, the resource.id is already the composite ID
    const lookupId = assignmentId;

    // First check for pending requests (edit or date change)
    if (pendingRequestAssignmentIds.has(lookupId)) {
      return 'pending_request';
    }

    // Check if published
    if (postId) {
      const postStatus = postStatuses.get(postId);
      if (postStatus === 'published') return 'published';
    }

    // Check if there's a draft for this assignment
    if (draftAssignmentIds.has(lookupId)) {
      return 'in_progress_draft';
    }

    // Check if user has started working (clicked in)
    if (startedAssignmentIds.has(lookupId)) {
      return 'in_progress';
    }

    return 'not_started';
  };

  const CustomEvent = useMemo(() => {
    return ({ event }: { event: CalendarEvent }) => {
      const status = getAssignmentStatus(event.resource);
      const icon = getStatusIcon(status);
      const siteName = event.resource?.site?.name as string | undefined;

      return (
        <div className="flex items-center justify-between w-full h-full px-1 overflow-hidden">
          <span className="truncate text-xs leading-tight">
            {siteName && <span className="font-bold">{siteName}</span>}
            {siteName ? ' · ' : ''}
            {event.title}
          </span>
          <span className="flex-shrink-0 ml-1">{icon}</span>
        </div>
      );
    };
  }, [postStatuses, draftAssignmentIds, startedAssignmentIds, pendingRequestAssignmentIds]);

  const handleSelectEvent = (event: CalendarEvent) => {
    const generatedEvent = event as unknown as GeneratedEvent;
    setSelectedAssignment({
      ...event.resource,
      isVirtualInstance: generatedEvent.isVirtualInstance,
      instanceDate: generatedEvent.instanceDate,
    });
    setDetailsDialogOpen(true);
  };

  const handleMarkComplete = async (assignmentId: string, currentStatus: boolean) => {
    try {
      // Check if this is a virtual instance
      if (selectedAssignment?.isVirtualInstance) {
        const dateStr = format(selectedAssignment.instanceDate, 'yyyy-MM-dd');
        
        // Create or update instance record
        const { error } = await supabase
          .from('assignment_instances')
          .upsert({
            assignment_id: assignmentId,
            instance_date: dateStr,
            is_completed: !currentStatus,
            completed_at: !currentStatus ? new Date().toISOString() : null,
          });

        if (error) throw error;
      } else {
        // Update the original assignment
        const { error } = await supabase
          .from('post_assignments')
          .update({
            is_completed: !currentStatus,
            completed_at: !currentStatus ? new Date().toISOString() : null,
          })
          .eq('id', assignmentId);

        if (error) throw error;
      }
      // Audit log
      const orgId = selectedAssignment?.organization_id;
      if (orgId) {
        const itemName = selectedAssignment?.assignment_name || selectedAssignment?.title || 'Assignment';
        const isInstance = !!selectedAssignment?.isVirtualInstance;
        void recordAudit({
          organizationId: orgId,
          action: isInstance
            ? (currentStatus ? 'assignment_instance.uncompleted' : 'assignment_instance.completed')
            : (currentStatus ? 'assignment.uncompleted' : 'assignment.completed'),
          entityType: isInstance ? 'assignment_instance' : 'assignment',
          entityId: assignmentId,
          summary: `${currentStatus ? 'Marked incomplete' : 'Marked complete'}: "${itemName}"`,
          before: { is_completed: currentStatus },
          after: { is_completed: !currentStatus },
          metadata: isInstance && selectedAssignment?.instanceDate
            ? { instance_date: format(selectedAssignment.instanceDate, 'yyyy-MM-dd') }
            : {},
        });
      }

      toast.success(currentStatus ? 'Assignment marked as incomplete' : 'Assignment marked as complete');
      fetchAssignments();
      setDetailsDialogOpen(false);
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast.error('Failed to update assignment');
    }
  };


  const handleEventDrop = async ({ event, start }: any) => {
    const day = start.getDay();
    const contentCategory = event.resource?.content_category;
    
    // Prevent dropping on weekends for non-sponsorship items
    if (day === 0 || day === 6) {
      if (contentCategory !== 'email_sponsorship') {
        toast.error('Posts can only be scheduled on weekdays');
        return;
      }
    }
    
    // For email sponsorships, auto-snap to Monday of the target week
    let targetDate = start;
    if (contentCategory === 'email_sponsorship') {
      targetDate = startOfWeek(start, { weekStartsOn: 1 }); // Monday
      
      // Check for existing sponsorship on this site/week
      const targetMonday = format(targetDate, 'yyyy-MM-dd');
      const { data: existing, error: checkError } = await supabase
        .from('post_assignments')
        .select('id, assignment_name')
        .eq('content_category', 'email_sponsorship')
        .eq('site_id', event.resource.site_id)
        .eq('due_date', targetMonday)
        .neq('id', event.id)
        .maybeSingle();
      
      if (checkError) {
        console.error('Error checking for duplicate sponsorship:', checkError);
        toast.error('Failed to validate move');
        return;
      }
      
      if (existing) {
        toast.error(`Cannot move: A sponsorship already exists for this site on the week of ${format(targetDate, 'MMM d')}`);
        return;
      }
    }

    try {
      const newDateStr = format(targetDate, 'yyyy-MM-dd');
      const { assignmentId, instanceDate } = parseCompositeId(event.id);

      if (instanceDate) {
        // Recurring instance: upsert an assignment_instances record with overridden_due_date
        const { error } = await supabase
          .from('assignment_instances')
          .upsert(
            {
              assignment_id: assignmentId,
              instance_date: instanceDate,
              overridden_due_date: newDateStr,
            },
            { onConflict: 'assignment_id,instance_date' }
          );

        if (error) throw error;
      } else {
        // One-time assignment: update the parent record directly
        const { error } = await supabase
          .from('post_assignments')
          .update({ due_date: newDateStr })
          .eq('id', assignmentId);

        if (error) throw error;
      }

      const successMsg = contentCategory === 'email_sponsorship'
        ? `Sponsorship moved to week of ${format(targetDate, 'MMM d')}`
        : 'Assignment rescheduled successfully';
      toast.success(successMsg);

      // Audit log: capture the reschedule
      const orgId = event.resource?.organization_id;
      const previousDate = event.resource?.overridden_due_date || event.resource?.due_date || event.resource?.instance_date;
      if (orgId) {
        const itemName = event.resource?.assignment_name || event.title || 'Assignment';
        void recordAudit({
          organizationId: orgId,
          action: instanceDate ? 'assignment_instance.rescheduled' : 'assignment.rescheduled',
          entityType: instanceDate ? 'assignment_instance' : 'assignment',
          entityId: assignmentId,
          summary: `Rescheduled "${itemName}" from ${previousDate ?? '—'} to ${newDateStr}`,
          before: instanceDate
            ? { overridden_due_date: previousDate, instance_date: instanceDate }
            : { due_date: previousDate },
          after: instanceDate
            ? { overridden_due_date: newDateStr, instance_date: instanceDate }
            : { due_date: newDateStr },
          metadata: {
            content_category: contentCategory,
            ...(instanceDate ? { instance_date: instanceDate, base_assignment_id: assignmentId.split('_')[0] } : {}),
          },
        });
      }

      fetchAssignments();
    } catch (error) {
      console.error('Error rescheduling assignment:', error);
      toast.error('Failed to reschedule assignment');
    }
  };

  const eventStyleGetter = (event: CalendarEvent) => {
    const assignment = event.resource;
    let backgroundColor = 'hsl(var(--primary))';
    const contentCategory = assignment.content_category || 'website';
    
    // Color by content category and post type
    if (contentCategory === 'email_blast') {
      backgroundColor = assignment.is_completed ? 'hsl(25 40% 65%)' : 'hsl(25 95% 53%)';
    } else if (contentCategory === 'email_sponsorship') {
      backgroundColor = assignment.is_completed ? 'hsl(271 35% 70%)' : 'hsl(271 91% 65%)';
    } else if (assignment.recurrence_type !== 'one_time') {
      backgroundColor = assignment.is_completed ? 'hsl(214 40% 65%)' : 'hsl(214 100% 50%)';
    } else {
      backgroundColor = assignment.is_completed ? 'hsl(142 25% 60%)' : 'hsl(142 71% 45%)';
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: assignment.is_completed ? 0.6 : 1,
        color: 'white',
        border: '0',
        display: 'block',
      },
    };
  };

  // Style weekend columns as inactive
  const dayPropGetter = (date: Date) => {
    const day = date.getDay();
    if (day === 0 || day === 6) {
      return {
        style: {
          backgroundColor: 'hsl(var(--muted) / 0.5)',
          opacity: 0.5,
        },
      };
    }
    return {};
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
          <div className="h-[600px] bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
        <p className="text-muted-foreground mt-1">View and manage post assignments</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-md border bg-background p-1">
            <Button
              type="button"
              size="sm"
              variant={categoryFilter === 'website' ? 'default' : 'ghost'}
              onClick={() => setCategoryFilter(categoryFilter === 'website' ? 'all' : 'website')}
              className="h-8"
            >
              Posts
            </Button>
            <Button
              type="button"
              size="sm"
              variant={categoryFilter === 'email_blast' ? 'default' : 'ghost'}
              onClick={() => setCategoryFilter(categoryFilter === 'email_blast' ? 'all' : 'email_blast')}
              className="h-8"
            >
              Email Blasts
            </Button>
            <Button
              type="button"
              size="sm"
              variant={categoryFilter === 'email_sponsorship' ? 'default' : 'ghost'}
              onClick={() => setCategoryFilter(categoryFilter === 'email_sponsorship' ? 'all' : 'email_sponsorship')}
              className="h-8"
            >
              Sponsorships
            </Button>
          </div>
          <Select value={selectedSiteFilter} onValueChange={setSelectedSiteFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => {
          setEditingAssignment(null);
          setAssignmentDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          New Assignment
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(142 71% 45%)' }}></div>
          <span>Standard Post</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(214 100% 50%)' }}></div>
          <span>Recurring Post</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(25 95% 53%)' }}></div>
          <span className="flex items-center gap-1">
            <Mail className="h-3 w-3" />
            Email Blast
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(271 91% 65%)' }}></div>
          <span className="flex items-center gap-1">
            <Megaphone className="h-3 w-3" />
            Email Sponsorship
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded opacity-60" style={{ backgroundColor: 'hsl(240 5% 64%)' }}></div>
          <span>Completed</span>
        </div>
        <div className="border-l border-border pl-4 flex items-center gap-4">
          <span className="text-muted-foreground">Status:</span>
          <div className="flex items-center gap-1">
            <Circle className="h-3 w-3 text-muted-foreground" />
            <span>Not Started</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-amber-500" />
            <span>In Progress</span>
          </div>
          <div className="flex items-center gap-1">
            <Pencil className="h-3 w-3 text-amber-500" />
            <span>Draft</span>
          </div>
          <div className="flex items-center gap-1">
            <Send className="h-3 w-3 text-blue-500" />
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-1">
            <SquareCheck className="h-3 w-3 text-green-500" />
            <span>Published</span>
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-lg font-semibold text-foreground">
          {format(currentDate, 'MMMM yyyy')}
        </div>
        <div className="w-[140px]" />
      </div>

      <div className="w-full max-w-[1280px] mx-auto">
        <WeekdayMonthCalendar
          date={currentDate}
          events={filteredEvents as WeekdayCalendarEvent[]}
          onSelectEvent={(ev) => handleSelectEvent(ev as any)}
          onSelectSlot={handleSelectSlot}
          onEventDrop={({ event, start }) => handleEventDrop({ event, start })}
          eventPropGetter={(ev) => eventStyleGetter(ev as any)}
          dayPropGetter={dayPropGetter}
          renderEvent={(ev) => <CustomEvent event={ev as any} />}
          sortEvents={(a, b) => {
            const aSite = (a.resource?.site?.name as string | undefined)?.trim() ?? '';
            const bSite = (b.resource?.site?.name as string | undefined)?.trim() ?? '';
            if (!aSite && bSite) return 1;
            if (aSite && !bSite) return -1;
            const siteCmp = aSite.localeCompare(bSite, undefined, { sensitivity: 'base' });
            if (siteCmp !== 0) return siteCmp;
            return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
          }}
        />
      </div>

      <div className="flex justify-center items-center gap-4 mt-4 pb-4">
        <Button variant="outline" size="sm" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assignment Details</DialogTitle>
          </DialogHeader>
          
          {selectedAssignment && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {selectedAssignment.assignment_name}
                  {selectedAssignment.isVirtualInstance && (
                    <span className="text-sm text-muted-foreground ml-2">(Recurring Instance)</span>
                  )}
                </h3>
                <div className="flex gap-2 mb-4">
                  <Badge variant={selectedAssignment.recurrence_type !== 'one_time' ? 'default' : 'secondary'}>
                    {selectedAssignment.recurrence_type !== 'one_time' ? 'Recurring' : 'Standard'}
                  </Badge>
                  <Badge variant={selectedAssignment.is_completed ? 'outline' : 'default'}>
                    {selectedAssignment.is_completed ? 'Completed' : 'Pending'}
                  </Badge>
                  {selectedAssignment.recurrence_type !== 'one_time' && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Repeat className="h-3 w-3" />
                      {selectedAssignment.recurrence_type.replace('_', ' ')}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Site</p>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span className="font-medium">{selectedAssignment.site?.name}</span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Assigned To</p>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span className="font-medium">
                      {selectedAssignment.client?.full_name || selectedAssignment.client?.email || 'Unassigned'}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Publication Date</p>
                  <span className="font-medium">
                    {format(selectedAssignment.instanceDate || parseISO(selectedAssignment.due_date), 'PPP')}
                  </span>
                </div>
                {selectedAssignment.completed_at && (
                  <div>
                    <p className="text-muted-foreground mb-1">Completed At</p>
                    <span className="font-medium">
                      {format(new Date(selectedAssignment.completed_at), 'PPP')}
                    </span>
                  </div>
                )}
              </div>

              {selectedAssignment.notes && (
                <div>
                  <p className="text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm bg-muted p-3 rounded">{selectedAssignment.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                {selectedAssignment.content_category === 'email_blast' && emailBlastMap.has(parseCompositeId(selectedAssignment.id).assignmentId) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setBlastPreviewId(emailBlastMap.get(parseCompositeId(selectedAssignment.id).assignmentId)!);
                    }}
                    className="flex-1"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    View Submission
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => handleMarkComplete(selectedAssignment.id, selectedAssignment.is_completed)}
                  className="flex-1"
                >
                  <SquareCheck className="mr-2 h-4 w-4" />
                  {selectedAssignment.is_completed ? 'Mark Incomplete' : 'Mark Complete'}
                </Button>
                {selectedAssignment.isVirtualInstance ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditInstanceDialogOpen(true);
                      setDetailsDialogOpen(false);
                    }}
                    className="flex-1"
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Instance
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingAssignment(selectedAssignment);
                      setAssignmentDialogOpen(true);
                      setDetailsDialogOpen(false);
                    }}
                    className="flex-1"
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Assignment
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      disabled={deletingId === parseCompositeId(selectedAssignment.id).assignmentId}
                      className="flex-1"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Assignment</AlertDialogTitle>
                      <AlertDialogDescription>
                        {selectedAssignment.isVirtualInstance ? (
                          <>
                            &ldquo;{selectedAssignment.assignment_name}&rdquo; is a recurring assignment. Deleting it will permanently remove the entire recurring series and all of its instances — not just this date. This action cannot be undone.
                          </>
                        ) : (
                          <>
                            Are you sure you want to delete &ldquo;{selectedAssignment.assignment_name}&rdquo;? This will permanently remove the assignment and all related instances. This action cannot be undone.
                          </>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDeleteAssignment(parseCompositeId(selectedAssignment.id).assignmentId)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AssignmentDialog
        open={assignmentDialogOpen}
        onOpenChange={(open) => {
          setAssignmentDialogOpen(open);
          if (!open) setDefaultDate(undefined);
        }}
        onSuccess={fetchAssignments}
        editingAssignment={editingAssignment}
        defaultDate={defaultDate}
      />

      {selectedAssignment?.isVirtualInstance && (
        <EditInstanceDialog
          open={editInstanceDialogOpen}
          onOpenChange={setEditInstanceDialogOpen}
          assignment={selectedAssignment}
          instanceDate={selectedAssignment.instanceDate}
          onSuccess={fetchAssignments}
        />
      )}

      <EmailBlastPreview
        open={!!blastPreviewId}
        onOpenChange={(open) => { if (!open) setBlastPreviewId(null); }}
        blastId={blastPreviewId || ''}
      />
    </div>
  );
}
