import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Calendar as CalendarIcon, AlertTriangle, Eye, Mail, Megaphone, FileText, Pencil, RotateCcw, Bell, BellOff, X, Check, ChevronsUpDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { format, startOfWeek, endOfWeek, addDays, subDays, getDay, previousThursday, nextMonday } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SubmittedPostPreview } from './SubmittedPostPreview';
import { recordAudit, snapshotRow } from '@/lib/audit';

type ContentCategory = 'website' | 'email_blast' | 'email_sponsorship';

const formSchema = z.object({
  assignment_name: z.string().min(1, 'Assignment name is required'),
  site_id: z.string().min(1, 'Site is required'),
  content_category: z.enum(['website', 'email_blast', 'email_sponsorship']),
  post_type: z.enum(['standard', 'column']),
  organization_id: z.string().min(1, 'Organization is required'),
  due_date: z.date().optional().nullable(),
  recurrence_type: z.enum(['one_time', 'weekly', 'biweekly', 'monthly']),
  recurrence_day_of_week: z.number().min(0).max(6).nullish(),
  recurrence_end_date: z.date().nullish(),
  notes: z.string().optional(),
  email_notifications_enabled: z.boolean().default(true),
  // Email sponsorship specific: week start date
  week_start_date: z.date().optional().nullable(),
}).refine(
  (data) => {
    // Require day of week for recurring assignments
    if (data.recurrence_type !== 'one_time') {
      return data.recurrence_day_of_week !== undefined && data.recurrence_day_of_week !== null;
    }
    return true;
  },
  {
    message: 'Day of week is required for recurring assignments',
    path: ['recurrence_day_of_week'],
  }
).refine(
  (data) => {
    // Require due_date for recurring assignments (need a start date)
    if (data.recurrence_type !== 'one_time') {
      return data.due_date !== undefined && data.due_date !== null;
    }
    return true;
  },
  {
    message: 'Start date is required for recurring assignments',
    path: ['due_date'],
  }
).refine(
  (data) => {
    // Require week_start_date for email sponsorships
    if (data.content_category === 'email_sponsorship') {
      return data.week_start_date !== undefined && data.week_start_date !== null;
    }
    return true;
  },
  {
    message: 'Week is required for email sponsorships',
    path: ['week_start_date'],
  }
);

type FormValues = z.infer<typeof formSchema>;

interface AssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editingAssignment?: any;
  defaultDate?: Date;
}

