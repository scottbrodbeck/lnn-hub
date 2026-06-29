import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLimitedAssignmentView, AssignmentInstance } from '@/lib/recurrenceUtils';
import { startOfDay, differenceInDays } from 'date-fns';

/**
 * Hook to calculate the My Posts badge count using the same instance-aware logic
 * as the ClientPosts page. This ensures the badge matches exactly what's displayed
 * in the Upcoming + Overdue tabs.
 */
export function useMyPostsBadgeCount(organizationId: string | null) {
  return useQuery({
    queryKey: ['my-posts-badge-count', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;

      // Fetch website assignments (same filter as ClientPosts)
      const { data: assignments, error } = await supabase
        .from('post_assignments')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('content_category', 'website')
        .order('due_date', { ascending: true });

      if (error) throw error;
      if (!assignments || assignments.length === 0) return 0;

      // Fetch assignment instances
      const assignmentIds = assignments.map(a => a.id);
      const { data: instances, error: instancesError } = await supabase
        .from('assignment_instances')
        .select('*')
        .in('assignment_id', assignmentIds);

      if (instancesError) throw instancesError;
      const instancesData: AssignmentInstance[] = instances || [];

      // Get upcoming count (using same limit as ClientPosts display)
      const upcomingEvents = getLimitedAssignmentView(assignments, instancesData, {
        upcomingLimit: 4,
        overdueDaysLimit: 0,
        includeOverdue: false,
      });

      // Get overdue events
      const overdueEvents = getLimitedAssignmentView(assignments, instancesData, {
        upcomingLimit: 0,
        overdueDaysLimit: 30,
        includeOverdue: true,
      });

      // Filter overdue to only actual overdue (not skipped, not completed)
      const today = startOfDay(new Date());
      const overdueCount = overdueEvents.filter(event => {
        const eventDate = startOfDay(event.instanceDate);
        const daysOverdue = differenceInDays(today, eventDate);
        
        // Must be overdue (past date)
        if (daysOverdue <= 0) return false;
        
        // Check if skipped or completed
        const isSkipped = event.instanceRecord?.is_skipped || event.resource.is_skipped;
        const isCompleted = event.instanceRecord?.is_completed || event.resource.is_completed;
        
        return !isSkipped && !isCompleted;
      }).length;

      return upcomingEvents.length + overdueCount;
    },
    enabled: !!organizationId,
    staleTime: 30000, // Cache for 30 seconds
  });
}
