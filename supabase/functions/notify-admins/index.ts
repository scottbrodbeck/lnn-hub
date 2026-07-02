import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  event_type: 'post_submitted' | 'post_edited' | 'edit_request_submitted' | 'date_change_requested' | 'support_request' | 'change_request' | 'email_blast_submitted' | 'sponsorship_submitted' | 'ad_submitted';
  post_id?: string;
  post_headline?: string;
  user_id: string;
  user_name: string;
  user_email: string;
  organization_id?: string;
  organization_name?: string;
  publication_date?: string;
  admin_link: string;
  timestamp: string;
  additional_data?: any;
}

function getEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    'post_submitted': '📝 New Post Submitted',
    'post_edited': '✏️ Post Edited',
    'edit_request_submitted': '🔔 Edit Request Needs Review',
    'date_change_requested': '📅 Date Change Request',
    'support_request': '🆘 Support Request',
    'change_request': '🔁 Creative Change Request',
    'email_blast_submitted': '📧 Email Blast Submitted',
    'sponsorship_submitted': '🎯 Sponsorship Banner Submitted',
    'ad_submitted': '🖼️ Ad Creative Submitted'
  };
  return labels[eventType] || eventType;
}

function generateHtmlSummary(payload: NotificationPayload): string {
  const eventLabel = getEventLabel(payload.event_type);
  const timestamp = new Date(payload.timestamp).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  
  let html = `<h2>${eventLabel}</h2>`;
  html += `<p><strong>Submitted by:</strong> ${payload.user_name} (${payload.user_email})</p>`;
  
  if (payload.organization_name) {
    html += `<p><strong>Organization:</strong> ${payload.organization_name}</p>`;
  }
  
  switch (payload.event_type) {
    case 'post_submitted':
      if (payload.additional_data?.assignment_name) {
        html += `<p><strong>Assignment:</strong> ${payload.additional_data.assignment_name}</p>`;
      }
      if (payload.additional_data?.site_name) {
        html += `<p><strong>Site:</strong> ${payload.additional_data.site_name}</p>`;
      }
      html += `<p><strong>Headline:</strong> ${payload.post_headline}</p>`;
      if (payload.publication_date) {
        html += `<p><strong>Publication Date:</strong> ${payload.publication_date}</p>`;
      }
      if (payload.additional_data?.wordpress_edit_url) {
        html += `<p><a href="${payload.additional_data.wordpress_edit_url}">View WordPress Draft</a></p>`;
      }
      if (payload.additional_data?.has_featured_image) {
        html += `<p><strong>Featured Image:</strong> Yes</p>`;
      }
      if (payload.additional_data?.gallery_image_count > 0) {
        html += `<p><strong>Gallery Images:</strong> ${payload.additional_data.gallery_image_count}</p>`;
      }
      if (payload.additional_data?.social_posts_count > 0) {
        html += `<p><strong>Social Posts:</strong> ${payload.additional_data.social_posts_count}</p>`;
      }
      if (payload.additional_data?.has_poll && payload.additional_data?.poll) {
        html += `<p><strong>Poll:</strong> ${payload.additional_data.poll.question}</p>`;
      }
      if (payload.additional_data?.has_cta) {
        html += `<p><strong>CTA Button:</strong> ${payload.additional_data.cta_text}</p>`;
      }
      if (payload.additional_data?.has_youtube) {
        html += `<p><strong>YouTube Video:</strong> Included</p>`;
      }
      if (payload.additional_data?.has_author_bio) {
        html += `<p><strong>Author Bio:</strong> Yes - Please add to post</p>`;
        if (payload.additional_data?.author_name) {
          html += `<p><em>Author Name:</em> ${payload.additional_data.author_name}</p>`;
        }
        if (payload.additional_data?.author_bio) {
          html += `<p><em>Bio:</em> ${payload.additional_data.author_bio}</p>`;
        }
        if (payload.additional_data?.author_photo_url) {
          html += `<p><a href="${payload.additional_data.author_photo_url}">View Author Photo</a></p>`;
        }
      }
      break;
      
    case 'post_edited':
      if (payload.additional_data?.assignment_name) {
        html += `<p><strong>Assignment:</strong> ${payload.additional_data.assignment_name}</p>`;
      }
      if (payload.additional_data?.site_name) {
        html += `<p><strong>Site:</strong> ${payload.additional_data.site_name}</p>`;
      }
      html += `<p><strong>Headline:</strong> ${payload.post_headline}</p>`;
      html += `<p><strong>Edit Type:</strong> Direct edit before deadline</p>`;
      if (payload.additional_data?.author_name) {
        html += `<p><strong>Author:</strong> ${payload.additional_data.author_name}</p>`;
      }
      if (payload.additional_data?.wordpress_edit_url) {
        html += `<p><a href="${payload.additional_data.wordpress_edit_url}">Edit in WordPress</a></p>`;
      }
      break;
      
    case 'edit_request_submitted':
      if (payload.additional_data?.assignment_name) {
        html += `<p><strong>Assignment:</strong> ${payload.additional_data.assignment_name}</p>`;
      }
      if (payload.additional_data?.site_name) {
        html += `<p><strong>Site:</strong> ${payload.additional_data.site_name}</p>`;
      }
      html += `<p><strong>Headline:</strong> ${payload.post_headline}</p>`;
      if (payload.publication_date) {
        html += `<p><strong>Publication:</strong> ${payload.publication_date}</p>`;
      }
      if (payload.additional_data?.changes_summary?.length > 0) {
        html += `<p><strong>Changes made:</strong> ${payload.additional_data.changes_summary.join(', ')}</p>`;
      }
      html += `<p><strong>Reason:</strong> ${payload.additional_data?.request_reason || 'Not provided'}</p>`;
      if (payload.additional_data?.is_pre_publication) {
        html += `<p><em>Pre-publication edit with additional requests</em></p>`;
      }
      if (payload.additional_data?.wordpress_edit_url) {
        html += `<p><a href="${payload.additional_data.wordpress_edit_url}">Edit in WordPress</a></p>`;
      }
      break;
      
    case 'date_change_requested':
      html += `<p><strong>Assignment:</strong> ${payload.additional_data?.assignment_name || 'Unknown'}</p>`;
      html += `<p><strong>Current Date:</strong> ${payload.additional_data?.old_due_date || 'Not set'}</p>`;
      html += `<p><strong>Requested Date:</strong> ${payload.additional_data?.new_due_date || 'Not set'}</p>`;
      if (payload.additional_data?.request_reason) {
        html += `<p><strong>Reason:</strong> ${payload.additional_data.request_reason}</p>`;
      }
      break;
      
    case 'support_request':
      html += `<p><strong>Issue:</strong></p>`;
      html += `<p>${payload.additional_data?.description || 'No description provided'}</p>`;
      if (payload.additional_data?.page_url) {
        html += `<p><strong>Page:</strong> ${payload.additional_data.page_url}</p>`;
      }
      if (payload.additional_data?.screenshot_count > 0) {
        html += `<p><strong>Screenshots:</strong> ${payload.additional_data.screenshot_count} attached</p>`;
      }
      break;
      
    case 'email_blast_submitted':
      html += `<p><strong>Title:</strong> ${payload.additional_data?.title || 'Untitled'}</p>`;
      html += `<p><strong>Subject Line:</strong> ${payload.additional_data?.subject_line || 'Not set'}</p>`;
      if (payload.additional_data?.site_name) {
        html += `<p><strong>Site:</strong> ${payload.additional_data.site_name}</p>`;
      }
      if (payload.additional_data?.scheduled_date) {
        html += `<p><strong>Scheduled Date:</strong> ${payload.additional_data.scheduled_date}</p>`;
      }
      break;
      
    case 'sponsorship_submitted':
      if (payload.additional_data?.site_name) {
        html += `<p><strong>Site:</strong> ${payload.additional_data.site_name}</p>`;
      }
      if (payload.additional_data?.week_start_date) {
        html += `<p><strong>Week:</strong> ${payload.additional_data.week_start_date}</p>`;
      }
      html += `<p><strong>Type:</strong> Newsletter Sponsorship Banner</p>`;
      break;

    case 'ad_submitted':
      if (payload.additional_data?.ad_name) {
        html += `<p><strong>Ad Name:</strong> ${payload.additional_data.ad_name}</p>`;
      }
      if (payload.additional_data?.campaign_name) {
        html += `<p><strong>Campaign:</strong> ${payload.additional_data.campaign_name}</p>`;
      }
      if (payload.additional_data?.site_name) {
        html += `<p><strong>Site:</strong> ${payload.additional_data.site_name}</p>`;
      }
      if (payload.additional_data?.click_url) {
        html += `<p><strong>Click-through URL:</strong> <a href="${payload.additional_data.click_url}">${payload.additional_data.click_url}</a></p>`;
      }
      if (payload.additional_data?.ad_dimensions) {
        html += `<p><strong>Dimensions:</strong> ${payload.additional_data.ad_dimensions}</p>`;
      }
      if (payload.additional_data?.image_url) {
        html += `<p><strong>Creative:</strong> <a href="${payload.additional_data.image_url}">View Image</a></p>`;
      }
      break;

    case 'change_request': {
      const relatedTypeLabel = payload.additional_data?.related_type === 'email_blast'
        ? 'Email Blast'
        : 'Email Sponsorship';
      html += `<p><strong>Item:</strong> ${relatedTypeLabel} — ${payload.additional_data?.related_name || 'Untitled'}</p>`;
      html += `<p><strong>Requested change:</strong></p>`;
      html += `<p>${payload.additional_data?.change_description || 'No description provided'}</p>`;
      if (payload.additional_data?.new_click_url) {
        html += `<p><strong>New click-through URL:</strong> <a href="${payload.additional_data.new_click_url}">${payload.additional_data.new_click_url}</a></p>`;
      }
      if (payload.additional_data?.new_creative_url) {
        html += `<p><strong>New creative:</strong> <a href="${payload.additional_data.new_creative_url}">View Image</a></p>`;
      }
      break;
    }
  }
  
  html += `<p><a href="${payload.admin_link}">View in Admin Panel</a></p>`;
  html += `<p><em>Sent: ${timestamp}</em></p>`;
  
  return html;
}

