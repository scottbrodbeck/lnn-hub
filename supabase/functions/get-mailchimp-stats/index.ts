import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MailchimpConfig, isMailchimpConfigured, mcFetch } from '../_shared/mailchimp.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Same shape the UI consumes for Beehiiv stats (BlastStats in useEmailBlastStats)
interface BlastStats {
  email_sent_count?: number;
  email_unique_opens?: number;
  email_total_opens?: number;
  email_unique_clicks?: number;
  email_total_clicks?: number;
  email_unsubscribes?: number;
  email_open_rate?: number;
  email_click_rate?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { blastId, siteId } = await req.json();

    if (!blastId || !siteId) {
      return new Response(
        JSON.stringify({ error: 'Missing blastId or siteId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the email blast record
    const { data: blast, error: blastError } = await supabase
      .from('email_blasts')
      .select('id, mailchimp_campaign_id, published_at, cached_stats, stats_cached_at')
      .eq('id', blastId)
      .single();

    if (blastError || !blast) {
      return new Response(
        JSON.stringify({ error: 'Email blast not found', details: blastError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!blast.mailchimp_campaign_id) {
      return new Response(
        JSON.stringify({ error: 'Blast has no Mailchimp campaign ID', stats: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache validity
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const publishedDate = blast.published_at ? new Date(blast.published_at) : null;

    // If older than 7 days and we have cached stats, use them permanently
    if (publishedDate && publishedDate < sevenDaysAgo && blast.cached_stats) {
      console.log('Using permanently cached stats (blast > 7 days old)');
      return new Response(
        JSON.stringify({
          success: true,
          stats: blast.cached_stats,
          cached: true,
          cached_at: blast.stats_cached_at,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If we have cached stats from within the last hour, use them
    if (blast.stats_cached_at && new Date(blast.stats_cached_at) > oneHourAgo && blast.cached_stats) {
      console.log('Using hourly cached stats (cache < 1 hour old)');
      return new Response(
        JSON.stringify({
          success: true,
          stats: blast.cached_stats,
          cached: true,
          cached_at: blast.stats_cached_at,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch site to get Mailchimp config
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('mailchimp_config')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      return new Response(
        JSON.stringify({ error: 'Site not found', details: siteError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mailchimpConfig = (site.mailchimp_config || {}) as MailchimpConfig;

    if (!isMailchimpConfigured(mailchimpConfig)) {
      return new Response(
        JSON.stringify({ error: 'Mailchimp not configured for this site', stats: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch fresh stats from Mailchimp
    console.log('Fetching fresh stats from Mailchimp');
    let report: any;
    try {
      report = await mcFetch(
        mailchimpConfig.api_key!,
        `/reports/${blast.mailchimp_campaign_id}`
      );
    } catch (apiError: any) {
      console.error('Mailchimp API error:', apiError.message);

      // Return cached stats if we have them, even if stale
      if (blast.cached_stats) {
        return new Response(
          JSON.stringify({
            success: true,
            stats: blast.cached_stats,
            cached: true,
            cached_at: blast.stats_cached_at,
            warning: 'Using stale cache due to API error',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to fetch stats from Mailchimp', details: apiError.message }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map the Mailchimp report to the shared BlastStats shape
    // (Mailchimp rates are 0-1 fractions; the UI expects percentages)
    const stats: BlastStats = {
      email_sent_count: report?.emails_sent,
      email_unique_opens: report?.opens?.unique_opens,
      email_total_opens: report?.opens?.opens_total,
      email_unique_clicks: report?.clicks?.unique_subscriber_clicks,
      email_total_clicks: report?.clicks?.clicks_total,
      email_unsubscribes: report?.unsubscribed,
      email_open_rate: typeof report?.opens?.open_rate === 'number'
        ? report.opens.open_rate * 100
        : undefined,
      email_click_rate: typeof report?.clicks?.click_rate === 'number'
        ? report.clicks.click_rate * 100
        : undefined,
    };

    // Update the cache in the database
    const { error: updateError } = await supabase
      .from('email_blasts')
      .update({
        cached_stats: stats,
        stats_cached_at: now.toISOString(),
      })
      .eq('id', blastId);

    if (updateError) {
      console.error('Failed to update cache:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        stats,
        cached: false,
        cached_at: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-mailchimp-stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