export function AssignmentDialog({ open, onOpenChange, onSuccess, editingAssignment, defaultDate }: AssignmentDialogProps) {
  const [sites, setSites] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignmentCountWarning, setAssignmentCountWarning] = useState<string | null>(null);
  const [emailBlastWarnings, setEmailBlastWarnings] = useState<string[]>([]);
  const [showPostPreview, setShowPostPreview] = useState(false);
  const [sponsorshipDuplicateError, setSponsorshipDuplicateError] = useState<string | null>(null);
  const [nameOverridden, setNameOverridden] = useState(false);
  const [organizationPopoverOpen, setOrganizationPopoverOpen] = useState(false);
  const [organizationSearch, setOrganizationSearch] = useState('');

  // Check if assignment has a submitted post to view
  const hasSubmittedPost = editingAssignment?.submitted_post_id != null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assignment_name: '',
      site_id: '',
      content_category: 'website',
      post_type: 'standard',
      organization_id: '',
      recurrence_type: 'one_time',
      notes: '',
      email_notifications_enabled: true,
    },
  });

  const recurrenceType = form.watch('recurrence_type');
  const contentCategory = form.watch('content_category');
  const watchedSiteId = form.watch('site_id');
  const watchedDueDate = form.watch('due_date');
  const watchedWeekStartDate = form.watch('week_start_date');
  const watchedOrgId = form.watch('organization_id');
  const watchedDayOfWeek = form.watch('recurrence_day_of_week');
  const normalizedOrganizationSearch = organizationSearch.toLowerCase().replace(/\s+/g, ' ').trim();
  const filteredOrganizations = normalizedOrganizationSearch
    ? organizations.filter((org: any) =>
        (org.name || '').toLowerCase().replace(/\s+/g, ' ').includes(normalizedOrganizationSearch)
      )
    : organizations;

  // Auto-generate assignment name based on content category
  useEffect(() => {
    // Don't auto-generate if editing an existing assignment or name is overridden
    if (editingAssignment) return;
    if (nameOverridden) return;
    
    const generateAssignmentName = async () => {
      if (contentCategory === 'email_blast' && watchedSiteId && watchedOrgId) {
        const org = organizations.find(o => o.id === watchedOrgId);
        const site = sites.find(s => s.id === watchedSiteId);
        if (org && site) {
          const { data: orgData } = await supabase
            .from('organizations')
            .select('client_code')
            .eq('id', watchedOrgId)
            .single();
          
          const clientCode = orgData?.client_code || '';
          const dateStr = watchedDueDate ? format(watchedDueDate, 'MMMM d, yyyy') : 'Unscheduled';
          const name = `${org.name} - ${site.name} Blast - ${dateStr}${clientCode ? ` - ${clientCode}` : ''}`;
          form.setValue('assignment_name', name);
        }
      } else if (contentCategory === 'email_sponsorship' && watchedSiteId && watchedOrgId && watchedWeekStartDate) {
        const org = organizations.find(o => o.id === watchedOrgId);
        const site = sites.find(s => s.id === watchedSiteId);
        if (org && site) {
          const weekRange = `${format(watchedWeekStartDate, 'MMM d')} - ${format(addDays(watchedWeekStartDate, 6), 'MMM d, yyyy')}`;
          const name = `${org.name} - ${site.name} Sponsorship - ${weekRange}`;
          form.setValue('assignment_name', name);
        }
      } else if (contentCategory === 'website' && watchedSiteId && watchedOrgId) {
        const org = organizations.find(o => o.id === watchedOrgId);
        const site = sites.find(s => s.id === watchedSiteId);
        if (org && site) {
          let name = `${org.name} - ${site.name} ${recurrenceType !== 'one_time' ? 'Recurring Post' : 'Post'}`;
          if (recurrenceType !== 'one_time' && watchedDayOfWeek !== undefined && watchedDayOfWeek !== null) {
            const days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
            name += ` - ${days[watchedDayOfWeek]}`;
          } else if (watchedDueDate) {
            name += ` - ${format(watchedDueDate, 'MMMM d, yyyy')}`;
          }
          form.setValue('assignment_name', name);
        }
      }
    };
    
    generateAssignmentName();
  }, [contentCategory, watchedSiteId, watchedOrgId, watchedDueDate, watchedWeekStartDate, watchedDayOfWeek, recurrenceType, organizations, sites, editingAssignment, nameOverridden, form]);

  // Check email blast scheduling policy when site or date changes
  useEffect(() => {
    const checkEmailBlastPolicy = async () => {
      if (contentCategory !== 'email_blast' || !watchedSiteId || !watchedDueDate) {
        setEmailBlastWarnings([]);
        return;
      }

      const warnings: string[] = [];
      const scheduledDate = watchedDueDate;
      const dayOfWeek = getDay(scheduledDate);

      // Rule 1: No weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        warnings.push('Warning: Email blasts should not be scheduled on weekends');
      }

      // Rule 2: Check for consecutive days and max 2 per week
      try {
        const weekStart = startOfWeek(scheduledDate, { weekStartsOn: 1 }); // Monday
        const weekEnd = endOfWeek(scheduledDate, { weekStartsOn: 1 }); // Sunday
        
        const { data: existingBlasts, error } = await supabase
          .from('post_assignments')
          .select('id, due_date')
          .eq('site_id', watchedSiteId)
          .eq('content_category', 'email_blast')
          .eq('is_skipped', false)
          .gte('due_date', format(weekStart, 'yyyy-MM-dd'))
          .lte('due_date', format(weekEnd, 'yyyy-MM-dd'));

        if (error) {
          console.error('Error checking email blast policy:', error);
          return;
        }

        // Filter out the current assignment if editing
        const otherBlasts = (existingBlasts || []).filter(
          (b: any) => !editingAssignment || b.id !== editingAssignment.id
        );

        // Rule 2: Max 2 blasts per week
        if (otherBlasts.length >= 2) {
          const siteName = sites.find(s => s.id === watchedSiteId)?.name || 'this site';
          warnings.push(`Warning: Already ${otherBlasts.length} email blasts scheduled for this week on ${siteName}`);
        }

        // Rule 3: No consecutive days
        const dateStr = format(scheduledDate, 'yyyy-MM-dd');
        const prevDayStr = format(subDays(scheduledDate, 1), 'yyyy-MM-dd');
        const nextDayStr = format(addDays(scheduledDate, 1), 'yyyy-MM-dd');
        
        const hasAdjacentBlast = otherBlasts.some((b: any) => 
          b.due_date === prevDayStr || b.due_date === nextDayStr
        );
        
        if (hasAdjacentBlast) {
          warnings.push('Warning: Email blasts should not be scheduled on consecutive days');
        }
      } catch (error) {
        console.error('Error checking email blast policy:', error);
      }

      setEmailBlastWarnings(warnings);
    };

    checkEmailBlastPolicy();
  }, [contentCategory, watchedSiteId, watchedDueDate, editingAssignment, sites]);

  // Check for duplicate email sponsorships when site or week changes
  useEffect(() => {
    const checkDuplicateSponsorship = async () => {
      if (contentCategory !== 'email_sponsorship' || !watchedSiteId || !watchedWeekStartDate) {
        setSponsorshipDuplicateError(null);
        return;
      }

      const mondayStr = format(watchedWeekStartDate, 'yyyy-MM-dd');
      
      try {
        let query = supabase
          .from('post_assignments')
          .select('id, assignment_name')
          .eq('content_category', 'email_sponsorship')
          .eq('site_id', watchedSiteId)
          .eq('due_date', mondayStr);
        
        // Exclude current assignment if editing
        if (editingAssignment?.id) {
          query = query.neq('id', editingAssignment.id);
        }
        
        const { data, error } = await query.maybeSingle();
        
        if (error) {
          console.error('Error checking duplicate sponsorship:', error);
          return;
        }
        
        if (data) {
          const siteName = sites.find(s => s.id === watchedSiteId)?.name || 'this site';
          setSponsorshipDuplicateError(
            `A sponsorship already exists for ${siteName} on the week of ${format(watchedWeekStartDate, 'MMM d')}. Only one sponsorship per site per week is allowed.`
          );
        } else {
          setSponsorshipDuplicateError(null);
        }
      } catch (error) {
        console.error('Error checking duplicate sponsorship:', error);
      }
    };

    checkDuplicateSponsorship();
  }, [contentCategory, watchedSiteId, watchedWeekStartDate, editingAssignment, sites]);

  // Check assignment limit when site or date changes
  useEffect(() => {
    const checkAssignmentLimit = async () => {
      if (!watchedSiteId || !watchedDueDate) {
        setAssignmentCountWarning(null);
        return;
      }

      const dateStr = format(watchedDueDate, 'yyyy-MM-dd');
      const dayOfWeek = watchedDueDate.getDay();

      try {
        // Fetch all assignments for this site that are not skipped
        const { data, error } = await supabase
          .from('post_assignments')
          .select('id, assignment_name, recurrence_type, recurrence_day_of_week, due_date, recurrence_end_date, is_completed')
          .eq('site_id', watchedSiteId)
          .eq('is_skipped', false);

        if (error) {
          console.error('Error checking assignment limit:', error);
          return;
        }

        const assignmentIds = (data || []).map(a => a.id);
        let instances: any[] = [];
        if (assignmentIds.length > 0) {
          const { data: instanceData, error: instanceError } = await supabase
            .from('assignment_instances')
            .select('id, assignment_id, instance_date, overridden_due_date, is_skipped, is_completed, completed_at, submitted_post_id, is_exception, exception_notes, overridden_assignment_name')
            .in('assignment_id', assignmentIds)
            .eq('instance_date', dateStr);
          if (instanceError) {
            console.error('Error fetching assignment instances:', instanceError);
          } else {
            instances = instanceData || [];
          }

          // Also fetch any instances overridden TO this date from a different instance_date
          const { data: overriddenData, error: overriddenError } = await supabase
            .from('assignment_instances')
            .select('id, assignment_id, instance_date, overridden_due_date, is_skipped, is_completed, completed_at, submitted_post_id, is_exception, exception_notes, overridden_assignment_name')
            .in('assignment_id', assignmentIds)
            .eq('overridden_due_date', dateStr);
          if (overriddenError) {
            console.error('Error fetching overridden instances:', overriddenError);
          } else if (overriddenData) {
            for (const inst of overriddenData) {
              if (!instances.find(i => i.id === inst.id)) instances.push(inst);
            }
          }
        }

        // Count actual occurrences on the selected date using shared recurrence logic
        const { generateRecurringEvents } = await import('@/lib/recurrenceUtils');
        const dayStart = new Date(watchedDueDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(watchedDueDate);
        dayEnd.setHours(23, 59, 59, 999);

        let count = 0;
        for (const assignment of data || []) {
          if (editingAssignment && assignment.id === editingAssignment.id) continue;
          const events = generateRecurringEvents(assignment, dayStart, dayEnd, instances);
          if (events.length > 0) count++;
        }

        if (count >= 3) {
          const siteName = sites.find(s => s.id === watchedSiteId)?.name || 'this site';
          setAssignmentCountWarning(`Warning: There are already ${count} assignments scheduled for ${siteName} on ${format(watchedDueDate, 'EEEE, MMMM d')}. Adding this assignment will exceed 3 per day.`);
        } else {
          setAssignmentCountWarning(null);
        }
      } catch (error) {
        console.error('Error checking assignment limit:', error);
      }

    };

    checkAssignmentLimit();
  }, [watchedSiteId, watchedDueDate, editingAssignment, sites]);

  useEffect(() => {
    if (open) {
      fetchSites();
      fetchOrganizations();
      
      try {
        if (editingAssignment) {
          
          // Parse and validate dates - append T00:00:00 to force local time interpretation
          // This prevents timezone issues where "2025-12-31" parsed as UTC shifts the date
          const dueDate = editingAssignment.due_date 
            ? new Date(editingAssignment.due_date + 'T00:00:00') 
            : undefined;
          
          const endDate = editingAssignment.recurrence_end_date 
            ? new Date(editingAssignment.recurrence_end_date + 'T00:00:00') 
            : undefined;
          
          // Validate dates are valid
          if (dueDate && isNaN(dueDate.getTime())) {
            console.error('Invalid due_date:', editingAssignment.due_date);
            throw new Error('Invalid due date format');
          }
          
          if (endDate && isNaN(endDate.getTime())) {
            console.error('Invalid recurrence_end_date:', editingAssignment.recurrence_end_date);
            throw new Error('Invalid end date format');
          }
          
          form.reset({
            assignment_name: editingAssignment.assignment_name,
            site_id: editingAssignment.site_id,
            content_category: (editingAssignment.content_category || 'website') as ContentCategory,
            post_type: editingAssignment.post_type,
            organization_id: editingAssignment.organization_id || '',
            due_date: dueDate,
            recurrence_type: editingAssignment.recurrence_type,
            recurrence_day_of_week: editingAssignment.recurrence_day_of_week,
            recurrence_end_date: endDate,
            notes: editingAssignment.notes || '',
            week_start_date: undefined,
            email_notifications_enabled: editingAssignment.email_notifications_enabled ?? true,
          });
        } else {
          form.reset({
            assignment_name: '',
            site_id: '',
            content_category: 'website',
            post_type: 'standard',
            organization_id: '',
            due_date: defaultDate || undefined,
            recurrence_type: 'one_time',
            recurrence_day_of_week: undefined,
            recurrence_end_date: undefined,
            notes: '',
            week_start_date: undefined,
            email_notifications_enabled: true,
          });
        }
      } catch (error) {
        console.error('Error initializing assignment form:', error);
        toast.error('Failed to load assignment data');
      }
    }
    setNameOverridden(false);
  }, [open, editingAssignment, defaultDate]);

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

  const fetchOrganizations = async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    
    if (!error && data) {
      setOrganizations(data);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      // For email sponsorships, use week_start_date (Monday) for calendar display
      let finalDueDate = values.due_date;
      if (values.content_category === 'email_sponsorship' && values.week_start_date) {
        // Due date is the Monday (week start) for calendar display
        finalDueDate = values.week_start_date;
      }

      const assignmentData: any = {
        assignment_name: values.assignment_name,
        site_id: values.site_id,
        content_category: values.content_category,
        post_type: 'standard', // Always 'standard' - type is derived from recurrence
        organization_id: values.organization_id || null,
        due_date: finalDueDate ? format(finalDueDate, 'yyyy-MM-dd') : null,
        recurrence_type: values.recurrence_type,
        recurrence_day_of_week: values.recurrence_day_of_week ?? null,
        recurrence_end_date: values.recurrence_end_date ? format(values.recurrence_end_date, 'yyyy-MM-dd') : null,
        notes: values.notes || null,
        email_notifications_enabled: values.email_notifications_enabled,
      };

      // Check if we should send notification (to all org members)
      const shouldNotify = values.email_notifications_enabled && values.organization_id && (
        !editingAssignment || // New assignment
        editingAssignment.recurrence_type !== values.recurrence_type || // Frequency changed
        editingAssignment.recurrence_day_of_week !== values.recurrence_day_of_week // Day changed
      );

      if (editingAssignment) {
        const before = await snapshotRow('post_assignments', editingAssignment.id, 'assignment');
        const { error } = await supabase
          .from('post_assignments')
          .update(assignmentData)
          .eq('id', editingAssignment.id);

        if (error) throw error;
        toast.success('Assignment updated successfully');

        if (assignmentData.organization_id) {
          void recordAudit({
            organizationId: assignmentData.organization_id,
            action: 'assignment.updated',
            entityType: 'assignment',
            entityId: editingAssignment.id,
            summary: `Updated assignment "${values.assignment_name}"`,
            before: before ?? {},
            after: assignmentData,
          });
        }
      } else {
        const { data: insertedAssignment, error } = await supabase
          .from('post_assignments')
          .insert(assignmentData)
          .select('id')
          .single();

        if (error) throw error;
        toast.success('Assignment created successfully');

        if (assignmentData.organization_id && insertedAssignment?.id) {
          void recordAudit({
            organizationId: assignmentData.organization_id,
            action: 'assignment.created',
            entityType: 'assignment',
            entityId: insertedAssignment.id,
            summary: `Created assignment "${values.assignment_name}"`,
            after: assignmentData,
          });
        }

        // Send email notification to org members if needed (only for new assignments)
        if (shouldNotify && insertedAssignment) {
          try {
            // Get site and organization name
            const { data: site } = await supabase
              .from('sites')
              .select('name')
              .eq('id', values.site_id)
              .single();

            const { data: org } = await supabase
              .from('organizations')
              .select('name')
              .eq('id', values.organization_id)
              .single();

            // Get all users in the organization
            const { data: orgUsers } = await supabase
              .from('user_organizations')
              .select('user_id')
              .eq('organization_id', values.organization_id);

            // Send notification to each org member
            for (const orgUser of orgUsers || []) {
              await supabase.functions.invoke('send-user-notification', {
                body: {
                  type: 'new_assignment',
                  userId: orgUser.user_id,
                  data: {
                    assignment_id: insertedAssignment.id,
                    assignment_name: values.assignment_name,
                    organization_name: org?.name || null,
                    organization_id: values.organization_id,
                    site_name: site?.name || 'Unknown Site',
                    post_type: values.post_type,
                    content_category: values.content_category,
                    due_date: values.due_date ? format(values.due_date, 'MMMM d, yyyy') : null,
                    recurrence_type: values.recurrence_type,
                    notes: values.notes,
                    base_url: 'https://client.lnn.co',
                  }
                }
              });
            }
          } catch (notifyError) {
            console.error('Failed to send notification:', notifyError);
            toast.warning('Assignment saved, but email notification failed to send. Please check your email service configuration.');
          }
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving assignment:', error);
      toast.error('Failed to save assignment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{editingAssignment ? 'Edit Assignment' : 'Create New Assignment'}</DialogTitle>
              <DialogDescription>
                {editingAssignment ? 'Update assignment details' : 'Create a new post assignment for a client'}
              </DialogDescription>
            </div>
            {hasSubmittedPost && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPostPreview(true)}
                className="flex items-center gap-2 mr-8"
              >
                <Eye className="h-4 w-4" />
                View Post
              </Button>
            )}
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="assignment_name"
              render={({ field }) => {
                const isAutoGenCategory = contentCategory === 'email_blast' || contentCategory === 'email_sponsorship' || contentCategory === 'website';
                const showAutoGenerated = isAutoGenCategory && !editingAssignment;
                
                return (
                  <FormItem>
                    <FormLabel>Assignment Name</FormLabel>
                    <FormControl>
                      {showAutoGenerated && !nameOverridden ? (
                        <div className="flex items-center gap-2">
                          <Input 
                            {...field}
                            placeholder="Auto-generated from selections below"
                            readOnly
                            className="bg-muted cursor-default"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setNameOverridden(true)}
                            title="Edit name manually"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : showAutoGenerated && nameOverridden ? (
                        <div className="flex items-center gap-2">
                          <Input placeholder="Enter custom assignment name" {...field} />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setNameOverridden(false)}
                            title="Restore auto-generated name"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Input placeholder="e.g., Weekly Tech Column" {...field} />
                      )}
                    </FormControl>
                    {showAutoGenerated && !nameOverridden && (
                      <FormDescription>
                        Auto-generated. Click the pencil to override.
                      </FormDescription>
                    )}
                    {showAutoGenerated && nameOverridden && (
                      <FormDescription>
                        Click the reset button to restore the auto-generated name.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Content Category Selection */}
            <FormField
              control={form.control}
              name="content_category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content Type</FormLabel>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={field.value === 'website' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        field.onChange('website');
                        form.setValue('post_type', 'standard');
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Website Post
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === 'email_blast' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        field.onChange('email_blast');
                        form.setValue('post_type', 'standard');
                        form.setValue('recurrence_type', 'one_time');
                      }}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      Email Blast
                    </Button>
                    <Button
                      type="button"
                      variant={field.value === 'email_sponsorship' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        field.onChange('email_sponsorship');
                        form.setValue('post_type', 'standard');
                        form.setValue('recurrence_type', 'one_time');
                      }}
                    >
                      <Megaphone className="mr-2 h-4 w-4" />
                      Email Sponsorship
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="site_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a site" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sites.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Post Type removed - now derived from recurrence type */}
            </div>

            <FormField
              control={form.control}
              name="organization_id"
              render={({ field }) => {
                const selectedOrg = organizations.find((o: any) => o.id === field.value);
                return (
                  <FormItem className="flex flex-col">
                    <FormLabel>Assign to Organization</FormLabel>
                    <Popover
                      open={organizationPopoverOpen}
                      onOpenChange={(nextOpen) => {
                        setOrganizationPopoverOpen(nextOpen);
                        if (!nextOpen) setOrganizationSearch('');
                      }}
                    >
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            className={cn(
                              'w-full justify-between font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {selectedOrg ? selectedOrg.name : 'Select an organization'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search organizations..."
                            value={organizationSearch}
                            onValueChange={setOrganizationSearch}
                          />
                          <CommandList
                            className="max-h-[min(18rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain"
                            onWheelCapture={(event) => event.stopPropagation()}
                          >
                            {filteredOrganizations.length === 0 && (
                              <CommandEmpty>No organizations found.</CommandEmpty>
                            )}
                            <CommandGroup>
                              {filteredOrganizations.map((org: any) => (
                                <CommandItem
                                  key={org.id}
                                  value={org.id}
                                  onSelect={() => {
                                    field.onChange(org.id);
                                    setOrganizationPopoverOpen(false);
                                    setOrganizationSearch('');
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      field.value === org.id ? 'opacity-100' : 'opacity-0'
                                    )}
                                  />
                                  {org.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Publication Date and Recurrence - Hide for email sponsorship, hide recurrence for email blast */}
            {contentCategory !== 'email_sponsorship' && (
              <div className={cn("grid gap-4", contentCategory === 'email_blast' ? "grid-cols-1" : "grid-cols-2")}>
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>
                        Publication Date {recurrenceType === 'one_time' ? '(optional)' : ''}
                      </FormLabel>
                      <div className="flex gap-1">
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'pl-3 text-left font-normal flex-1',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const day = date.getDay();
                              return day === 0 || day === 6; // Disable weekends
                            }}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                        </Popover>
                        {field.value && recurrenceType === 'one_time' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0 relative z-10 pointer-events-auto"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              field.onChange(undefined);
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            title="Clear date"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Recurrence - Hide for email blast and email sponsorship */}
                {contentCategory === 'website' && (
                  <FormField
                    control={form.control}
                    name="recurrence_type"
                    render={({ field }) => {
                      // Disable changing recurrence type for existing one-time assignments
                      const isEditingOneTime = editingAssignment && editingAssignment.recurrence_type === 'one_time';
                      
                      return (
                        <FormItem className="flex flex-col">
                          <FormLabel>Recurrence</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            value={field.value}
                            disabled={isEditingOneTime}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="one_time">One-time</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="biweekly">Biweekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                          {isEditingOneTime && (
                            <FormDescription className="text-muted-foreground">
                              Recurrence can only be set when creating an assignment
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                )}
              </div>
            )}

            {assignmentCountWarning && contentCategory === 'website' && (
              <Alert variant="destructive" className="bg-yellow-50 border-yellow-200 text-yellow-800">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{assignmentCountWarning}</AlertDescription>
              </Alert>
            )}

            {/* Email Blast Scheduling Warnings */}
            {emailBlastWarnings.length > 0 && (
              <div className="space-y-2">
                {emailBlastWarnings.map((warning, idx) => (
                  <Alert key={idx} variant="destructive" className="bg-amber-50 border-amber-200 text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Email Sponsorship Week Selector */}
            {contentCategory === 'email_sponsorship' && (
              <>
                <FormField
                  control={form.control}
                  name="week_start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Campaign Week</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value 
                                ? `${format(field.value, 'MMM d')} - ${format(addDays(field.value, 6), 'MMM d, yyyy')}`
                                : <span>Select campaign week (Monday - Sunday)</span>
                              }
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={(date) => {
                              // Snap to Monday of selected week
                              if (date) {
                                const monday = nextMonday(subDays(date, 7));
                                field.onChange(monday);
                              }
                            }}
                            disabled={(date) => {
                              const day = date.getDay();
                              return day !== 1; // Only allow Mondays
                            }}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      {field.value && (
                        <FormDescription className="text-amber-600">
                          Submission deadline: {format(previousThursday(field.value), 'EEEE, MMMM d')} at 5:00 PM
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {sponsorshipDuplicateError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{sponsorshipDuplicateError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {/* Recurrence options - only for website posts */}
            {contentCategory === 'website' && recurrenceType !== 'one_time' && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="recurrence_day_of_week"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day of Week *</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))} 
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select day (required)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">Monday</SelectItem>
                          <SelectItem value="2">Tuesday</SelectItem>
                          <SelectItem value="3">Wednesday</SelectItem>
                          <SelectItem value="4">Thursday</SelectItem>
                          <SelectItem value="5">Friday</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        The day of the week this assignment recurs on
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="recurrence_end_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>End Date (Optional)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {field.value ? format(field.value, 'PPP') : <span>No end date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const day = date.getDay();
                              return day === 0 || day === 6; // Disable weekends
                            }}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        When to stop recurring (leave empty for indefinite)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Add any additional instructions or notes for the client..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between pt-4">
              <FormField
                control={form.control}
                name="email_notifications_enabled"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    {field.value ? <Bell className="h-4 w-4 text-muted-foreground" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                    <label htmlFor="email_notifications_enabled" className="text-sm text-muted-foreground cursor-pointer">
                      Email notifications
                    </label>
                    <Switch
                      id="email_notifications_enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                )}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button type="submit" disabled={loading || !!sponsorshipDuplicateError}>
                  {loading ? 'Saving...' : editingAssignment ? 'Update Assignment' : 'Create Assignment'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {hasSubmittedPost && (
      <SubmittedPostPreview
        open={showPostPreview}
        onOpenChange={setShowPostPreview}
        postId={editingAssignment.submitted_post_id}
      />
    )}
    </>
  );
}