Deno.serve(async (req) => {
  console.log('=== notify-admins edge function invoked ===');
  console.log('Request method:', req.method);
  console.log('Timestamp:', new Date().toISOString());
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Creating Supabase client...');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request payload
    console.log('Parsing request body...');
    const payload: NotificationPayload = await req.json();
    console.log('Received notification request:', payload.event_type);
    console.log('Post ID:', payload.post_id);
    console.log('User:', payload.user_email);

    // Fetch webhook URL from admin_settings
    const { data: settings, error: settingsError } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'zapier_webhook_url')
      .maybeSingle();

    if (settingsError) {
      // A real DB/RLS error is NOT the same as "not configured" — surface it so a
      // dropped admin notification is visible/retriable instead of faking success.
      console.error('Error fetching webhook settings:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to read notification settings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const webhookUrl = settings?.value as string;

    if (!webhookUrl || webhookUrl === '' || webhookUrl === '""') {
      console.log('Webhook URL not configured, skipping notification');
      return new Response(
        JSON.stringify({ success: true, message: 'Webhook not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format payload for Zapier
    const zapierPayload = {
      event_type: payload.event_type,
      event_label: getEventLabel(payload.event_type),
      content_type: payload.additional_data?.content_type || null,
      html_summary: generateHtmlSummary(payload),
      post: {
        id: payload.post_id,
        headline: payload.post_headline,
        admin_url: payload.admin_link,
        wordpress_edit_url: payload.additional_data?.wordpress_edit_url || null
      },
      user: {
        id: payload.user_id,
        name: payload.user_name,
        email: payload.user_email
      },
      organization: payload.organization_name ? {
        id: payload.organization_id,
        name: payload.organization_name
      } : null,
      site_name: payload.additional_data?.site_name || null,
      assignment_name: payload.additional_data?.assignment_name || null,
      wordpress_draft_url: payload.additional_data?.wordpress_edit_url || null,
      author_name: payload.additional_data?.author_name || null,
      author_bio: payload.additional_data?.author_bio || null,
      author_photo_url: payload.additional_data?.author_photo_url || null,
      changes_summary: payload.additional_data?.changes_summary || [],
      is_pre_publication: payload.additional_data?.is_pre_publication || false,
      publication_date: payload.publication_date,
      timestamp: payload.timestamp,
      ...payload.additional_data
    };

    console.log('Sending webhook to:', webhookUrl);

    // Send to Zapier
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(zapierPayload)
    });

    // Was: only logged the status number, so a failed Zapier delivery (410 deleted
    // Zap, 429, 5xx) looked identical to success. Log real failures as errors.
    if (!response.ok) {
      const zapierBody = await response.text().catch(() => '');
      console.error(`Zapier webhook FAILED: ${payload.event_type} - Status ${response.status} ${zapierBody.slice(0, 300)}`);
    } else {
      console.log(`Webhook sent: ${payload.event_type} - Status: ${response.status}`);
    }

    // --- Slack notification (non-blocking) ---
    try {
      const { data: slackSettings } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'slack_notification_config')
        .maybeSingle();

      if (slackSettings?.value) {
        const slackConfig = slackSettings.value as Record<string, { enabled: boolean; channel: string }>;
        const eventConfig = slackConfig[payload.event_type];

        if (eventConfig?.enabled && eventConfig?.channel) {
          console.log(`Sending Slack notification to channel ${eventConfig.channel}`);
          const eventLabels: Record<string, string> = {
            'post_submitted': '📝 New Post Submitted',
            'post_edited': '✏️ Post Edited',
            'edit_request_submitted': '🔔 Edit Request Needs Review',
            'date_change_requested': '📅 Date Change Request',
            'support_request': '🆘 Support Request',
            'change_request': '🔁 Creative Change Request',
            'email_blast_submitted': '📧 Email Blast Submitted',
            'sponsorship_submitted': '🎯 Sponsorship Banner Submitted',
            'ad_submitted': '🖼️ Ad Creative Submitted',
          };

          const slackPayload = {
            channel: eventConfig.channel,
            event_type: payload.event_type,
            event_label: eventLabels[payload.event_type] || payload.event_type,
            user_name: payload.user_name,
            user_email: payload.user_email,
            organization_name: payload.organization_name,
            post_headline: payload.post_headline,
            publication_date: payload.publication_date,
            admin_link: payload.admin_link,
            timestamp: payload.timestamp,
            additional_data: payload.additional_data,
          };

          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

          try {
            const slackRes = await fetch(`${supabaseUrl}/functions/v1/slack-notify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
              },
              body: JSON.stringify(slackPayload),
            });
            const slackBody = await slackRes.text();
            console.log(`Slack notify response: ${slackRes.status}`, slackBody);
          } catch (slackFetchErr) {
            console.error('Slack notify error:', slackFetchErr);
          }
        } else {
          console.log(`Slack not configured or disabled for event: ${payload.event_type}`);
        }
      }
    } catch (slackError) {
      console.error('Non-blocking Slack error:', slackError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        status: response.status,
        message: 'Notification sent successfully'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
