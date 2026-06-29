import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  MailchimpConfig,
  MailchimpApiError,
  isMailchimpConfigured,
  getDc,
  mcFetch,
  BLAST_TEMPLATE_HTML,
} from '../_shared/mailchimp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface EmailBlastData {
  id: string;
  title: string;
  subject_line: string;
  preview_text?: string;
  main_image_url: string;
  click_url: string;
  headline?: string;
  body_content?: string;
  cta_button_text?: string;
  cta_button_url?: string;
  secondary_image_url?: string;
  scheduled_date?: string;
  organization_id?: string;
}

interface CreateMailchimpRequest {
  blastId?: string;
  siteId?: string;
  mode?: 'verify';
  credentials?: {
    api_key?: string;
    audience_id?: string;
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Build the HTML for each mc:edit region of the managed template. Unused
// sections get an empty string so the draft never contains placeholder copy.
function buildSections(
  blast: EmailBlastData,
  config: MailchimpConfig,
  siteName: string
): Record<string, string> {
  const imgStyle = 'display:block; width:100%; max-width:600px; height:auto; border:0;';

  let bannerImage = '';
  if (config.banner_image_url) {
    bannerImage = `<img src="${config.banner_image_url}" alt="${escapeHtml(siteName)}" width="600" style="${imgStyle}">`;
  }

  let mainImage = '';
  if (blast.main_image_url) {
    const img = `<img src="${blast.main_image_url}" alt="Promotional image" width="600" style="${imgStyle}">`;
    mainImage = blast.click_url
      ? `<a href="${blast.click_url}" target="_blank">${img}</a>`
      : img;
  }

  const headline = blast.headline
    ? `<h1 style="margin:0; font-size:28px; line-height:1.3; text-align:center;">${escapeHtml(blast.headline)}</h1>`
    : '';

  // TipTap output is plain HTML (<p>, <ul>, <ol>, inline marks) and passes
  // through to the editable region as-is.
  let body = '';
  if (blast.body_content) {
    const hasHtmlTags = /<[^>]+>/.test(blast.body_content);
    body = hasHtmlTags ? blast.body_content : `<p>${escapeHtml(blast.body_content)}</p>`;
  }

  let ctaButton = '';
  if (blast.cta_button_text && blast.cta_button_url) {
    ctaButton = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="border-radius:4px; background-color:#1a73e8;"><a href="${blast.cta_button_url}" target="_blank" style="display:inline-block; padding:12px 28px; font-family:Helvetica, Arial, sans-serif; font-size:16px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:4px;">${escapeHtml(blast.cta_button_text)}</a></td></tr></table>`;
  }

  const secondaryImage = blast.secondary_image_url
    ? `<img src="${blast.secondary_image_url}" alt="Additional image" width="600" style="${imgStyle}">`
    : '';

  const disclaimer = `<em>${escapeHtml(siteName)} offers, events and announcements are sent on behalf of local businesses and nonprofits up to twice a week as part of your newsletter subscription. Use the unsubscribe link below to opt out.</em>`;

  return {
    banner_image: bannerImage,
    main_image: mainImage,
    headline,
    body,
    cta_button: ctaButton,
    secondary_image: secondaryImage,
    disclaimer,
  };
}

// Returns the site's template id, creating the managed template on first use
// (or re-creating it if the stored one was deleted in Mailchimp).
async function ensureTemplate(
  supabase: any,
  siteId: string,
  config: MailchimpConfig
): Promise<number> {
  const apiKey = config.api_key!;

  if (config.template_id) {
    try {
      await mcFetch(apiKey, `/templates/${config.template_id}`);
      return config.template_id;
    } catch (error) {
      if (error instanceof MailchimpApiError && error.status === 404) {
        console.log(`Stored Mailchimp template ${config.template_id} not found, re-creating`);
      } else {
        throw error;
      }
    }
  }

  const created = await mcFetch(apiKey, '/templates', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Email Blast Template (auto-created)',
      html: BLAST_TEMPLATE_HTML,
    }),
  });

  const templateId = created?.id;
  if (!templateId) {
    throw new Error('Mailchimp template creation returned no id');
  }

  // Re-read the config before persisting so a concurrent settings save isn't clobbered
  const { data: freshSite } = await supabase
    .from('sites')
    .select('mailchimp_config')
    .eq('id', siteId)
    .single();

  const { error: updateError } = await supabase
    .from('sites')
    .update({
      mailchimp_config: { ...(freshSite?.mailchimp_config || {}), template_id: templateId },
    })
    .eq('id', siteId);

  if (updateError) {
    console.error('Failed to persist Mailchimp template_id:', updateError);
  }

  console.log(`Created Mailchimp template ${templateId}`);
  return templateId;
}

// Sender fields come from site config, falling back to the audience's campaign defaults
async function resolveSender(
  config: MailchimpConfig
): Promise<{ from_name: string; reply_to: string }> {
  let fromName = config.from_name || '';
  let replyTo = config.reply_to || '';

  if (!fromName || !replyTo) {
    const list = await mcFetch(config.api_key!, `/lists/${config.audience_id}`);
    fromName = fromName || list?.campaign_defaults?.from_name || '';
    replyTo = replyTo || list?.campaign_defaults?.from_email || '';
  }

  if (!fromName || !replyTo) {
    throw new Error(
      'Mailchimp sender details missing: set From Name and Reply-To in site settings, or set campaign defaults on the Mailchimp audience'
    );
  }

  return { from_name: fromName, reply_to: replyTo };
}

async function handleVerify(
  supabase: any,
  request: CreateMailchimpRequest
): Promise<Response> {
  let apiKey = request.credentials?.api_key || '';
  let audienceId = request.credentials?.audience_id || '';
  let templateId: number | undefined;

  if (request.siteId) {
    const { data: site } = await supabase
      .from('sites')
      .select('mailchimp_config')
      .eq('id', request.siteId)
      .single();
    const saved = (site?.mailchimp_config || {}) as MailchimpConfig;
    apiKey = apiKey || saved.api_key || '';
    audienceId = audienceId || saved.audience_id || '';
    templateId = saved.template_id;
  }

  if (!apiKey) {
    throw new Error('No Mailchimp API key provided or saved for this site');
  }

  const ping = await mcFetch(apiKey, '/ping');

  let audience: any = null;
  if (audienceId) {
    audience = await mcFetch(apiKey, `/lists/${audienceId}`);
  }

  // Report whether the stored managed template still exists in Mailchimp
  let templateStatus: string = templateId ? 'unknown' : 'not_created_yet';
  let templateName: string | null = null;
  if (templateId) {
    try {
      const template = await mcFetch(apiKey, `/templates/${templateId}`);
      templateStatus = 'found';
      templateName = template?.name || null;
    } catch (error) {
      templateStatus = error instanceof MailchimpApiError && error.status === 404
        ? 'missing_will_recreate'
        : 'check_failed';
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      health_status: ping?.health_status,
      audience_name: audience?.name || null,
      from_name: audience?.campaign_defaults?.from_name || null,
      from_email: audience?.campaign_defaults?.from_email || null,
      member_count: audience?.stats?.member_count ?? null,
      template_id: templateId ?? null,
      template_status: templateStatus,
      template_name: templateName,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const request: CreateMailchimpRequest = await req.json();

    if (request.mode === 'verify') {
      // Verify failures return 200 + success:false so the UI can surface the message
      try {
        return await handleVerify(supabase, request);
      } catch (error: any) {
        return new Response(
          JSON.stringify({ success: false, error: error.message || 'Verification failed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    const { blastId, siteId } = request;

    console.log(`Creating Mailchimp campaign for blast: ${blastId}, site: ${siteId}`);

    if (!blastId || !siteId) {
      throw new Error('blastId and siteId are required');
    }

    // Fetch the email blast data
    const { data: blast, error: blastError } = await supabase
      .from('email_blasts')
      .select('*')
      .eq('id', blastId)
      .single();

    if (blastError || !blast) {
      console.error('Failed to fetch email blast:', blastError);
      throw new Error('Email blast not found');
    }

    // Fetch site's Mailchimp configuration
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('mailchimp_config, name')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error('Failed to fetch site:', siteError);
      throw new Error('Site not found');
    }

    const mailchimpConfig = (site.mailchimp_config || {}) as MailchimpConfig;

    // Fetch client code from organization
    let clientCode = '';
    if (blast.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('client_code')
        .eq('id', blast.organization_id)
        .maybeSingle();
      if (org?.client_code) clientCode = org.client_code;
    }

    const campaignTitle = clientCode
      ? `Blast: ${blast.title} ${clientCode}`
      : `Blast: ${blast.title}`;

    if (!isMailchimpConfigured(mailchimpConfig)) {
      console.log('Mailchimp not configured for site:', site.name);
      return new Response(
        JSON.stringify({
          success: false,
          notConfigured: true,
          message: `Mailchimp is not configured for site: ${site.name}. Blast saved as submitted for manual processing.`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    const apiKey = mailchimpConfig.api_key!;
    const dc = getDc(apiKey);

    const templateId = await ensureTemplate(supabase, siteId, mailchimpConfig);
    const { from_name, reply_to } = await resolveSender(mailchimpConfig);

    // Create the draft campaign
    const campaignPayload: any = {
      type: 'regular',
      recipients: {
        list_id: mailchimpConfig.audience_id,
      },
      settings: {
        subject_line: blast.subject_line,
        ...(blast.preview_text ? { preview_text: blast.preview_text } : {}),
        title: campaignTitle,
        from_name,
        reply_to,
        auto_footer: false,
      },
    };

    if (mailchimpConfig.saved_segment_id) {
      campaignPayload.recipients.segment_opts = {
        saved_segment_id: Number(mailchimpConfig.saved_segment_id),
      };
      console.log('Segment targeting applied:', mailchimpConfig.saved_segment_id);
    } else {
      console.log('No saved_segment_id configured for this site');
    }

    console.log('Calling Mailchimp API to create campaign...');

    const campaign = await mcFetch(apiKey, '/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaignPayload),
    });

    const campaignId = campaign?.id;
    const webId = campaign?.web_id;
    const campaignUrl = webId
      ? `https://${dc}.admin.mailchimp.com/campaigns/show/?id=${webId}`
      : null;

    console.log('Mailchimp campaign created:', campaignId);

    // Set content via the managed template so the draft opens with
    // click-to-edit sections in Mailchimp's editor
    const sections = buildSections(blast as EmailBlastData, mailchimpConfig, site.name);

    let contentError: any = null;
    try {
      await mcFetch(apiKey, `/campaigns/${campaignId}/content`, {
        method: 'PUT',
        body: JSON.stringify({ template: { id: templateId, sections } }),
      });
    } catch (error) {
      contentError = error;
      console.error('Failed to set Mailchimp campaign content:', error);
    }

    // Save campaign info even on content failure so the empty draft is traceable
    const { error: updateError } = await supabase
      .from('email_blasts')
      .update({
        mailchimp_campaign_id: campaignId,
        mailchimp_web_id: webId,
        mailchimp_campaign_url: campaignUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', blastId);

    if (updateError) {
      console.error('Failed to update email blast with Mailchimp info:', updateError);
    }

    if (contentError) {
      await supabase.from('api_logs').insert({
        log_type: 'mailchimp_create_campaign',
        status: 'error',
        summary: `Campaign created but content failed: ${blast.title}`,
        error_message: contentError.message,
        site_id: siteId,
        request_data: { blastId, title: blast.title },
        response_data: { mailchimp_campaign_id: campaignId, mailchimp_campaign_url: campaignUrl },
      });
      throw new Error(
        `Mailchimp campaign was created but setting its content failed: ${contentError.message}`
      );
    }

    // Log the API call
    await supabase.from('api_logs').insert({
      log_type: 'mailchimp_create_campaign',
      status: 'success',
      summary: `Created Mailchimp draft: ${blast.title}`,
      site_id: siteId,
      request_data: {
        blastId,
        title: blast.title,
        subject_line: blast.subject_line,
        template_id: templateId,
      },
      response_data: {
        mailchimp_campaign_id: campaignId,
        mailchimp_campaign_url: campaignUrl,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        mailchimp_campaign_id: campaignId,
        mailchimp_campaign_url: campaignUrl,
        message: 'Draft created in Mailchimp successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error creating Mailchimp campaign:', error);

    // Try to log the error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      await supabase.from('api_logs').insert({
        log_type: 'mailchimp_create_campaign',
        status: 'error',
        summary: `Failed to create Mailchimp campaign`,
        error_message: error.message,
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create Mailchimp campaign',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
