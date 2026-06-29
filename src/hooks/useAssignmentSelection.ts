import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, addMonths, addDays, parseISO } from 'date-fns';
import { getLimitedAssignmentView, AssignmentInstance, generateRecurringEvents } from '@/lib/recurrenceUtils';

interface Assignment {
  id: string;
  originalId?: string;
  assignment_name: string;
  due_date: string;
  site_id: string;
  post_type: string;
  is_completed: boolean;
  is_skipped: boolean;
  recurrence_type: string;
  recurrence_day_of_week: number | null;
  recurrence_end_date: string | null;
  organization_id: string | null;
  notes: string | null;
  assigned_to: string | null;
  site?: { name: string; url: string };
  profiles?: { full_name: string | null; email: string };
  isVirtualInstance?: boolean;
  instanceDate?: Date;
}

interface UseAssignmentSelectionOptions {
  mode: 'client' | 'admin';
  organizationId: string | null;
  siteId?: string | null;
  preselectedAssignmentId?: string | null;
  upcomingLimit?: number;
  overdueDaysLimit?: number;
  /** Admin mode: max future instances per assignment (default 3) */
  perAssignmentLimit?: number;
  /** Restrict selectable assignments to a single content category (default 'website') */
  contentCategory?: 'website' | 'email_blast' | 'email_sponsorship';
  /**
   * Called when a deep-link `?assignment=<id>` references an assignment whose
   * `content_category` does NOT match `contentCategory`. The actual category is
   * passed so the page can redirect to the correct submit flow.
   */
  onCategoryMismatch?: (actualCategory: 'website' | 'email_blast' | 'email_sponsorship', assignmentId: string) => void;
}

interface UseAssignmentSelectionReturn {
  assignments: Assignment[];
  instances: AssignmentInstance[];
  selectedAssignments: string[];
  isLoading: boolean;
  siteName: string;
  preselectedAssignment: Assignment | null;
  toggleAssignment: (assignmentId: string) => void;
  setSelectedAssignments: (ids: string[]) => void;
  clearSelection: () => void;
  clearPreselection: () => void;
  markAssignmentStarted: (assignmentId: string, instanceDate?: Date) => Promise<void>;
  refetch: () => Promise<void>;
  /** Admin mode: bump perAssignmentLimit to show more future instances */
  loadMore: () => void;
  /** Admin mode: true while extra instances are being loaded */
  isLoadMoreActive: boolean;
}

