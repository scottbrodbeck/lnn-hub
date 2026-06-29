import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared utilities for handling assignment composite IDs and instance tracking.
 * 
 * Composite ID format: "uuid_YYYY-MM-DD" for recurring assignment instances
 * Regular ID format: "uuid" for one-time assignments
 */

/**
 * Extracts original UUIDs from composite IDs.
 * Example: "abc123_2025-12-26" → "abc123"
 */
export const extractUuidsFromAssignmentIds = (ids: string[]): string[] => {
  return ids.map(id => {
    // Check if this is a composite ID (uuid_date format)
    const parts = id.split('_');
    if (parts.length >= 2) {
      const potentialDate = parts[parts.length - 1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(potentialDate)) {
        return parts.slice(0, -1).join('_');
      }
    }
    return id;
  });
};

/**
 * Extracts instance dates from composite IDs.
 * Returns a map of assignmentId → instanceDate for recurring assignments.
 * Example: ["abc123_2025-12-26"] → { "abc123": "2025-12-26" }
 */
export const extractInstanceDatesFromAssignmentIds = (ids: string[]): Record<string, string> => {
  const instanceDates: Record<string, string> = {};
  for (const id of ids) {
    const parts = id.split('_');
    if (parts.length >= 2) {
      const potentialDate = parts[parts.length - 1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(potentialDate)) {
        const assignmentId = parts.slice(0, -1).join('_');
        instanceDates[assignmentId] = potentialDate;
      }
    }
  }
  return instanceDates;
};

/**
 * Reconstructs composite IDs from UUIDs and instance dates.
 * Example: (["abc123"], { "abc123": "2025-12-26" }) → ["abc123_2025-12-26"]
 */
export const reconstructCompositeIds = (uuids: string[], instanceDates: Record<string, string>): string[] => {
  return uuids.map(uuid => {
    if (instanceDates[uuid]) {
      return `${uuid}_${instanceDates[uuid]}`;
    }
    return uuid;
  });
};

/**
 * Checks if a composite ID represents a recurring instance (has a date suffix).
 */
export const isRecurringInstance = (id: string): boolean => {
  const parts = id.split('_');
  if (parts.length >= 2) {
    const potentialDate = parts[parts.length - 1];
    return /^\d{4}-\d{2}-\d{2}$/.test(potentialDate);
  }
  return false;
};

/**
 * Parses a composite ID into its components.
 * Returns { assignmentId, instanceDate } where instanceDate is null for one-time assignments.
 */
export const parseCompositeId = (id: string): { assignmentId: string; instanceDate: string | null } => {
  const parts = id.split('_');
  if (parts.length >= 2) {
    const potentialDate = parts[parts.length - 1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(potentialDate)) {
      return {
        assignmentId: parts.slice(0, -1).join('_'),
        instanceDate: potentialDate
      };
    }
  }
  return { assignmentId: id, instanceDate: null };
};

/**
 * Creates or updates an assignment instance record for a recurring assignment.
 * This should be called when submitting a post for a recurring assignment.
 */
export const upsertAssignmentInstance = async (
  supabase: SupabaseClient,
  assignmentId: string,
  instanceDate: string,
  postId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Check if instance already exists
    const { data: existingInstance } = await supabase
      .from('assignment_instances')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('instance_date', instanceDate)
      .maybeSingle();

    if (existingInstance) {
      // Update existing instance
      const { error } = await supabase
        .from('assignment_instances')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
          submitted_post_id: postId,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingInstance.id);

      if (error) throw error;
    } else {
      // Create new instance
      const { error } = await supabase
        .from('assignment_instances')
        .insert({
          assignment_id: assignmentId,
          instance_date: instanceDate,
          is_completed: true,
          completed_at: new Date().toISOString(),
          submitted_post_id: postId
        });

      if (error) throw error;
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error upserting assignment instance:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Marks a one-time assignment as completed.
 */
export const completeOneTimeAssignment = async (
  supabase: SupabaseClient,
  assignmentId: string,
  postId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('post_assignments')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        submitted_post_id: postId
      })
      .eq('id', assignmentId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error completing one-time assignment:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Handles assignment completion for both one-time and recurring assignments.
 * This is the main entry point for marking assignments as completed after post submission.
 */
export const handleAssignmentCompletion = async (
  supabase: SupabaseClient,
  compositeId: string,
  postId: string
): Promise<{ success: boolean; error?: string }> => {
  const { assignmentId, instanceDate } = parseCompositeId(compositeId);

  // Get assignment to check recurrence type
  const { data: assignment, error: fetchError } = await supabase
    .from('post_assignments')
    .select('recurrence_type')
    .eq('id', assignmentId)
    .single();

  if (fetchError) {
    console.error('Error fetching assignment:', fetchError);
    return { success: false, error: fetchError.message };
  }

  if (assignment?.recurrence_type === 'one_time') {
    // Mark parent record as completed
    return completeOneTimeAssignment(supabase, assignmentId, postId);
  } else if (instanceDate) {
    // Upsert instance record for recurring assignment
    return upsertAssignmentInstance(supabase, assignmentId, instanceDate, postId);
  } else {
    // Recurring assignment but no instance date - try to use the assignment's due_date as fallback
    console.warn('Recurring assignment selected without instance date, using due_date fallback:', compositeId);
    
    // Fetch the assignment's due_date as fallback
    const { data: assignmentData, error: dateError } = await supabase
      .from('post_assignments')
      .select('due_date')
      .eq('id', assignmentId)
      .single();
    
    if (dateError || !assignmentData?.due_date) {
      console.error('Could not fetch due_date for fallback:', dateError);
      return { success: false, error: 'Missing instance date for recurring assignment' };
    }
    
    // Use the assignment's due_date as the instance date
    return upsertAssignmentInstance(supabase, assignmentId, assignmentData.due_date, postId);
  }
};

/**
 * Completes multiple assignments for a post.
 * Iterates through all selected assignments and handles each one appropriately.
 */
export const completeAssignmentsForPost = async (
  supabase: SupabaseClient,
  compositeIds: string[],
  postId: string
): Promise<{ success: boolean; errors: string[] }> => {
  const errors: string[] = [];

  for (const compositeId of compositeIds) {
    const result = await handleAssignmentCompletion(supabase, compositeId, postId);
    if (!result.success && result.error) {
      errors.push(`Assignment ${compositeId}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    errors
  };
};
