import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface BeehiivConfig {
  api_key?: string;
  publication_id?: string;
  segment_id?: string;
  banner_image_url?: string;
  disclaimer_text?: string;
}

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
}

interface CreateBeehiivRequest {
  blastId: string;
  siteId: string;
}

interface FormattedTextSegment {
  text: string;
  styling?: string[];
  href?: string;
}

// Parse inline HTML (inside a <p>) into formattedText segments
function parseInlineHtml(html: string): FormattedTextSegment[] {
  const segments: FormattedTextSegment[] = [];
  // Regex to match opening/closing tags or text between them
  const tokenRegex = /<(\/?)(\w+)(?:\s+[^>]*)?>|([^<]+)/g;
  let token;

  const activeStyles: string[] = [];
  let activeHref: string | null = null;

  while ((token = tokenRegex.exec(html)) !== null) {
    const isClosing = token[1] === '/';
    const tagName = token[2]?.toLowerCase();
    const textContent = token[3];

    if (textContent) {
      // Emit a text segment with current styles
      const seg: FormattedTextSegment = { text: textContent };
      if (activeStyles.length > 0) {
        seg.styling = [...activeStyles];
      }
      if (activeHref) {
        seg.href = activeHref;
      }
      segments.push(seg);
    } else if (tagName) {
      if (isClosing) {
        // Remove style when tag closes
        if (tagName === 'strong' || tagName === 'b') {
          const idx = activeStyles.indexOf('bold');
          if (idx !== -1) activeStyles.splice(idx, 1);
        } else if (tagName === 'em' || tagName === 'i') {
          const idx = activeStyles.indexOf('italic');
          if (idx !== -1) activeStyles.splice(idx, 1);
        } else if (tagName === 'u') {
          const idx = activeStyles.indexOf('underline');
          if (idx !== -1) activeStyles.splice(idx, 1);
        } else if (tagName === 'a') {
          const idx = activeStyles.indexOf('underline');
          if (idx !== -1) activeStyles.splice(idx, 1);
          activeHref = null;
        }
      } else {
        // Opening tag - add style
        if (tagName === 'strong' || tagName === 'b') {
          activeStyles.push('bold');
        } else if (tagName === 'em' || tagName === 'i') {
          activeStyles.push('italic');
        } else if (tagName === 'u') {
          activeStyles.push('underline');
        } else if (tagName === 'a') {
          activeStyles.push('underline');
          // Extract href
          const hrefMatch = token[0].match(/href="([^"]*)"/);
          if (hrefMatch) {
            activeHref = hrefMatch[1];
          }
        }
      }
    }
  }

  return segments;
}

// Parse a <p>...</p> element into a paragraph block
function parseParagraph(pHtml: string): any {
  // Extract inner content of <p> tag
  const innerMatch = pHtml.match(/^<p[^>]*>([\s\S]*)<\/p>$/i);
  const inner = innerMatch ? innerMatch[1] : pHtml;

  const formattedText = parseInlineHtml(inner);

  return {
    type: "paragraph",
    formattedText: formattedText.length > 0 ? formattedText : [{ text: "" }],
  };
}

