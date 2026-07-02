import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Calculate the date 3 days from now for posts/blasts reminders
    const now = new Date();
    const reminderDate = new Date(now);
    reminderDate.setDate(reminderDate.getDate() + 3);
    const reminderDateStr = reminderDate.toISOString().split('T')[0]; // Format: yyyy-MM-dd
    
    // Tomorrow's date is still needed for sponsorship Thursday logic
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().split('T')[0];
    const dayOfWeekTomorrow = tomorrowDate.getDay(); // 0=Sunday, 4=Thursday
    
    console.log('Checking for posts/blasts assignments due on:', reminderDateStr);
    console.log('Day of week tomorrow:', dayOfWeekTomorrow);

    const notificationsSent: string[] = [];
    const BASE_URL = 'https://client.lnn.co';

    // Deduplication guard: if this cron already ran today (a cron double-fire, a
    // manual re-trigger, or a retry after a partial failure), don't re-send reminders
    // that already went out. send-user-notification logs every successful send to
    // email_notification_logs with notification_type='due_tomorrow_reminder' and the
    // assignment id in notification_data — mirror the sibling crons and key off that.
    const todayUtc = now.toISOString().split('T')[0];
    const { data: sentTodayLogs } = await supabase
      .from('email_notification_logs')
      .select('user_id, notification_data')
      .eq('notification_type', 'due_tomorrow_reminder')
      .eq('status', 'sent')
      .gte('sent_at', todayUtc + 'T00:00:00Z');
    const alreadyNotified = new Set(
      (sentTodayLogs || []).map(
        (l: any) => `${l.user_id}::${l.notification_data?.assignment_id ?? ''}`,
      ),
    );
    const notifyKey = (uid: string, aid: string) => `${uid}::${aid}`;

    // Find all one-time assignments due tomorrow that haven't been submitted
    // EXCLUDE email sponsorships (handled separately with Thursday deadline logic)
    const { data: oneTimeAssignments, error: oneTimeError } = await supabase
      .from('post_assignments')
      .select(`
        id,
        assignment_name,
        assigned_to,
        due_date,
        is_completed,
        site_id,
        organization_id,
        content_category,
        sites(name)
      `)
      .eq('recurrence_type', 'one_time')
      .eq('due_date', reminderDateStr)
      .eq('is_completed', false)
      .eq('email_notifications_enabled', true)
      .neq('content_category', 'email_sponsorship')
      .not('assigned_to', 'is', null);

    if (oneTimeError) throw oneTimeError;

    // Find all recurring assignment instances due tomorrow that haven't been completed
    // EXCLUDE email sponsorships (handled separately)
    const { data: instances, error: instancesError } = await supabase
      .from('assignment_instances')
      .select(`
        id,
        assignment_id,
        instance_date,
        is_completed,
        is_skipped,
        post_assignments(
          assignment_name,
          assigned_to,
          site_id,
          organization_id,
          content_category,
          sites(name)
        )
      `)
      .eq('instance_date', reminderDateStr)
      .eq('is_completed', false)
      .eq('is_skipped', false);

    if (instancesError) throw instancesError;

    // Filter out sponsorship instances
    const filteredInstances = (instances || []).filter((instance: any) => {
      const assignment = Array.isArray(instance.post_assignments) 
        ? instance.post_assignments[0] 
        : instance.post_assignments;
      return assignment?.content_category !== 'email_sponsorship' && assignment?.email_notifications_enabled !== false;
    });

    // === SPECIAL HANDLING FOR EMAIL SPONSORSHIPS ===
    // Sponsorships have their due_date set to Monday (for calendar display)
    // but the actual deadline is Thursday before that week
    // So we check: if tomorrow is Thursday, find sponsorships starting the following Monday
    let sponsorshipAssignments: any[] = [];
    
    if (dayOfWeekTomorrow === 4) { // Tomorrow is Thursday
      console.log('Tomorrow is Thursday - checking for email sponsorships due');
      
      // Calculate the Monday that follows tomorrow (Thursday + 4 days = Monday)
      const nextMonday = new Date(tomorrowDate);
      nextMonday.setDate(nextMonday.getDate() + 4);
      const nextMondayStr = nextMonday.toISOString().split('T')[0];
      
      console.log('Looking for sponsorships with campaign week starting:', nextMondayStr);
      
      const { data: sponsorships, error: sponsorshipError } = await supabase
        .from('post_assignments')
        .select(`
          id,
          assignment_name,
          assigned_to,
          due_date,
          is_completed,
          site_id,
          organization_id,
          content_category,
          sites(name)
        `)
        .eq('recurrence_type', 'one_time')
        .eq('due_date', nextMondayStr)
        .eq('content_category', 'email_sponsorship')
        .eq('is_completed', false)
        .eq('email_notifications_enabled', true)
        .not('assigned_to', 'is', null);

      if (sponsorshipError) {
        console.error('Error fetching sponsorship assignments:', sponsorshipError);
      } else {
        sponsorshipAssignments = sponsorships || [];
        console.log('Found sponsorship assignments due Thursday:', sponsorshipAssignments.length);
      }
    }

    // Helper function to format date for display
    const formatDateForDisplay = (dateStr: string): string => {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    };

    // Send reminders for one-time assignments (non-sponsorship)
    if (oneTimeAssignments && oneTimeAssignments.length > 0) {
      for (const assignment of oneTimeAssignments) {
        if (assignment.assigned_to) {
          const dedupKey = notifyKey(assignment.assigned_to, assignment.id);
          if (alreadyNotified.has(dedupKey)) {
            console.log('Skipping already-sent reminder for assignment:', assignment.id);
            continue;
          }
          try {
            const sites = assignment.sites as any;
            const siteName = Array.isArray(sites) ? sites[0]?.name : sites?.name;
            const dueDate = formatDateForDisplay(assignment.due_date);
            
            const { error: notifyError } = await supabase.functions.invoke('send-user-notification', {
              body: {
                type: 'due_tomorrow_reminder',
                userId: assignment.assigned_to,
                data: {
                  assignment_id: assignment.id,
                  assignment_name: assignment.assignment_name,
                  site_name: siteName || 'Unknown Site',
                  due_date: dueDate,
                  base_url: BASE_URL,
                  organization_id: assignment.organization_id,
                  content_category: assignment.content_category,
                }
              }
            });

            if (notifyError) {
              console.error('Failed to send notification:', notifyError);
            } else {
              notificationsSent.push(assignment.id);
              alreadyNotified.add(dedupKey);
              console.log('Sent reminder for assignment:', assignment.assignment_name);
            }
          } catch (err) {
            console.error('Error sending notification:', err);
          }
        }
      }
    }

    // Send reminders for recurring instances (non-sponsorship)
    if (filteredInstances && filteredInstances.length > 0) {
      for (const instance of filteredInstances) {
        const assignmentData = instance.post_assignments as any;
        const assignment = Array.isArray(assignmentData) ? assignmentData[0] : assignmentData;
        
        if (assignment?.assigned_to) {
          const dedupKey = notifyKey(assignment.assigned_to, instance.assignment_id);
          if (alreadyNotified.has(dedupKey)) {
            console.log('Skipping already-sent reminder for instance:', instance.id);
            continue;
          }
          try {
            const sites = assignment.sites as any;
            const siteName = Array.isArray(sites) ? sites[0]?.name : sites?.name;
            const dueDate = formatDateForDisplay(instance.instance_date);
            
            const { error: notifyError } = await supabase.functions.invoke('send-user-notification', {
              body: {
                type: 'due_tomorrow_reminder',
                userId: assignment.assigned_to,
                data: {
                  assignment_id: instance.assignment_id,
                  assignment_name: assignment.assignment_name,
                  site_name: siteName || 'Unknown Site',
                  due_date: dueDate,
                  base_url: BASE_URL,
                  organization_id: assignment.organization_id,
                  content_category: assignment.content_category,
                }
              }
            });

            if (notifyError) {
              console.error('Failed to send notification:', notifyError);
            } else {
              notificationsSent.push(instance.id);
              alreadyNotified.add(dedupKey);
              console.log('Sent reminder for instance:', assignment.assignment_name);
            }
          } catch (err) {
            console.error('Error sending notification:', err);
          }
        }
      }
    }

    // Send reminders for email sponsorships (due Thursday, displayed as Thursday deadline)
    if (sponsorshipAssignments.length > 0) {
      const thursdayDate = formatDateForDisplay(tomorrow); // Tomorrow is Thursday
      
      for (const assignment of sponsorshipAssignments) {
        if (assignment.assigned_to) {
          const dedupKey = notifyKey(assignment.assigned_to, assignment.id);
          if (alreadyNotified.has(dedupKey)) {
            console.log('Skipping already-sent sponsorship reminder for:', assignment.id);
            continue;
          }
          try {
            const sites = assignment.sites as any;
            const siteName = Array.isArray(sites) ? sites[0]?.name : sites?.name;

            const { error: notifyError } = await supabase.functions.invoke('send-user-notification', {
              body: {
                type: 'due_tomorrow_reminder',
                userId: assignment.assigned_to,
                data: {
                  assignment_id: assignment.id,
                  assignment_name: assignment.assignment_name,
                  site_name: siteName || 'Unknown Site',
                  due_date: thursdayDate, // Show Thursday as the due date
                  base_url: BASE_URL,
                  organization_id: assignment.organization_id,
                  content_category: 'email_sponsorship',
                }
              }
            });

            if (notifyError) {
              console.error('Failed to send sponsorship notification:', notifyError);
            } else {
              notificationsSent.push(assignment.id);
              alreadyNotified.add(dedupKey);
              console.log('Sent reminder for sponsorship:', assignment.assignment_name);
            }
          } catch (err) {
            console.error('Error sending sponsorship notification:', err);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      date: reminderDateStr,
      reminderLeadDays: 3,
      oneTimeCount: oneTimeAssignments?.length || 0,
      instanceCount: filteredInstances?.length || 0,
      sponsorshipCount: sponsorshipAssignments.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in check-due-reminders:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);
