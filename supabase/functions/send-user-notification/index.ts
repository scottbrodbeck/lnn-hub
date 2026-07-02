import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: 'new_assignment' | 'due_tomorrow_reminder' | 'edit_request_approved' | 'edit_request_rejected' | 'date_change_approved' | 'date_change_rejected' | 'sponsorship_approved' | 'sponsorship_rejected' | 'new_display_campaign';
  userId: string;
  data?: any;
}

// Helper function to get category-specific labels
function getCategoryLabels(contentCategory?: string) {
  switch (contentCategory) {
    case 'email_blast':
      return {
        itemName: 'Email Blast',
        heading: "You've Been Assigned a New Email Blast",
        reminderHeading: "Email Blast Due Tomorrow",
        submitButton: 'Submit Your Email Blast →',
        typeLabel: 'Blast Type',
        viewAllLabel: 'view all your email blasts',
        viewAllPath: '/client/email-blasts',
        submitPath: '/client/submit-blast',
      };
    case 'email_sponsorship':
      return {
        itemName: 'Sponsorship',
        heading: "You've Been Assigned a New Sponsorship",
        reminderHeading: "Sponsorship Due Tomorrow",
        submitButton: 'Submit Your Sponsorship →',
        typeLabel: 'Sponsorship',
        viewAllLabel: 'view all your sponsorships',
        viewAllPath: '/client/email-blasts',
        submitPath: '/client/submit-sponsorship',
      };
    default:
      return {
        itemName: 'Post',
        heading: "You've Been Assigned a New Post",
        reminderHeading: "Assignment Due Tomorrow",
        submitButton: 'Submit Your Post →',
        typeLabel: 'Post Type',
        viewAllLabel: 'view all your assignments',
        viewAllPath: '/client/posts',
        submitPath: '/client/submit',
      };
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: "content@lnn.co", name: "LNN Local Hub" },
      subject: subject,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SendGrid error: ${response.status} - ${errorText}`);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { type, userId, data }: NotificationRequest = await req.json();

    // Get user email and preferences
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Failed to fetch user profile:', profileError);
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check notification preferences
    const { data: prefs } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    // If no preferences exist, use defaults (all true)
    const preferences = prefs || {
      email_new_assignments: true,
      email_due_reminders: true,
      email_edit_approvals: true,
      exclude_from_creative_emails: false,
      exclude_from_stat_emails: false,
    };

    // Admin-controlled class-level suppression. Every notification type handled
    // by this function is a "creative" email (assignments, posts, sponsorships,
    // approvals, new ad campaigns), so we gate them all with one check.
    if (preferences.exclude_from_creative_emails) {
      console.log(`Skipping ${type} for user ${userId}: creative_excluded by admin`);
      return new Response(
        JSON.stringify({ skipped: true, reason: 'creative_excluded' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let subject = '';
    let html = '';

    // Build email based on notification type
    switch (type) {
      case 'new_assignment':
        if (!preferences.email_new_assignments) {
          console.log('User has disabled new assignment notifications');
          return new Response(JSON.stringify({ message: 'Notification disabled by user' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get category-specific labels
        const newAssignmentLabels = getCategoryLabels(data.content_category);
        
        subject = `New Assignment: ${data.assignment_name}`;
        
        // Build the submit URL with correct path based on content category
        const submitUrl = data.assignment_id && data.base_url 
          ? `${data.base_url}${newAssignmentLabels.submitPath}?assignment=${data.assignment_id}${data.organization_id ? `&org=${data.organization_id}` : ''}`
          : null;
        const viewAssignmentsUrl = data.base_url ? `${data.base_url}${newAssignmentLabels.viewAllPath}` : null;
        
        // Only show post type for website content
        const showPostType = data.content_category === 'website' || !data.content_category;
        
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">${newAssignmentLabels.heading}</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Hi ${profile.full_name || 'there'},</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">You have a new assignment waiting for you:</p>
            
            <div style="background: #f8f9fa; padding: 24px; border-radius: 8px; margin: 24px 0; border: 1px solid #e9ecef;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px;">${data.assignment_name}</h2>
              ${data.organization_name ? `<p style="margin: 8px 0; color: #4a4a4a;"><strong>Organization:</strong> ${data.organization_name}</p>` : ''}
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Site:</strong> ${data.site_name}</p>
              ${showPostType && data.post_type ? `<p style="margin: 8px 0; color: #4a4a4a;"><strong>${newAssignmentLabels.typeLabel}:</strong> ${data.post_type.charAt(0).toUpperCase() + data.post_type.slice(1)}</p>` : ''}
              
              ${data.due_date ? `
              <div style="background: #fff3cd; padding: 10px 14px; border-radius: 6px; margin: 16px 0; display: inline-block; border-left: 4px solid #ffc107;">
                <strong style="color: #856404;">Due Date:</strong> <span style="color: #856404;">${data.due_date}</span>
              </div>
              ` : `
              <div style="background: #e9ecef; padding: 10px 14px; border-radius: 6px; margin: 16px 0; display: inline-block; border-left: 4px solid #6c757d;">
                <strong style="color: #495057;">Publication Date:</strong> <span style="color: #495057;">To be determined</span>
              </div>
              `}
              
              ${data.recurrence_type !== 'one_time' ? `<p style="margin: 8px 0; color: #4a4a4a;"><strong>Recurrence:</strong> ${data.recurrence_type}</p>` : ''}
              ${data.notes ? `<p style="margin: 12px 0; color: #4a4a4a; background: #ffffff; padding: 12px; border-radius: 4px; border-left: 3px solid #6c757d;"><strong>Notes:</strong> ${data.notes}</p>` : ''}
              
              ${submitUrl ? `
              <p style="margin-top: 24px;">
                <a href="${submitUrl}" style="background: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
                  ${newAssignmentLabels.submitButton}
                </a>
              </p>
              ` : ''}
            </div>
            
            ${viewAssignmentsUrl ? `<p style="color: #6c757d; font-size: 14px;">Or <a href="${viewAssignmentsUrl}" style="color: #2563eb;">${newAssignmentLabels.viewAllLabel}</a></p>` : ''}
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin-top: 24px;">Best regards,<br><strong>The LNN Team</strong></p>
          </div>
        `;
        break;

      case 'due_tomorrow_reminder':
        if (!preferences.email_due_reminders) {
          console.log('User has disabled due reminder notifications');
          return new Response(JSON.stringify({ message: 'Notification disabled by user' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Get category-specific labels for reminders
        const reminderLabels = getCategoryLabels(data.content_category);

        subject = `Reminder: ${data.assignment_name} Due Tomorrow`;
        
        // Build the submit URL with correct path based on content category
        const reminderSubmitUrl = data.assignment_id && data.base_url 
          ? `${data.base_url}${reminderLabels.submitPath}?assignment=${data.assignment_id}${data.organization_id ? `&org=${data.organization_id}` : ''}`
          : null;
        const reminderViewUrl = data.base_url ? `${data.base_url}${reminderLabels.viewAllPath}` : null;
        
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">${reminderLabels.reminderHeading}</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Hi ${profile.full_name || 'there'},</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">This is a friendly reminder that the following assignment is due tomorrow:</p>
            
            <div style="background: #fff3cd; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #ffc107;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px;">${data.assignment_name}</h2>
              ${data.organization_name ? `<p style="margin: 8px 0; color: #4a4a4a;"><strong>Organization:</strong> ${data.organization_name}</p>` : ''}
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Site:</strong> ${data.site_name}</p>
              
              <div style="background: #ffffff; padding: 10px 14px; border-radius: 6px; margin: 16px 0; display: inline-block;">
                <strong style="color: #856404;">Due Date:</strong> <span style="color: #856404;">${data.due_date}</span>
              </div>
              
              ${reminderSubmitUrl ? `
              <p style="margin-top: 24px;">
                <a href="${reminderSubmitUrl}" style="background: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
                  ${reminderLabels.submitButton}
                </a>
              </p>
              ` : ''}
            </div>
            
            ${reminderViewUrl ? `<p style="color: #6c757d; font-size: 14px;">Or <a href="${reminderViewUrl}" style="color: #2563eb;">${reminderLabels.viewAllLabel}</a></p>` : ''}
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin-top: 24px;">Please make sure to submit before the deadline.</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Best regards,<br><strong>The LNN Team</strong></p>
          </div>
        `;
        break;

      case 'edit_request_approved':
        if (!preferences.email_edit_approvals) {
          console.log('User has disabled edit approval notifications');
          return new Response(JSON.stringify({ message: 'Notification disabled by user' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        subject = `Edit Request Approved: ${data.post_headline}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your Edit Request Has Been Approved</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Hi ${profile.full_name || 'there'},</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Good news! Your edit request for the following post has been approved and published:</p>
            
            <div style="background: #d4edda; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #28a745;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px;">${data.post_headline}</h2>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Approved:</strong> ${data.reviewed_at}</p>
              ${data.review_notes ? `<p style="margin: 12px 0; color: #4a4a4a; background: #ffffff; padding: 12px; border-radius: 4px;"><strong>Admin Notes:</strong> ${data.review_notes}</p>` : ''}
            </div>
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Your changes are now live on WordPress.</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin-top: 24px;">Best regards,<br><strong>The LNN Team</strong></p>
          </div>
        `;
        break;

      case 'edit_request_rejected':
        if (!preferences.email_edit_approvals) {
          console.log('User has disabled edit approval notifications');
          return new Response(JSON.stringify({ message: 'Notification disabled by user' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        subject = `Edit Request Update: ${data.post_headline}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your Edit Request Was Not Approved</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Hi ${profile.full_name || 'there'},</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Your edit request for the following post could not be approved at this time:</p>
            
            <div style="background: #f8d7da; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #dc3545;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px;">${data.post_headline}</h2>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Reviewed:</strong> ${data.reviewed_at}</p>
              ${data.review_notes ? `<p style="margin: 12px 0; color: #4a4a4a; background: #ffffff; padding: 12px; border-radius: 4px;"><strong>Reason:</strong> ${data.review_notes}</p>` : ''}
            </div>
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">The original post remains unchanged. If you have questions about this decision, please contact our team.</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin-top: 24px;">Best regards,<br><strong>The LNN Team</strong></p>
          </div>
        `;
        break;

      case 'date_change_approved':
        if (!preferences.email_edit_approvals) {
          console.log('User has disabled edit approval notifications');
          return new Response(JSON.stringify({ message: 'Notification disabled by user' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        subject = `Date Change Approved: ${data.assignment_name}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your Date Change Request Has Been Approved</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Hi ${profile.full_name || 'there'},</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Good news! Your request to change the due date has been approved:</p>
            
            <div style="background: #d4edda; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #28a745;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px;">${data.assignment_name}</h2>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Previous Date:</strong> ${data.old_date}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>New Date:</strong> ${data.new_date}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Approved:</strong> ${data.reviewed_at}</p>
              ${data.review_notes ? `<p style="margin: 12px 0; color: #4a4a4a; background: #ffffff; padding: 12px; border-radius: 4px;"><strong>Admin Notes:</strong> ${data.review_notes}</p>` : ''}
            </div>
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Your assignment due date has been updated.</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin-top: 24px;">Best regards,<br><strong>The LNN Team</strong></p>
          </div>
        `;
        break;

      case 'date_change_rejected':
        if (!preferences.email_edit_approvals) {
          console.log('User has disabled edit approval notifications');
          return new Response(JSON.stringify({ message: 'Notification disabled by user' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        subject = `Date Change Request Update: ${data.assignment_name}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your Date Change Request Was Not Approved</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Hi ${profile.full_name || 'there'},</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Your request to change the due date could not be approved at this time:</p>
            
            <div style="background: #f8d7da; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #dc3545;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px;">${data.assignment_name}</h2>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Requested Change:</strong> ${data.old_date} → ${data.new_date}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Reviewed:</strong> ${data.reviewed_at}</p>
              ${data.review_notes ? `<p style="margin: 12px 0; color: #4a4a4a; background: #ffffff; padding: 12px; border-radius: 4px;"><strong>Reason:</strong> ${data.review_notes}</p>` : ''}
            </div>
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">The original due date remains unchanged. If you have questions about this decision, please contact our team.</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin-top: 24px;">Best regards,<br><strong>The LNN Team</strong></p>
          </div>
        `;
        break;

      case 'sponsorship_approved':
        if (!preferences.email_edit_approvals) {
          console.log('User has disabled approval notifications');
          return new Response(JSON.stringify({ message: 'Notification disabled by user' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        subject = `Sponsorship Approved: ${data.week_range}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your Email Sponsorship Has Been Approved</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Hi ${profile.full_name || 'there'},</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Good news! Your email sponsorship banner has been approved:</p>
            
            <div style="background: #d4edda; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #28a745;">
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Site:</strong> ${data.site_name}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Campaign Week:</strong> ${data.week_range}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Approved:</strong> ${data.reviewed_at}</p>
              ${data.review_notes ? `<p style="margin: 12px 0; color: #4a4a4a; background: #ffffff; padding: 12px; border-radius: 4px;"><strong>Notes:</strong> ${data.review_notes}</p>` : ''}
            </div>
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Your sponsorship banner will run during the specified week.</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin-top: 24px;">Best regards,<br><strong>The LNN Team</strong></p>
          </div>
        `;
        break;

      case 'sponsorship_rejected':
        if (!preferences.email_edit_approvals) {
          console.log('User has disabled approval notifications');
          return new Response(JSON.stringify({ message: 'Notification disabled by user' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        subject = `Sponsorship Update: ${data.week_range}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your Email Sponsorship Needs Revision</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Hi ${profile.full_name || 'there'},</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Your email sponsorship submission requires some changes:</p>
            
            <div style="background: #f8d7da; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #dc3545;">
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Site:</strong> ${data.site_name}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Campaign Week:</strong> ${data.week_range}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Reviewed:</strong> ${data.reviewed_at}</p>
              ${data.review_notes ? `<p style="margin: 12px 0; color: #4a4a4a; background: #ffffff; padding: 12px; border-radius: 4px;"><strong>Feedback:</strong> ${data.review_notes}</p>` : ''}
            </div>
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Please update your submission and resubmit for approval.</p>
            ${data.base_url ? `
            <p style="margin-top: 24px;">
              <a href="${data.base_url}/client/email-blasts" style="background: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
                View Your Sponsorships →
              </a>
            </p>
            ` : ''}
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin-top: 24px;">Best regards,<br><strong>The LNN Team</strong></p>
          </div>
        `;
        break;

      case 'new_display_campaign':
        if (!preferences.email_new_assignments) {
          console.log('User has disabled new assignment notifications (display campaign)');
          return new Response(JSON.stringify({ message: 'Notification disabled by user' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const adTypeLabel = data.ad_type === 'billboard' ? 'Billboard (600×300)' : 'Skyscraper (300×600)';
        subject = `New Display Ad Campaign: ${data.campaign_name}`;
        html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">You Have a New Display Ad Campaign</h1>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">Hi ${profile.full_name || 'there'},</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">A new display ad campaign has been set up for you:</p>
            
            <div style="background: #f0f9ff; padding: 24px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #2563eb;">
              <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 20px;">${data.campaign_name}</h2>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Site:</strong> ${data.site_name}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Ad Type:</strong> ${adTypeLabel}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>Start Date:</strong> ${data.start_date}</p>
              <p style="margin: 8px 0; color: #4a4a4a;"><strong>End Date:</strong> ${data.end_date}</p>
              
              ${data.base_url ? `
              <p style="margin-top: 24px;">
                <a href="${data.base_url}/client/display-ads" style="background: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
                  View Your Display Ads →
                </a>
              </p>
              ` : ''}
            </div>
            
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5;">You can upload your ad creative from the Display Ads page.</p>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.5; margin-top: 24px;">Best regards,<br><strong>The LNN Team</strong></p>
          </div>
        `;
        break;

      default:
        return new Response(JSON.stringify({ error: 'Invalid notification type' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Send the email and log result
    try {
      await sendEmail(profile.email, subject, html);

      // Log successful send
      await supabase.from('email_notification_logs').insert({
        user_id: userId,
        user_email: profile.email,
        notification_type: type,
        subject: subject,
        notification_data: data,
        status: 'sent',
      });

      console.log(`Notification sent: ${type} to ${profile.email}`);
    } catch (sendError: any) {
      console.error('Failed to send email:', sendError);

      // Log the failed send
      await supabase.from('email_notification_logs').insert({
        user_id: userId,
        user_email: profile.email,
        notification_type: type,
        subject: subject,
        notification_data: data,
        status: 'error',
        error_message: sendError.message,
      });

      return new Response(JSON.stringify({ error: sendError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error sending notification:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);