// Parse a <ul>/<ol> element into a list block
function parseList(listHtml: string, tag: string): any {
  const items: string[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;

  while ((liMatch = liRegex.exec(listHtml)) !== null) {
    // TipTap wraps li content in <p> tags, strip them
    let content = liMatch[1].trim();
    content = content.replace(/^<p[^>]*>/, '').replace(/<\/p>$/, '');
    // Strip any remaining HTML tags for list items (Beehiiv items are plain text)
    content = content.replace(/<[^>]*>/g, '').trim();
    if (content) {
      items.push(content);
    }
  }

  return {
    type: "list",
    items,
    listType: tag === 'ol' ? 'ordered' : 'unordered',
  };
}

// Convert TipTap HTML body content into native Beehiiv blocks
function parseHtmlToBlocks(html: string): any[] {
  const blocks: any[] = [];

  const topLevelRegex = /<(p|ul|ol)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;
  let match;

  while ((match = topLevelRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const fullMatch = match[0];

    if (tag === 'p') {
      blocks.push(parseParagraph(fullMatch));
    } else if (tag === 'ul' || tag === 'ol') {
      blocks.push(parseList(fullMatch, tag));
    }
  }

  // Fallback for plain text without tags
  if (blocks.length === 0 && html.trim()) {
    const stripped = html.replace(/<[^>]*>/g, '').trim();
    if (stripped) {
      blocks.push({
        type: "paragraph",
        formattedText: [{ text: stripped }],
      });
    }
  }

  return blocks;
}

// Build native Beehiiv blocks for the email content
function buildEmailBlocks(blast: EmailBlastData, config: BeehiivConfig, siteName: string): any[] {
  const blocks: any[] = [];

  // 1. Site Header Banner
  if (config.banner_image_url) {
    blocks.push({
      type: "image",
      imageUrl: config.banner_image_url,
      alt: siteName,
      alignment: "center",
    });
  }

  // 2. Top Promotional Image
  if (blast.main_image_url) {
    const mainImageBlock: any = {
      type: "image",
      imageUrl: blast.main_image_url,
      alt: "Promotional image",
      alignment: "center",
    };
    if (blast.click_url) {
      mainImageBlock.url = blast.click_url;
    }
    blocks.push(mainImageBlock);
  }

  // 3. Headline
  if (blast.headline) {
    blocks.push({
      type: "heading",
      level: "1",
      text: blast.headline,
      textAlignment: "center",
    });
  }

  // 4. Body Content (native blocks)
  if (blast.body_content) {
    const hasHtmlTags = /<[^>]+>/.test(blast.body_content);

    if (hasHtmlTags) {
      const contentBlocks = parseHtmlToBlocks(blast.body_content);
      blocks.push(...contentBlocks);
    } else {
      blocks.push({
        type: "paragraph",
        formattedText: [{ text: blast.body_content }],
      });
    }
  }

  // 5. CTA Button
  if (blast.cta_button_text && blast.cta_button_url) {
    blocks.push({
      type: "button",
      text: blast.cta_button_text,
      href: blast.cta_button_url,
      alignment: "center",
    });
  }

  // 6. Bottom Image
  if (blast.secondary_image_url) {
    blocks.push({
      type: "image",
      imageUrl: blast.secondary_image_url,
      alt: "Additional image",
      alignment: "center",
    });
  }

  // 7. Content break
  blocks.push({
    type: "content_break",
  });

  // 8. Disclaimer Text
  blocks.push({
    type: "paragraph",
    formattedText: [
      {
        text: `${siteName} offers, events and announcements are sent on behalf of local businesses and nonprofits up to twice a week as part of your newsletter subscription. Use the "email preferences" link below to opt out.`,
        styling: ["italic"],
      },
    ],
  });

  return blocks;
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

    const { blastId, siteId }: CreateBeehiivRequest = await req.json();

    console.log(`Creating Beehiiv draft for blast: ${blastId}, site: ${siteId}`);

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

    // Fetch site's Beehiiv configuration
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('beehiiv_config, name')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error('Failed to fetch site:', siteError);
      throw new Error('Site not found');
    }

    const beehiivConfig = site.beehiiv_config as BeehiivConfig;

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

    const beehiivTitle = clientCode
      ? `Blast: ${blast.title} ${clientCode}`
      : `Blast: ${blast.title}`;

    if (!beehiivConfig?.api_key || !beehiivConfig?.publication_id) {
      console.log('Beehiiv not configured for site:', site.name);
      return new Response(
        JSON.stringify({
          success: false,
          notConfigured: true,
          message: `Beehiiv is not configured for site: ${site.name}. Blast saved as submitted for manual processing.`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Build native Beehiiv blocks
    const blocks = buildEmailBlocks(blast as EmailBlastData, beehiivConfig, site.name);

    console.log(`Built ${blocks.length} Beehiiv blocks`);

    // Prepare Beehiiv API request
    const beehiivPayload: any = {
      title: beehiivTitle,
      subtitle: blast.subject_line,
      blocks: blocks,
      status: 'draft',
      platform: 'email',
      email_settings: {
        display_title_in_email: false,
        display_byline_in_email: false,
        display_subtitle_in_email: false,
        email_subject_line: blast.subject_line,
        ...(blast.preview_text ? { email_preview_text: blast.preview_text } : {}),
      },
      social_share: "none",
      web_settings: {
        social_share: "none",
        show_social_share: false,
      },
    };

    // Add segment targeting if configured (nested under email per Beehiiv API v2)
    if (beehiivConfig.segment_id) {
      beehiivPayload.recipients = {
    web: {},
        email: {
          include_segment_ids: [beehiivConfig.segment_id],
        },
      };
      console.log('Segment targeting applied:', beehiivConfig.segment_id);
    } else {
      console.log('No segment_id configured for this site');
    }

    console.log('Beehiiv payload:', JSON.stringify(beehiivPayload, null, 2));

    console.log('Calling Beehiiv API to create post...');

    // Create post in Beehiiv
    const beehiivResponse = await fetch(
      `https://api.beehiiv.com/v2/publications/${beehiivConfig.publication_id}/posts`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${beehiivConfig.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(beehiivPayload),
      }
    );

    const beehiivResult = await beehiivResponse.json();

    if (!beehiivResponse.ok) {
      console.error('Beehiiv API error:', beehiivResult);
      throw new Error(`Beehiiv API error: ${beehiivResult.message || beehiivResult.error || 'Unknown error'}`);
    }

    console.log('Beehiiv post created successfully:', beehiivResult.data?.id);

    // Update the email blast with Beehiiv post info
    const beehiivPostId = beehiivResult.data?.id;
    const beehiivPostUrl = beehiivResult.data?.web_url || beehiivResult.data?.preview_url;

    const { error: updateError } = await supabase
      .from('email_blasts')
      .update({
        beehiiv_post_id: beehiivPostId,
        beehiiv_post_url: beehiivPostUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', blastId);

    if (updateError) {
      console.error('Failed to update email blast with Beehiiv info:', updateError);
    }

    // Log the API call
    await supabase.from('api_logs').insert({
      log_type: 'beehiiv_create_post',
      status: 'success',
      summary: `Created Beehiiv draft: ${blast.title}`,
      site_id: siteId,
      request_data: {
        blastId,
        title: blast.title,
        subject_line: blast.subject_line,
        blocks_count: blocks.length,
      },
      response_data: {
        beehiiv_post_id: beehiivPostId,
        beehiiv_post_url: beehiivPostUrl,
      },
    });

    // Beehiiv QA is handled by the background sweep to avoid false negatives
    // while Beehiiv finishes making newly created drafts available.

    return new Response(
      JSON.stringify({
        success: true,
        beehiiv_post_id: beehiivPostId,
        beehiiv_post_url: beehiivPostUrl,
        message: 'Draft created in Beehiiv successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error creating Beehiiv draft:', error);

    // Try to log the error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      await supabase.from('api_logs').insert({
        log_type: 'beehiiv_create_post',
        status: 'error',
        summary: `Failed to create Beehiiv draft`,
        error_message: error.message,
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create Beehiiv draft',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
