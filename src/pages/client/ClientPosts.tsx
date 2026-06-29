import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PenTool, Calendar as CalendarIcon, Globe, ArrowUpDown, Search, Edit, List, Repeat, ChevronLeft, ChevronRight, AlertTriangle, RotateCcw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format, subMonths, addMonths, parseISO } from 'date-fns';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { generateAllCalendarEvents, getLimitedAssignmentView, GeneratedEvent, AssignmentInstance } from '@/lib/recurrenceUtils';
import { PostActionsMenu } from '@/components/PostActionsMenu';
import { SkipPostDialog } from '@/components/SkipPostDialog';
import { EditNotesDialog } from '@/components/EditNotesDialog';
import { RequestNewDateDialog } from '@/components/RequestNewDateDialog';
import { SubmittedPostPreview } from '@/components/SubmittedPostPreview';
import { WelcomeCard } from '@/components/client/WelcomeCard';
import { useClientPostsViewState, FilterStatus, SortOption, SortPreferences, ViewMode } from '@/hooks/useClientPostsViewState';

const localizer = momentLocalizer(moment);

// Custom date formats for calendar
const calendarFormats = {
  dateFormat: 'D',
  dayFormat: 'D ddd',
  monthHeaderFormat: 'MMMM YYYY',
};

const ITEMS_PER_PAGE = 10;

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: any;
}

