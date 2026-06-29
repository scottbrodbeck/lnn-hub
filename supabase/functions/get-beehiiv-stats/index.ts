import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BeehiivStats {
  email_sent_count?: number;
  email_unique_opens?: number;
  email_total_opens?: number;
  email_unique_clicks?: number;
  email_total_clicks?: number;
  email_unsubscribes?: number;
  email_open_rate?: number;
  email_click_rate?: number;
  web_views?: number;
  web_clicks?: number;
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
      .select('id, beehiiv_post_id, published_at, cached_stats, stats_cached_at')
      .eq('id', blastId)
      .single();

    if (blastError || !blast) {
      return new Response(
        JSON.stringify({ error: 'Email blast not found', details: blastError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if blast has a beehiiv_post_id
    if (!blast.beehiiv_post_id) {
      return new Response(
        JSON.stringify({ error: 'Blast has no Beehiiv post ID', stats: null }),
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

    // Fetch site to get Beehiiv config
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('beehiiv_config')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      return new Response(
        JSON.stringify({ error: 'Site not found', details: siteError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const beehiivConfig = site.beehiiv_config as { api_key?: string; publication_id?: string } | null;
    
    if (!beehiivConfig?.api_key || !beehiivConfig?.publication_id) {
      return new Response(
        JSON.stringify({ error: 'Beehiiv not configured for this site', stats: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch fresh stats from Beehiiv
    console.log('Fetching fresh stats from Beehiiv');
    const beehiivUrl = `https://api.beehiiv.com/v2/publications/${beehiivConfig.publication_id}/posts/${blast.beehiiv_post_id}?expand=stats`;
    
    const beehiivResponse = await fetch(beehiivUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${beehiivConfig.api_key}`,
        'Content-Type': 'application/json',
      },
    });

    if (!beehiivResponse.ok) {
      const errorText = await beehiivResponse.text();
      console.error('Beehiiv API error:', beehiivResponse.status, errorText);
      
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
        JSON.stringify({ error: 'Failed to fetch stats from Beehiiv', details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const beehiivData = await beehiivResponse.json();
    const stats: BeehiivStats = beehiivData.data?.stats || {};

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
    console.error('Error in get-beehiiv-stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
