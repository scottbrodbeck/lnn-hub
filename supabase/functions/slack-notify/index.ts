const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Direct Slack Web API (was the Lovable connector gateway).
const GATEWAY_URL = 'https://slack.com/api';

interface SlackNotifyPayload {
  channel: string;
  event_type: string;
  event_label: string;
  user_name: string;
  user_email: string;
  organization_name?: string;
  post_headline?: string;
  publication_date?: string;
  admin_link: string;
  timestamp: string;
  additional_data?: any;
}

function buildBlocks(payload: SlackNotifyPayload): any[] {
  const blocks: any[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: { type: 'plain_text', text: payload.event_label, emoji: true },
  });

  // Submitted by
  const fields: { type: string; text: string }[] = [
    { type: 'mrkdwn', text: `*Submitted by:*\n${payload.user_name} (${payload.user_email})` },
  ];

  if (payload.organization_name) {
    fields.push({ type: 'mrkdwn', text: `*Organization:*\n${payload.organization_name}` });
  }

  if (payload.post_headline) {
    fields.push({ type: 'mrkdwn', text: `*Headline:*\n${payload.post_headline}` });
  }

  if (payload.publication_date) {
    fields.push({ type: 'mrkdwn', text: `*Publication Date:*\n${payload.publication_date}` });
  }

  blocks.push({ type: 'section', fields });

  // Event-specific details
  const ad = payload.additional_data || {};

  switch (payload.event_type) {
    case 'post_submitted':
    case 'post_edited': {
      const details: string[] = [];
      if (ad.assignment_name) details.push(`*Assignment:* ${ad.assignment_name}`);
      if (ad.site_name) details.push(`*Site:* ${ad.site_name}`);
      if (ad.author_name) details.push(`*Author:* ${ad.author_name}`);
      if (ad.has_featured_image) details.push('📷 Featured image included');
      if (ad.gallery_image_count > 0) details.push(`🖼️ ${ad.gallery_image_count} gallery images`);
      if (ad.social_posts_count > 0) details.push(`📱 ${ad.social_posts_count} social posts`);
      if (ad.has_poll) details.push('📊 Poll included');
      if (ad.has_cta) details.push(`🔗 CTA: ${ad.cta_text}`);
      if (ad.has_youtube) details.push('🎬 YouTube video included');
      if (ad.has_author_bio) details.push('👤 Author bio included');
      if (details.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: details.join('\n') } });
      }
      break;
    }
    case 'edit_request_submitted': {
      const parts: string[] = [];
      if (ad.assignment_name) parts.push(`*Assignment:* ${ad.assignment_name}`);
      if (ad.changes_summary?.length > 0) parts.push(`*Changes:* ${ad.changes_summary.join(', ')}`);
      if (ad.request_reason) parts.push(`*Reason:* ${ad.request_reason}`);
      if (parts.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: parts.join('\n') } });
      }
      break;
    }
    case 'date_change_requested': {
      const parts: string[] = [];
      if (ad.assignment_name) parts.push(`*Assignment:* ${ad.assignment_name}`);
      if (ad.old_due_date) parts.push(`*Current Date:* ${ad.old_due_date}`);
      if (ad.new_due_date) parts.push(`*Requested Date:* ${ad.new_due_date}`);
      if (ad.request_reason) parts.push(`*Reason:* ${ad.request_reason}`);
      if (parts.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: parts.join('\n') } });
      }
      break;
    }
    case 'support_request': {
      const parts: string[] = [];
      if (ad.description) parts.push(`*Issue:*\n${ad.description}`);
      if (ad.page_url) parts.push(`*Page:* ${ad.page_url}`);
      if (ad.screenshot_count > 0) parts.push(`📎 ${ad.screenshot_count} screenshots attached`);
      if (parts.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: parts.join('\n') } });
      }
      break;
    }
    case 'email_blast_submitted': {
      const parts: string[] = [];
      if (ad.title) parts.push(`*Title:* ${ad.title}`);
      if (ad.subject_line) parts.push(`*Subject:* ${ad.subject_line}`);
      if (ad.site_name) parts.push(`*Site:* ${ad.site_name}`);
      if (ad.scheduled_date) parts.push(`*Scheduled:* ${ad.scheduled_date}`);
      if (parts.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: parts.join('\n') } });
      }
      break;
    }
    case 'sponsorship_submitted': {
      const parts: string[] = [];
      if (ad.site_name) parts.push(`*Site:* ${ad.site_name}`);
      if (ad.week_start_date) parts.push(`*Week:* ${ad.week_start_date}`);
      parts.push('*Type:* Newsletter Sponsorship Banner');
      if (parts.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: parts.join('\n') } });
      }
      break;
    }
    case 'ad_submitted': {
      const parts: string[] = [];
      if (ad.ad_name) parts.push(`*Ad Name:* ${ad.ad_name}`);
      if (ad.campaign_name) parts.push(`*Campaign:* ${ad.campaign_name}`);
      if (ad.site_name) parts.push(`*Site:* ${ad.site_name}`);
      if (ad.click_url) parts.push(`*Click-through URL:* <${ad.click_url}|${ad.click_url}>`);
      if (ad.ad_dimensions) parts.push(`*Dimensions:* ${ad.ad_dimensions}`);
      if (parts.length > 0) {
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: parts.join('\n') } });
      }
      if (ad.image_url) {
        blocks.push({
          type: 'image',
          image_url: ad.image_url,
          alt_text: ad.ad_name || 'Ad Creative',
        });
      }
      break;
    }
  }

  // Admin link button
  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'View in Admin Panel', emoji: true },
        url: payload.admin_link,
        style: 'primary',
      },
      ...(ad.wordpress_edit_url
        ? [{
            type: 'button',
            text: { type: 'plain_text', text: 'Edit in WordPress', emoji: true },
            url: ad.wordpress_edit_url,
          }]
        : []),
    ],
  });

  // Timestamp context
  const ts = new Date(payload.timestamp).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York',
  }) + ' ET';
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Sent: ${ts}` }],
  });

  return blocks;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');
    if (!SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN is not configured');

    const payload: SlackNotifyPayload = await req.json();
    console.log(`Sending Slack notification: ${payload.event_type} to channel ${payload.channel}`);

    const blocks = buildBlocks(payload);
    const fallbackText = `${payload.event_label} - ${payload.post_headline || payload.user_name}`;

    const messageBody = JSON.stringify({
      channel: payload.channel,
      text: fallbackText,
      blocks,
      unfurl_links: false,
      unfurl_media: false,
      username: 'LNN Local Hub',
      icon_emoji: ':newspaper:',
    });

    const slackHeaders = {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    };

    let response = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
      method: 'POST',
      headers: slackHeaders,
      body: messageBody,
    });

    let data = await response.json();

    // Handle not_in_channel: auto-join public channels, error for private
    if (data.error === 'not_in_channel') {
      console.log(`Bot not in channel ${payload.channel}, attempting auto-join...`);

      // Check if channel is private
      const infoRes = await fetch(`${GATEWAY_URL}/conversations.info?channel=${payload.channel}`, {
        method: 'GET',
        headers: slackHeaders,
      });
      const infoData = await infoRes.json();

      const isPrivate = infoData.ok && infoData.channel?.is_private;

      if (isPrivate) {
        throw new Error(`The bot cannot auto-join private channels. Please invite the LNN bot to #${infoData.channel?.name || payload.channel} in Slack first.`);
      }

      // Public channel — join it
      const joinRes = await fetch(`${GATEWAY_URL}/conversations.join`, {
        method: 'POST',
        headers: slackHeaders,
        body: JSON.stringify({ channel: payload.channel }),
      });
      const joinData = await joinRes.json();

      if (!joinRes.ok || !joinData.ok) {
        throw new Error(`Failed to join channel: ${joinData.error || 'unknown error'}`);
      }

      console.log(`Successfully joined channel ${payload.channel}, retrying message...`);

      // Retry the message
      response = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
        method: 'POST',
        headers: slackHeaders,
        body: messageBody,
      });
      data = await response.json();
    }

    if (!response.ok || !data.ok) {
      let userMessage = `Slack API error: ${data.error}`;
      if (data.error === 'channel_not_found') {
        userMessage = `Channel "${payload.channel}" was not found. It may have been deleted or archived.`;
      } else if (data.error === 'invalid_auth') {
        userMessage = 'Slack authentication failed. Please reconnect the Slack integration.';
      }
      throw new Error(userMessage);
    }

    console.log('Slack notification sent successfully');
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error sending Slack notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