export default function ClientPosts() {
  const { user, activeOrganizationId, activeOrganizationName } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [instances, setInstances] = useState<AssignmentInstance[]>([]);
  const [submittedPostsCount, setSubmittedPostsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  // Use persistent view state hook
  const {
    filterStatus,
    setFilterStatus,
    viewMode,
    setViewMode,
    sortPreferences,
    updateSortForTab,
    calendarDate,
    setCalendarDate,
    resetToDefaults,
    isDefaultView,
  } = useClientPostsViewState();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  
  // State for post actions
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [dateRequestDialogOpen, setDateRequestDialogOpen] = useState(false);
  const [selectedPostForAction, setSelectedPostForAction] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [previewPostId, setPreviewPostId] = useState<string | null>(null);

  // Helper function to check if assignment was completed within past two weeks
  const isWithinTwoWeeks = (completedAt: string | null) => {
    if (!completedAt) return false;
    const completedDate = new Date(completedAt);
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    return completedDate >= twoWeeksAgo;
  };

  useEffect(() => {
    if (user && activeOrganizationId) {
      fetchAssignments();
    }
  }, [user, activeOrganizationId]);

  // Generate calendar events when assignments change
  useEffect(() => {
    const viewStart = subMonths(new Date(), 3);
    const viewEnd = addMonths(new Date(), 12);
    const events = generateAllCalendarEvents(assignments, viewStart, viewEnd, instances);
    setCalendarEvents(events as CalendarEvent[]);
  }, [assignments, instances]);

  // Sort preferences are now persisted by the useClientPostsViewState hook

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, debouncedSearchTerm]);

  const fetchAssignments = async () => {
    if (!activeOrganizationId || !user) return;
    
    try {
      // Fetch only website posts (exclude email blasts and sponsorships)
      const { data, error } = await supabase
        .from('post_assignments')
        .select(`
          *,
          site:sites(name, url),
          post:posts(featured_image_url, gallery_images)
        `)
        .eq('organization_id', activeOrganizationId)
        .eq('content_category', 'website')
        .order('due_date', { ascending: true });

      if (error) throw error;
      setAssignments(data || []);

      // Fetch assignment instances for calendar view
      if (data && data.length > 0) {
        const assignmentIds = data.map(a => a.id);
        const { data: instancesData, error: instancesError } = await supabase
          .from('assignment_instances')
          .select('*')
          .in('assignment_id', assignmentIds);

        if (instancesError) throw instancesError;
        setInstances(instancesData || []);
      }

      // Fetch submitted posts count directly from posts table to match Drafts & Submissions
      const { count: postsCount, error: postsError } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', user.id)
        .eq('organization_id', activeOrganizationId)
        .in('status', ['published', 'pending_edit_review']);

      if (postsError) throw postsError;
      setSubmittedPostsCount(postsCount || 0);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const getFeaturedImageUrl = (assignment: any): string | null => {
    if (!assignment.is_completed || !assignment.post) return null;
    
    const post = Array.isArray(assignment.post) ? assignment.post[0] : assignment.post;
    if (!post) return null;

    if (post.featured_image_url) {
      return post.featured_image_url;
    }

    if (post.gallery_images && Array.isArray(post.gallery_images)) {
      const featuredImage = post.gallery_images.find((img: any) => img.isFeatured);
      if (featuredImage) {
        return featuredImage.url;
      }
    }

    return null;
  };

  const getAssignmentStatus = (assignment: any): 'submitted' | 'overdue' | 'upcoming' | 'skipped' => {
    // Check for skipped status first
    if (assignment.is_skipped || assignment.instanceRecord?.is_skipped) {
      return 'skipped';
    }
    
    if (assignment.is_completed) {
      return 'submitted';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = parseISO(assignment.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) {
      return 'overdue';
    }
    return 'upcoming';
  };

  const isDueSoon = (assignment: any): boolean => {
    if (assignment.is_completed) return false;
    if (!assignment.due_date) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = parseISO(assignment.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return daysUntilDue >= 0 && daysUntilDue <= 3;
  };

  // Check if assignment is urgent (due today or tomorrow)
  const isUrgent = (assignment: any): boolean => {
    if (assignment.is_completed) return false;
    if (!assignment.due_date) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = parseISO(assignment.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return daysUntilDue >= 0 && daysUntilDue <= 1;
  };

  const getStatusBadge = (assignment: any) => {
    const status = getAssignmentStatus(assignment);
    
    switch (status) {
      case 'skipped':
        return <Badge className="bg-gray-500 hover:bg-gray-600">Skipped</Badge>;
      case 'submitted':
        return <Badge className="bg-green-600 hover:bg-green-700">Submitted</Badge>;
      case 'overdue':
        return <Badge className="bg-red-600 hover:bg-red-700">Overdue</Badge>;
      case 'upcoming':
        if (isDueSoon(assignment)) {
          return <Badge className="bg-yellow-600 hover:bg-yellow-700">Due Soon</Badge>;
        }
        return <Badge className="bg-blue-600 hover:bg-blue-700">Upcoming</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  // Calendar event handlers
  const handleSelectEvent = (event: CalendarEvent) => {
    const generatedEvent = event as unknown as GeneratedEvent;
    setSelectedAssignment({
      ...event.resource,
      isVirtualInstance: generatedEvent.isVirtualInstance,
      instanceDate: generatedEvent.instanceDate,
    });
    setDetailsDialogOpen(true);
  };

  const eventStyleGetter = (event: CalendarEvent) => {
    const assignment = event.resource;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = parseISO(assignment.due_date);
    dueDate.setHours(0, 0, 0, 0);
    
    let backgroundColor = 'hsl(var(--primary))';
    
    if (assignment.is_completed) {
      backgroundColor = 'hsl(142 71% 45%)'; // Green for completed
    } else if (dueDate < today) {
      backgroundColor = 'hsl(0 84% 60%)'; // Red for overdue
    } else if (dueDate.getTime() - today.getTime() <= 3 * 24 * 60 * 60 * 1000) {
      backgroundColor = 'hsl(45 93% 47%)'; // Yellow for due soon
    } else {
      backgroundColor = 'hsl(214 100% 50%)'; // Blue for upcoming
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: assignment.is_completed ? 0.7 : 1,
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

  const getCalendarStatusBadge = (assignment: any) => {
    if (assignment.is_completed) {
      return <Badge className="bg-green-600">Completed</Badge>;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = parseISO(assignment.due_date);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today) {
      return <Badge className="bg-red-600">Overdue</Badge>;
    } else if (dueDate.getTime() - today.getTime() <= 3 * 24 * 60 * 60 * 1000) {
      return <Badge className="bg-yellow-600">Due Soon</Badge>;
    }
    return <Badge variant="secondary">Upcoming</Badge>;
  };

  const filteredAndSortedAssignments = useMemo(() => {
    const currentSortOption = sortPreferences[filterStatus];
    
    // For "Upcoming" tab, use limited view for recurring posts
    if (filterStatus === 'upcoming') {
      // Get limited recurring events
      const limitedEvents = getLimitedAssignmentView(assignments, instances, {
        upcomingLimit: 100,
        overdueDaysLimit: 30,
        includeOverdue: false,
      });
      
      // Apply search filter to events
      let filtered = limitedEvents;
      if (debouncedSearchTerm) {
        filtered = filtered.filter(event => 
          event.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          event.resource.site?.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          event.resource.notes?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
        );
      }
      
      // Map back to assignment-like objects for display
      return filtered.map(event => ({
        ...event.resource,
        id: event.id,
        originalId: event.originalId,
        assignment_name: event.title,
        due_date: format(event.instanceDate, 'yyyy-MM-dd'),
        isVirtualInstance: event.isVirtualInstance,
        instanceDate: event.instanceDate,
        instanceRecord: event.instanceRecord,
      }));
    }

    // For "All" tab, show everything: expanded recurring + completed/skipped
    if (filterStatus === 'all') {
      // Get all upcoming and overdue recurring events with generous limits
      const allActiveEvents = getLimitedAssignmentView(assignments, instances, {
        upcomingLimit: 100,
        overdueDaysLimit: 30,
        includeOverdue: true,
      });

      const activeItems = allActiveEvents.map(event => ({
        ...event.resource,
        id: event.id,
        originalId: event.originalId,
        assignment_name: event.title,
        due_date: format(event.instanceDate, 'yyyy-MM-dd'),
        isVirtualInstance: event.isVirtualInstance,
        instanceDate: event.instanceDate,
        instanceRecord: event.instanceRecord,
      }));

      // Also include completed/skipped one-time assignments
      const completedOneTime = assignments.filter(a =>
        a.recurrence_type === 'one_time' && (a.is_completed || a.is_skipped)
      );

      // And completed/skipped recurring instances
      const completedRecurring = instances
        .filter(inst => inst.is_completed || inst.is_skipped)
        .map(inst => {
          const parentAssignment = assignments.find(a => a.id === inst.assignment_id);
          if (!parentAssignment) return null;
          return {
            ...parentAssignment,
            id: `${inst.assignment_id}-${inst.instance_date}`,
            originalId: inst.assignment_id,
            due_date: inst.instance_date,
            is_completed: inst.is_completed,
            is_skipped: inst.is_skipped,
            completed_at: inst.completed_at,
            submitted_post_id: inst.submitted_post_id,
            isVirtualInstance: true,
            instanceDate: parseISO(inst.instance_date),
            instanceRecord: inst,
          };
        })
        .filter(Boolean);

      // Merge and deduplicate by id
      const allItemsMap = new Map<string, any>();
      [...activeItems, ...completedOneTime, ...completedRecurring].forEach(item => {
        if (item && !allItemsMap.has(item.id)) {
          allItemsMap.set(item.id, item);
        }
      });

      let allItems = Array.from(allItemsMap.values());

      // Apply search filter
      if (debouncedSearchTerm) {
        allItems = allItems.filter(assignment =>
          assignment.assignment_name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          assignment.site?.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          assignment.notes?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
        );
      }

      // Sort by due date descending by default
      const currentSort = sortPreferences[filterStatus];
      allItems.sort((a, b) => {
        switch (currentSort) {
          case 'due_date_asc':
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          case 'due_date_desc':
            return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
          case 'name_asc':
            return a.assignment_name.localeCompare(b.assignment_name);
          case 'name_desc':
            return b.assignment_name.localeCompare(a.assignment_name);
          default:
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        }
      });

      return allItems;
    }
    
    // For "Submitted" tab, include completed instances from recurring assignments
    if (filterStatus === 'submitted') {
      // Get completed one-time assignments
      const completedOneTime = assignments.filter(a => 
        a.recurrence_type === 'one_time' && (a.is_completed || a.is_skipped)
      );
      
      // Get completed/skipped instances of recurring assignments
      const completedRecurring = instances
        .filter(inst => inst.is_completed || inst.is_skipped)
        .map(inst => {
          const parentAssignment = assignments.find(a => a.id === inst.assignment_id);
          if (!parentAssignment) return null;
          return {
            ...parentAssignment,
            id: `${inst.assignment_id}-${inst.instance_date}`,
            originalId: inst.assignment_id,
            due_date: inst.instance_date,
            is_completed: inst.is_completed,
            is_skipped: inst.is_skipped,
            completed_at: inst.completed_at,
            submitted_post_id: inst.submitted_post_id,
            isVirtualInstance: true,
            instanceDate: parseISO(inst.instance_date),
            instanceRecord: inst,
          };
        })
        .filter(Boolean);
      
      let allSubmitted = [...completedOneTime, ...completedRecurring];
      
      // Apply search filter
      if (debouncedSearchTerm) {
        allSubmitted = allSubmitted.filter(assignment => 
          assignment.assignment_name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          assignment.site?.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          assignment.notes?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
        );
      }
      
      // Apply sorting
      const sorted = [...allSubmitted].sort((a, b) => {
        // Sort by completion date if available
        if (a.completed_at && b.completed_at) {
          const aCompletedAt = new Date(a.completed_at).getTime();
          const bCompletedAt = new Date(b.completed_at).getTime();
          
          if (currentSortOption === 'due_date_desc') {
            return bCompletedAt - aCompletedAt;
          } else if (currentSortOption === 'due_date_asc') {
            return aCompletedAt - bCompletedAt;
          }
        }
        
        switch (currentSortOption) {
          case 'due_date_asc':
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
          case 'due_date_desc':
            return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
          case 'name_asc':
            return a.assignment_name.localeCompare(b.assignment_name);
          case 'name_desc':
            return b.assignment_name.localeCompare(a.assignment_name);
          default:
            return 0;
        }
      });
      
      return sorted;
    }
    
    // For "Overdue" tab, use instance-aware logic (similar to All/Upcoming)
    // This ensures recurring assignment instances are properly expanded and skipped instances are filtered out
    const overdueEvents = getLimitedAssignmentView(assignments, instances, {
      upcomingLimit: 0,  // No upcoming items
      overdueDaysLimit: 30,  // Show overdue up to 30 days back
      includeOverdue: true,
    });
    
    // Map to assignment-like objects with instanceRecord
    let mapped = overdueEvents.map(event => ({
      ...event.resource,
      id: event.id,
      originalId: event.originalId,
      assignment_name: event.title,
      due_date: format(event.instanceDate, 'yyyy-MM-dd'),
      isVirtualInstance: event.isVirtualInstance,
      instanceDate: event.instanceDate,
      instanceRecord: event.instanceRecord,
    }));
    
    // Filter to only overdue items (getLimitedAssignmentView may return some edge cases)
    mapped = mapped.filter(assignment => {
      const status = getAssignmentStatus(assignment);
      return status === 'overdue';
    });

    // Apply search filter
    if (debouncedSearchTerm) {
      mapped = mapped.filter(assignment => 
        assignment.assignment_name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        assignment.site?.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        assignment.notes?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      );
    }

    // Apply sorting
    const sorted = [...mapped].sort((a, b) => {
      switch (currentSortOption) {
        case 'due_date_asc':
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        case 'due_date_desc':
          return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
        case 'name_asc':
          return a.assignment_name.localeCompare(b.assignment_name);
        case 'name_desc':
          return b.assignment_name.localeCompare(a.assignment_name);
        default:
          return 0;
      }
    });

    return sorted;
  }, [assignments, instances, filterStatus, sortPreferences, debouncedSearchTerm]);

  const paginatedAssignments = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredAndSortedAssignments.slice(startIndex, endIndex);
  }, [filteredAndSortedAssignments, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedAssignments.length / ITEMS_PER_PAGE);

  const generatePageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, 'ellipsis', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages);
      }
    }
    
    return pages;
  };

  const statusCounts = useMemo(() => {
    // Use instance-aware logic for accurate counts
    
    // Get upcoming instances - match the display limit
    const upcomingEvents = getLimitedAssignmentView(assignments, instances, {
      upcomingLimit: 4,    // Match the display limit
      overdueDaysLimit: 0, // No overdue
      includeOverdue: false,
    });
    
    // Get all overdue instances (limited view)
    const overdueEvents = getLimitedAssignmentView(assignments, instances, {
      upcomingLimit: 0,     // No upcoming
      overdueDaysLimit: 30, // Show overdue up to 30 days
      includeOverdue: true,
    });
    
    // Filter overdue to only actual overdue (not skipped)
    const overdueCount = overdueEvents.filter(event => {
      const status = getAssignmentStatus({
        ...event.resource,
        instanceRecord: event.instanceRecord
      });
      return status === 'overdue';
    }).length;
    
    return {
      all: (() => {
        const activeEvents = getLimitedAssignmentView(assignments, instances, {
          upcomingLimit: 100,
          overdueDaysLimit: 30,
          includeOverdue: true,
        });
        const completedOneTimeCount = assignments.filter(a =>
          a.recurrence_type === 'one_time' && (a.is_completed || a.is_skipped)
        ).length;
        const completedRecurringCount = instances.filter(inst =>
          (inst.is_completed || inst.is_skipped) &&
          assignments.some(a => a.id === inst.assignment_id)
        ).length;
        // Deduplicate: active events won't include completed, so simple sum works
        return activeEvents.length + completedOneTimeCount + completedRecurringCount;
      })(),
      upcoming: upcomingEvents.length,
      overdue: overdueCount,
      // Use posts count from posts table to match Drafts & Submissions count
      submitted: submittedPostsCount,
    };
  }, [assignments, instances, submittedPostsCount]);

  const handleSortChange = (value: SortOption) => {
    updateSortForTab(filterStatus, value);
  };

  const handleResetView = () => {
    resetToDefaults();
    setSearchTerm('');
    setCurrentPage(1);
    toast.success('View reset to defaults');
  };

  // Handle skip post action
  const handleSkipPost = async () => {
    if (!selectedPostForAction) return;
    
    setActionLoading(true);
    try {
      const assignment = selectedPostForAction;
      const isRecurring = assignment.recurrence_type !== 'one_time';
      
      if (isRecurring || assignment.isVirtualInstance) {
        // For recurring assignments, upsert an instance record
        const instanceDate = assignment.instanceDate 
          ? format(assignment.instanceDate, 'yyyy-MM-dd')
          : assignment.due_date;
        
        const { error } = await supabase.from('assignment_instances').upsert({
          assignment_id: assignment.originalId || assignment.id,
          instance_date: instanceDate,
          is_skipped: true,
          skip_type: 'user_skipped',
          exception_notes: 'Skipped by user',
        }, {
          onConflict: 'assignment_id,instance_date'
        });
        
        if (error) throw error;
      } else {
        // For one-time assignments, update the assignment directly
        const { error } = await supabase
          .from('post_assignments')
          .update({ 
            is_skipped: true,
            skip_type: 'user_skipped'
          })
          .eq('id', assignment.id);
        
        if (error) throw error;
      }
      
      toast.success('Post skipped successfully');
      fetchAssignments();
      // Invalidate badge count so navigation updates
      queryClient.invalidateQueries({ queryKey: ['my-posts-badge-count'] });
    } catch (error) {
      console.error('Error skipping post:', error);
      toast.error('Failed to skip post');
    } finally {
      setActionLoading(false);
      setSkipDialogOpen(false);
      setSelectedPostForAction(null);
    }
  };

  // Handle edit notes action
  const handleUpdateNotes = async (newNotes: string) => {
    if (!selectedPostForAction) return;
    
    setActionLoading(true);
    try {
      const assignment = selectedPostForAction;
      const isRecurring = assignment.recurrence_type !== 'one_time';
      
      if (isRecurring || assignment.isVirtualInstance) {
        // For recurring assignments, upsert an instance record with exception notes
        const instanceDate = assignment.instanceDate 
          ? format(assignment.instanceDate, 'yyyy-MM-dd')
          : assignment.due_date;
        
        const { error } = await supabase.from('assignment_instances').upsert({
          assignment_id: assignment.originalId || assignment.id,
          instance_date: instanceDate,
          exception_notes: newNotes,
        }, {
          onConflict: 'assignment_id,instance_date'
        });
        
        if (error) throw error;
      } else {
        // For one-time assignments, update the assignment notes directly
        const { error } = await supabase
          .from('post_assignments')
          .update({ notes: newNotes })
          .eq('id', assignment.id);
        
        if (error) throw error;
      }
      
      toast.success('Notes updated successfully');
      fetchAssignments();
      // Invalidate badge count in case notes update affects status
      queryClient.invalidateQueries({ queryKey: ['my-posts-badge-count'] });
    } catch (error) {
      console.error('Error updating notes:', error);
      toast.error('Failed to update notes');
    } finally {
      setActionLoading(false);
      setNotesDialogOpen(false);
      setSelectedPostForAction(null);
    }
  };

  const openSkipDialog = (assignment: any) => {
    setSelectedPostForAction(assignment);
    setSkipDialogOpen(true);
  };

  const openNotesDialog = (assignment: any) => {
    setSelectedPostForAction(assignment);
    setNotesDialogOpen(true);
  };

  const openDateRequestDialog = (assignment: any) => {
    setSelectedPostForAction(assignment);
    setDateRequestDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-4"></div>
          <div className="h-12 bg-muted rounded mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Posts</h1>
          <p className="text-muted-foreground mt-1">All scheduled assignments for your organization</p>
        </div>
        
        {/* Reset View and View Toggle */}
        <div className="flex items-center gap-2">
          {!isDefaultView && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetView}
              className="text-muted-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset View
            </Button>
          )}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="gap-2"
            >
              <List className="h-4 w-4" />
              List
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('calendar')}
              className="gap-2"
            >
              <CalendarIcon className="h-4 w-4" />
              Calendar
            </Button>
          </div>
        </div>
      </div>

      <WelcomeCard />

      {viewMode === 'list' ? (
        <>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search posts by name, site, or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="mb-6 flex items-center justify-between gap-4">
            <Tabs value={filterStatus} onValueChange={(value) => setFilterStatus(value as FilterStatus)} className="flex-1">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="all" className="relative">
                  All
                  {statusCounts.all > 0 && (
                    <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded">
                      {statusCounts.all}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="upcoming">
                  Upcoming
                  {statusCounts.upcoming > 0 && (
                    <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded">
                      {statusCounts.upcoming}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="overdue">
                  Overdue
                  {statusCounts.overdue > 0 && (
                    <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded">
                      {statusCounts.overdue}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="submitted">
                  Submitted
                  {statusCounts.submitted > 0 && (
                    <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded">
                      {statusCounts.submitted}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={sortPreferences[filterStatus]} onValueChange={handleSortChange}>
              <SelectTrigger className="w-[160px]">
                <ArrowUpDown className="mr-1 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due_date_asc">Date (Earliest)</SelectItem>
                <SelectItem value="due_date_desc">Date (Latest)</SelectItem>
                <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z-A)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredAndSortedAssignments.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-lg">
              {assignments.length === 0 ? (
                <div className="max-w-md mx-auto space-y-3">
                  <p className="font-medium text-foreground">Your content schedule will appear here</p>
                  <p className="text-sm text-muted-foreground">
                    When we schedule sponsored posts for your organization, they'll show up on this page, ready for you to write and submit.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <Button size="sm" onClick={() => navigate('/client/submit')}>
                      <PenTool className="h-4 w-4 mr-1" />
                      Submit a post
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No {filterStatus === 'all' ? '' : filterStatus} posts found.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedAssignments.map((assignment) => {
                  const featuredImageUrl = getFeaturedImageUrl(assignment);
                  
                  return (
                    <div key={assignment.id} className={`bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow ${isDueSoon(assignment) ? 'border-l-4 border-l-amber-500' : ''}`}>
                      <div className="flex justify-between items-start gap-4">
                        {featuredImageUrl && (
                          <img 
                            src={featuredImageUrl} 
                            alt="Featured" 
                            className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                          />
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-lg font-semibold text-foreground truncate">
                              {assignment.assignment_name}
                            </h3>
                            {getStatusBadge(assignment)}
                            <Badge variant={assignment.post_type === 'column' ? 'default' : 'secondary'}>
                              {assignment.post_type === 'column' ? 'Column' : 'Standard'}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Globe className="h-4 w-4" />
                              <span>{assignment.site?.name}</span>
                            </div>
                            <div className={`flex items-center gap-2 ${isUrgent(assignment) ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}>
                              <CalendarIcon className="h-4 w-4" />
                              <span>{format(parseISO(assignment.due_date), 'MMM d, yyyy')}</span>
                              {isUrgent(assignment) && (
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                            
                            {assignment.recurrence_type !== 'one_time' && (
                              <div className="text-muted-foreground col-span-2">
                                <span className="font-medium">Recurrence:</span>{' '}
                                {assignment.recurrence_type.replace('_', ' ')}
                              </div>
                            )}
                          </div>

                          {(assignment.notes || assignment.instanceRecord?.exception_notes) && (
                            <div className="mt-3 p-3 bg-muted rounded text-sm">
                              <span className="font-medium text-foreground">Notes:</span>{' '}
                              <span className="text-muted-foreground">
                                {assignment.instanceRecord?.exception_notes || assignment.notes}
                              </span>
                            </div>
                          )}

                          {assignment.is_completed && assignment.completed_at && (
                            <div className="mt-3 text-xs text-muted-foreground">
                              Submitted on {format(new Date(assignment.completed_at), 'MMM d, yyyy')}
                            </div>
                          )}
                        </div>

                        <div className="flex items-start gap-2">
                          {/* Actions Menu - only show for incomplete, non-skipped posts */}
                          {!assignment.is_completed && !assignment.is_skipped && (
                            <PostActionsMenu
                              onSkipPost={() => openSkipDialog(assignment)}
                              onEditNotes={() => openNotesDialog(assignment)}
                              onRequestNewDate={() => openDateRequestDialog(assignment)}
                            />
                          )}
                          
                          {!assignment.is_completed && !assignment.is_skipped ? (
                            <Link to={`/client/submit?assignment=${assignment.id}`}>
                              <Button size="sm" className="whitespace-nowrap">
                                <PenTool className="mr-2 h-4 w-4" />
                                Submit Post
                              </Button>
                            </Link>
                          ) : (
                            <>
                              {assignment.submitted_post_id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPreviewPostId(assignment.submitted_post_id)}
                                  className="whitespace-nowrap"
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  View
                                </Button>
                              )}
                              {assignment.submitted_post_id && 
                              isWithinTwoWeeks(assignment.completed_at) && (
                                <Link to={`/client/edit?id=${assignment.submitted_post_id}&from=posts`}>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    className="whitespace-nowrap border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950"
                                  >
                                    <Edit className="mr-2 h-4 w-4" />
                                    Edit Post
                                  </Button>
                                </Link>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <Pagination className="mt-6">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    
                    {generatePageNumbers().map((page, index) => (
                      <PaginationItem key={index}>
                        {page === 'ellipsis' ? (
                          <PaginationEllipsis />
                        ) : (
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        )}
                      </PaginationItem>
                    ))}
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </>
      ) : (
        /* Calendar View */
        <>
          <div className="mb-4 flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(214 100% 50%)' }}></div>
              <span>Upcoming</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(45 93% 47%)' }}></div>
              <span>Due Soon (3 days)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'hsl(0 84% 60%)' }}></div>
              <span>Overdue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded opacity-70" style={{ backgroundColor: 'hsl(142 71% 45%)' }}></div>
              <span>Completed</span>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 w-full min-w-[900px] max-w-[1600px] mx-auto overflow-x-auto" style={{ height: '800px' }}>
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: '100%' }}
              date={calendarDate}
              onNavigate={(date) => setCalendarDate(date)}
              onSelectEvent={handleSelectEvent}
              eventPropGetter={eventStyleGetter}
              dayPropGetter={dayPropGetter}
              views={[Views.MONTH]}
              defaultView={Views.MONTH}
              formats={calendarFormats}
            />
          </div>

          <div className="flex justify-center items-center gap-4 mt-4 pb-4">
            <Button variant="outline" size="sm" onClick={() => setCalendarDate(subMonths(calendarDate, 1))}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCalendarDate(new Date())}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCalendarDate(addMonths(calendarDate, 1))}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </>
      )}

      {/* Calendar Event Details Dialog */}
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
                  <Badge variant={selectedAssignment.post_type === 'column' ? 'default' : 'secondary'}>
                    {selectedAssignment.post_type === 'column' ? 'Column' : 'Standard'}
                  </Badge>
                  {getCalendarStatusBadge(selectedAssignment)}
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
                  <p className="text-muted-foreground mb-1">Publication Date</p>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    <span className="font-medium">
                      {format(selectedAssignment.instanceDate || parseISO(selectedAssignment.due_date), 'PPP')}
                    </span>
                  </div>
                </div>
              </div>

              {selectedAssignment.notes && (
                <div>
                  <p className="text-muted-foreground mb-1">Notes from Admin</p>
                  <p className="text-sm bg-muted p-3 rounded">{selectedAssignment.notes}</p>
                </div>
              )}

              {!selectedAssignment.is_completed && (
                <div className="pt-4 border-t">
                  <Button
                    onClick={() => {
                      navigate(`/client/submit?assignment=${selectedAssignment.id}`);
                      setDetailsDialogOpen(false);
                    }}
                    className="w-full"
                  >
                    Submit Post for This Assignment
                  </Button>
                </div>
              )}

              {selectedAssignment.is_completed && selectedAssignment.completed_at && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Completed on {format(new Date(selectedAssignment.completed_at), 'PPP')}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Skip Post Dialog */}
      <SkipPostDialog
        open={skipDialogOpen}
        onOpenChange={setSkipDialogOpen}
        assignmentName={selectedPostForAction?.assignment_name || ''}
        dueDate={selectedPostForAction ? format(parseISO(selectedPostForAction.due_date), 'MMM d, yyyy') : ''}
        onConfirm={handleSkipPost}
        isLoading={actionLoading}
      />

      {/* Edit Notes Dialog */}
      <EditNotesDialog
        open={notesDialogOpen}
        onOpenChange={setNotesDialogOpen}
        assignmentName={selectedPostForAction?.assignment_name || ''}
        currentNotes={selectedPostForAction?.instanceRecord?.exception_notes || selectedPostForAction?.notes || ''}
        onSave={handleUpdateNotes}
        isLoading={actionLoading}
      />

      {/* Request New Date Dialog */}
      {selectedPostForAction && user && (
        <RequestNewDateDialog
          open={dateRequestDialogOpen}
          onOpenChange={setDateRequestDialogOpen}
          assignmentId={selectedPostForAction.originalId || selectedPostForAction.id}
          assignmentName={selectedPostForAction.assignment_name || ''}
          currentDueDate={selectedPostForAction.due_date}
          instanceDate={selectedPostForAction.instanceDate}
          onSuccess={fetchAssignments}
          userId={user.id}
          organizationId={activeOrganizationId}
          organizationName={activeOrganizationName}
        />
      )}

      {/* Submitted Post Preview */}
      <SubmittedPostPreview
        open={!!previewPostId}
        onOpenChange={(open) => !open && setPreviewPostId(null)}
        postId={previewPostId || ''}
      />
    </div>
  );
}