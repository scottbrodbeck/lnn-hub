import { addDays, addWeeks, addMonths, isAfter, isBefore, startOfDay, format, differenceInDays } from 'date-fns';

/**
 * Parse a date-only string (YYYY-MM-DD) as local midnight.
 * Unlike parseISO, which treats date-only strings as UTC midnight,
 * this creates a Date at midnight in the user's local timezone.
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export interface AssignmentInstance {
  id: string;
  assignment_id: string;
  instance_date: string;
  is_completed: boolean;
  completed_at?: string;
  submitted_post_id?: string;
  is_exception: boolean;
  exception_notes?: string;
  overridden_assignment_name?: string;
  overridden_due_date?: string;
  is_skipped: boolean;
  started_at?: string;
}

export interface GeneratedEvent {
  id: string;           // e.g., "assignment-id_2024-01-19"
  originalId: string;   // The actual assignment ID
  title: string;
  start: Date;
  end: Date;
  resource: any;
  isVirtualInstance: boolean;  // True for generated instances
  instanceDate: Date;          // The specific date this instance represents
  instanceRecord?: AssignmentInstance;  // The instance record if it exists
}

export interface LimitedViewOptions {
  overdueDaysLimit?: number;  // Default: 2
  upcomingLimit?: number;     // Default: 4
  includeOverdue?: boolean;   // Default: true
}

/**
 * Returns a limited view of assignments for recurring posts:
 * - Overdue items ≤ overdueDaysLimit days old (not completed)
 * - Up to upcomingLimit soonest upcoming items (not completed)
 */
export function getLimitedAssignmentView(
  assignments: any[],
  instances: AssignmentInstance[],
  options: LimitedViewOptions = {}
): GeneratedEvent[] {
  const { overdueDaysLimit = 2, upcomingLimit = 4, includeOverdue = true } = options;
  
  const today = startOfDay(new Date());
  const viewStart = addDays(today, -30); // Look back 30 days for overdue
  const viewEnd = addMonths(today, 12);   // Look ahead 12 months
  
  // Generate all events (this flattens recurring assignments)
  const allEvents = generateAllCalendarEvents(assignments, viewStart, viewEnd, instances);
  
  // Filter out completed events
  const incompleteEvents = allEvents.filter(event => !event.resource.is_completed);
  
  // Separate overdue and upcoming
  const overdueEvents: GeneratedEvent[] = [];
  const upcomingEvents: GeneratedEvent[] = [];
  
  incompleteEvents.forEach(event => {
    const eventDate = startOfDay(event.instanceDate);
    const daysOverdue = differenceInDays(today, eventDate);
    
    if (daysOverdue > 0) {
      // Overdue - only include if within overdueDaysLimit
      if (includeOverdue && daysOverdue <= overdueDaysLimit) {
        overdueEvents.push(event);
      }
    } else {
      // Upcoming (includes today)
      upcomingEvents.push(event);
    }
  });
  
  // Sort overdue by date descending (most recent overdue first)
  overdueEvents.sort((a, b) => b.instanceDate.getTime() - a.instanceDate.getTime());
  
  // Sort upcoming by date ascending (soonest first)
  upcomingEvents.sort((a, b) => a.instanceDate.getTime() - b.instanceDate.getTime());
  
  // Limit upcoming to upcomingLimit
  const limitedUpcoming = upcomingEvents.slice(0, upcomingLimit);
  
  // Combine: overdue first, then upcoming
  return [...overdueEvents, ...limitedUpcoming];
}

/**
 * Generates calendar events for recurring assignments
 * @param assignment - The assignment object from the database
 * @param viewStartDate - Start of the date range to generate events for
 * @param viewEndDate - End of the date range to generate events for
 * @param instances - Optional array of instance records for this assignment
 * @returns Array of calendar events including original and virtual instances
 */