export function useAssignmentSelection(
  options: UseAssignmentSelectionOptions
): UseAssignmentSelectionReturn {
  const {
    mode,
    organizationId,
    siteId,
    preselectedAssignmentId,
    upcomingLimit = 4,
    overdueDaysLimit = 2,
    perAssignmentLimit: perAssignmentLimitProp = 3,
    contentCategory = 'website',
    onCategoryMismatch,
  } = options;

  // Hold the latest onCategoryMismatch in a ref so it doesn't destabilize
  // the fetch callback (and thus the effect that calls it). Without this,
  // an inline callback from the caller causes a refetch loop and the
  // "Loading assignments..." spinner never clears.
  const onCategoryMismatchRef = useRef(onCategoryMismatch);
  useEffect(() => {
    onCategoryMismatchRef.current = onCategoryMismatch;
  }, [onCategoryMismatch]);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [instances, setInstances] = useState<AssignmentInstance[]>([]);
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [preselectedAssignment, setPreselectedAssignment] = useState<Assignment | null>(null);
  const [perAssignmentLimit, setPerAssignmentLimit] = useState(perAssignmentLimitProp);

  const fetchClientAssignments = useCallback(async () => {
    if (!organizationId) {
      setAssignments([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('post_assignments')
        .select(`*, site:sites(name, url)`)
        .eq('organization_id', organizationId)
        .eq('content_category', contentCategory)
        .or('is_completed.eq.false,recurrence_type.neq.one_time')
        .order('due_date', { ascending: true });

      if (error) throw error;

      let instancesData: AssignmentInstance[] = [];
      if (data && data.length > 0) {
        const assignmentIds = data.map(a => a.id);
        const { data: instData, error: instancesError } = await supabase
          .from('assignment_instances')
          .select('*')
          .in('assignment_id', assignmentIds);
        
        if (instancesError) throw instancesError;
        instancesData = instData || [];
        setInstances(instancesData);
      }

      // Get limited events from assignments WITH due dates
      const datedAssignments = (data || []).filter(a => a.due_date);
      const limitedEvents = getLimitedAssignmentView(datedAssignments, instancesData, {
        upcomingLimit,
        overdueDaysLimit,
        includeOverdue: true
      });

      const limitedAssignments = limitedEvents.map(event => ({
        ...event.resource,
        id: event.id,
        originalId: event.originalId,
        assignment_name: event.title,
        due_date: event.resource.due_date,
        isVirtualInstance: event.isVirtualInstance,
        instanceDate: event.instanceDate
      }));

      // Also include assignments WITHOUT due dates (TBD assignments)
      const undatedAssignments = (data || []).filter(a => !a.due_date && !a.is_completed && !a.is_skipped);
      const undatedMapped = undatedAssignments.map(a => ({
        ...a,
        id: a.id,
        originalId: a.id,
        assignment_name: a.assignment_name,
        due_date: 'TBD',
        isVirtualInstance: false,
        instanceDate: undefined
      }));

      // Combine: dated assignments first, then undated at the end
      const combinedAssignments = [...limitedAssignments, ...undatedMapped];
      setAssignments(combinedAssignments);

      if (combinedAssignments.length > 0 && combinedAssignments[0].site) {
        setSiteName(combinedAssignments[0].site.name);
      }

      // Handle preselected assignment
      if (preselectedAssignmentId) {
        let matchingAssignment = combinedAssignments.find(
          a => a.id === preselectedAssignmentId || a.originalId === preselectedAssignmentId
        );
        
        // If not found in limited view, fetch it explicitly
        if (!matchingAssignment) {
          const { data: directAssignment, error: directError } = await supabase
            .from('post_assignments')
            .select(`*, site:sites(name, url)`)
            .eq('id', preselectedAssignmentId)
            .eq('organization_id', organizationId)
            .eq('content_category', contentCategory)
            .maybeSingle();

          if (!directError && directAssignment) {
            matchingAssignment = {
              ...directAssignment,
              id: directAssignment.id,
              originalId: directAssignment.id,
              assignment_name: directAssignment.assignment_name,
              due_date: directAssignment.due_date || 'TBD',
              isVirtualInstance: false,
              instanceDate: directAssignment.due_date ? parseISO(directAssignment.due_date) : undefined
            };
            // Add to assignments list so it's visible
            combinedAssignments.unshift(matchingAssignment);
            setAssignments(combinedAssignments);
          } else if (!directError) {
            // Not found for this category — see if it exists in another category
            // and notify the caller so it can redirect to the right submit flow.
            const { data: anyCategory } = await supabase
              .from('post_assignments')
              .select('content_category, organization_id')
              .eq('id', preselectedAssignmentId)
              .maybeSingle();

            if (
              anyCategory?.content_category &&
              anyCategory.content_category !== contentCategory &&
              ['website', 'email_blast', 'email_sponsorship'].includes(anyCategory.content_category)
            ) {
              console.warn(
                `[useAssignmentSelection] Deep-link assignment ${preselectedAssignmentId} is "${anyCategory.content_category}", expected "${contentCategory}". Notifying caller.`
              );
              onCategoryMismatchRef.current?.(
                anyCategory.content_category as 'website' | 'email_blast' | 'email_sponsorship',
                preselectedAssignmentId
              );
            } else {
              console.warn(
                `[useAssignmentSelection] Ignoring deep-link to assignment ${preselectedAssignmentId}: not found for category "${contentCategory}".`
              );
            }
          }
        }
        
        if (matchingAssignment) {
          setSelectedAssignments([matchingAssignment.id]);
          setPreselectedAssignment(matchingAssignment);
          if (matchingAssignment.site) {
            setSiteName(matchingAssignment.site.name);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching client assignments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, preselectedAssignmentId, upcomingLimit, overdueDaysLimit, contentCategory]);

  const fetchAdminAssignments = useCallback(async () => {
    if (!organizationId || !siteId) {
      setAssignments([]);
      return;
    }

    setIsLoading(true);
    try {
      // Get all users in this organization
      const { data: orgUsers } = await supabase
        .from('user_organizations')
        .select('user_id')
        .eq('organization_id', organizationId);

      if (!orgUsers?.length) {
        setAssignments([]);
        setIsLoading(false);
        return;
      }

      const userIds = orgUsers.map(u => u.user_id);

      // Build filter to include both assigned users in org AND unassigned assignments
      const assignedFilter = userIds.length > 0 
        ? `assigned_to.in.(${userIds.join(',')}),assigned_to.is.null`
        : 'assigned_to.is.null';

      const { data, error } = await supabase
        .from('post_assignments')
        .select(`
          id,
          assignment_name,
          due_date,
          post_type,
          site_id,
          assigned_to,
          is_completed,
          is_skipped,
          recurrence_type,
          recurrence_day_of_week,
          recurrence_end_date,
          organization_id,
          notes,
          sites(name, url),
          profiles!post_assignments_assigned_to_fkey(full_name, email)
        `)
        .eq('site_id', siteId)
        .eq('organization_id', organizationId)
        .eq('content_category', contentCategory)
        .or(assignedFilter)
        .order('due_date', { ascending: true });

      if (!error && data) {
        // Fetch assignment instances to know which recurring dates are completed
        let instancesData: AssignmentInstance[] = [];
        if (data.length > 0) {
          const assignmentIds = data.map(a => a.id);
          const { data: instData, error: instancesError } = await supabase
            .from('assignment_instances')
            .select('*')
            .in('assignment_id', assignmentIds);
          
          if (instancesError) {
            console.error('Error fetching instances:', instancesError);
          } else {
            instancesData = instData || [];
            setInstances(instancesData);
          }
        }

        const today = startOfDay(new Date());
        const lookbackDate = addDays(today, -7);
        const threeMonthsOut = addMonths(today, 3);

        const expandedAssignments: Assignment[] = [];

        data.forEach(assignment => {
          // Filter instances for this specific assignment
          const assignmentInstances = instancesData.filter(
            inst => inst.assignment_id === assignment.id
          );

          const events = generateRecurringEvents(
            assignment,
            lookbackDate,
            threeMonthsOut,
            assignmentInstances
          );

          const futureEvents = events
            .filter(evt => !evt.resource.is_completed && !evt.resource.is_skipped && evt.instanceDate >= lookbackDate)
            .slice(0, perAssignmentLimit);

          futureEvents.forEach(evt => {
            expandedAssignments.push({
              ...assignment,
              id: evt.id,
              originalId: evt.originalId,
              due_date: format(evt.instanceDate, 'yyyy-MM-dd'),
              instanceDate: evt.instanceDate,
              isVirtualInstance: evt.isVirtualInstance,
              site: assignment.sites as any,
              profiles: assignment.profiles as any,
            });
          });
        });

        expandedAssignments.sort((a, b) =>
          new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        );

        setAssignments(expandedAssignments);
      }
    } catch (error) {
      console.error('Error fetching admin assignments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, siteId, perAssignmentLimit, contentCategory]);

  useEffect(() => {
    if (mode === 'client') {
      fetchClientAssignments();
    } else {
      fetchAdminAssignments();
    }
  }, [mode, fetchClientAssignments, fetchAdminAssignments]);

  const toggleAssignment = useCallback((assignmentId: string) => {
    if (mode === 'admin') {
      // Admin mode: single selection (radio behavior)
      setSelectedAssignments(prev =>
        prev.includes(assignmentId) ? [] : [assignmentId]
      );
    } else {
      // Client mode: multi-selection (checkbox behavior)
      setSelectedAssignments(prev => {
        if (prev.includes(assignmentId)) {
          return prev.filter(id => id !== assignmentId);
        } else {
          return [...prev, assignmentId];
        }
      });
    }
  }, [mode]);

  const clearSelection = useCallback(() => {
    setSelectedAssignments([]);
  }, []);

  const clearPreselection = useCallback(() => {
    setPreselectedAssignment(null);
    setSelectedAssignments([]);
  }, []);

  const markAssignmentStarted = useCallback(async (assignmentId: string, instanceDate?: Date) => {
    try {
      if (instanceDate) {
        await supabase.from('assignment_instances').upsert({
          assignment_id: assignmentId,
          instance_date: format(instanceDate, 'yyyy-MM-dd'),
          started_at: new Date().toISOString()
        }, { onConflict: 'assignment_id,instance_date' });
      } else {
        await supabase
          .from('post_assignments')
          .update({ started_at: new Date().toISOString() })
          .eq('id', assignmentId)
          .is('started_at', null);
      }
    } catch (error) {
      console.error('Error marking assignment as started:', error);
    }
  }, []);

  const refetch = useCallback(async () => {
    if (mode === 'client') {
      await fetchClientAssignments();
    } else {
      await fetchAdminAssignments();
    }
  }, [mode, fetchClientAssignments, fetchAdminAssignments]);

  const loadMore = useCallback(() => {
    setPerAssignmentLimit(prev => Math.max(prev, 10));
  }, []);

  return {
    assignments,
    instances,
    selectedAssignments,
    isLoading,
    siteName,
    preselectedAssignment,
    toggleAssignment,
    setSelectedAssignments,
    clearSelection,
    clearPreselection,
    markAssignmentStarted,
    refetch,
    loadMore,
    isLoadMoreActive: perAssignmentLimit > perAssignmentLimitProp,
  };
}