export function generateRecurringEvents(
  assignment: any,
  viewStartDate: Date,
  viewEndDate: Date,
  instances?: AssignmentInstance[]
): GeneratedEvent[] {
  const events: GeneratedEvent[] = [];
  
  // Skip assignments without due dates - they shouldn't appear on calendars
  if (!assignment.due_date) {
    return events;
  }
  
  const dueDate = startOfDay(parseLocalDate(assignment.due_date));
  const endDate = assignment.recurrence_end_date 
    ? startOfDay(parseLocalDate(assignment.recurrence_end_date))
    : viewEndDate;

  // For one-time assignments, just return the single event if within date range
  if (assignment.recurrence_type === 'one_time') {
    // Only include if the due date falls within the view range
    if (!isBefore(dueDate, viewStartDate) && !isAfter(dueDate, viewEndDate)) {
      events.push({
        id: assignment.id,
        originalId: assignment.id,
        title: assignment.assignment_name,
        start: dueDate,
        end: dueDate,
        resource: assignment,
        isVirtualInstance: false,
        instanceDate: dueDate,
      });
    }
    return events;
  }

  // For recurring assignments, generate instances
  const dayOfWeek = assignment.recurrence_day_of_week;
  
  if (dayOfWeek === null || dayOfWeek === undefined) {
    // If day of week is not set, just show the original due date
    events.push({
      id: assignment.id,
      originalId: assignment.id,
      title: assignment.assignment_name,
      start: dueDate,
      end: dueDate,
      resource: assignment,
      isVirtualInstance: false,
      instanceDate: dueDate,
    });
    return events;
  }

  // Find the first occurrence on or after the due date that matches the day of week
  let currentDate = new Date(dueDate);
  
  // Adjust to the correct day of week if needed
  while (currentDate.getDay() !== dayOfWeek) {
    currentDate = addDays(currentDate, 1);
  }

  // Fast-forward: if currentDate is well before the view window, skip ahead
  // to avoid exhausting the 52-instance cap before reaching visible dates
  if (isBefore(currentDate, viewStartDate)) {
    const daysBetween = differenceInDays(viewStartDate, currentDate);
    let periodDays: number;
    switch (assignment.recurrence_type) {
      case 'weekly': periodDays = 7; break;
      case 'biweekly': periodDays = 14; break;
      case 'monthly': periodDays = 30; break;
      default: periodDays = 7;
    }
    const periodsToSkip = Math.max(0, Math.floor(daysBetween / periodDays) - 1);
    if (periodsToSkip > 0) {
      if (assignment.recurrence_type === 'monthly') {
        currentDate = addMonths(currentDate, periodsToSkip);
        while (currentDate.getDay() !== dayOfWeek) {
          currentDate = addDays(currentDate, 1);
        }
      } else {
        currentDate = addWeeks(currentDate, periodsToSkip * (assignment.recurrence_type === 'biweekly' ? 2 : 1));
      }
    }
  }

  // Generate events based on recurrence type
  let instanceCount = 0;
  const maxInstances = 52; // Max 52 weeks (1 year) of recurring events
  
  while (
    isBefore(currentDate, endDate) && 
    isBefore(currentDate, viewEndDate) && 
    instanceCount < maxInstances
  ) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    
    // Find instance record for this date
    const instanceRecord = instances?.find(
      inst => inst.assignment_id === assignment.id && 
              inst.instance_date === dateStr
    );

    // Skip if instance is marked as skipped
    if (instanceRecord?.is_skipped) {
      // Move to next occurrence without adding to events
      switch (assignment.recurrence_type) {
        case 'weekly':
          currentDate = addWeeks(currentDate, 1);
          break;
        case 'biweekly':
          currentDate = addWeeks(currentDate, 2);
          break;
        case 'monthly':
          currentDate = addMonths(currentDate, 1);
          while (currentDate.getDay() !== dayOfWeek) {
            currentDate = addDays(currentDate, 1);
          }
          break;
      }
      instanceCount++;
      continue;
    }
    
    // Determine the effective display date (respects overridden_due_date)
      const effectiveDate = instanceRecord?.overridden_due_date
        ? startOfDay(parseLocalDate(instanceRecord.overridden_due_date))
        : new Date(currentDate);

      // Only add if the effective date is within view range
      if (!isBefore(effectiveDate, viewStartDate) && !isAfter(effectiveDate, viewEndDate)) {
        const isOriginal = currentDate.getTime() === dueDate.getTime();
        
        // Determine the display name - use override if exists
        const displayName = instanceRecord?.overridden_assignment_name || assignment.assignment_name;
        
        // Determine completion status
        const isCompleted = instanceRecord?.is_completed || 
                           (isOriginal && assignment.is_completed);
        
        events.push({
          id: `${assignment.id}_${dateStr}`,
          originalId: assignment.id,
          title: displayName,
          start: effectiveDate,
          end: effectiveDate,
          resource: {
            ...assignment,
            is_completed: isCompleted,
            completed_at: instanceRecord?.completed_at,
            submitted_post_id: instanceRecord?.submitted_post_id,
            due_date: instanceRecord?.overridden_due_date || dateStr,
            is_exception: instanceRecord?.is_exception || false,
            exception_notes: instanceRecord?.exception_notes,
          },
          isVirtualInstance: !isOriginal,
          instanceDate: effectiveDate,
          instanceRecord,
        });
      }

    // Move to next occurrence
    switch (assignment.recurrence_type) {
      case 'weekly':
        currentDate = addWeeks(currentDate, 1);
        break;
      case 'biweekly':
        currentDate = addWeeks(currentDate, 2);
        break;
      case 'monthly':
        // Move to next month, same day of week pattern
        currentDate = addMonths(currentDate, 1);
        // Adjust to correct day of week in the new month
        while (currentDate.getDay() !== dayOfWeek) {
          currentDate = addDays(currentDate, 1);
        }
        break;
    }
    
    instanceCount++;
  }

  return events;
}

/**
 * Generates all calendar events from a list of assignments
 * @param assignments - Array of assignment objects
 * @param viewStartDate - Start of the date range
 * @param viewEndDate - End of the date range
 * @param instances - Optional array of all instance records
 * @returns Array of all calendar events
 */
export function generateAllCalendarEvents(
  assignments: any[],
  viewStartDate: Date,
  viewEndDate: Date,
  instances?: AssignmentInstance[]
): GeneratedEvent[] {
  const allEvents: GeneratedEvent[] = [];
  
  assignments.forEach((assignment) => {
    // Filter instances for this assignment
    const assignmentInstances = instances?.filter(
      inst => inst.assignment_id === assignment.id
    );
    const events = generateRecurringEvents(
      assignment, 
      viewStartDate, 
      viewEndDate, 
      assignmentInstances
    );
    allEvents.push(...events);
  });
  
  return allEvents;
}
