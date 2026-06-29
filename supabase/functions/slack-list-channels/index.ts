import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Direct Slack Web API (was the Lovable connector gateway).
const GATEWAY_URL = 'https://slack.com/api';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN');
    if (!SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN is not configured');

    const allChannels: { id: string; name: string; is_private: boolean }[] = [];
    let cursor: string | undefined;

    // Paginate through all channels
    let types = 'public_channel,private_channel';

    // First attempt — if missing_scope, fall back to public only
    const fetchChannels = async (channelTypes: string) => {
      const channels: { id: string; name: string; is_private: boolean }[] = [];
      let cur: string | undefined;
      do {
        const params = new URLSearchParams({
          types: channelTypes,
          exclude_archived: 'true',
          limit: '200',
        });
        if (cur) params.set('cursor', cur);

        const response = await fetch(`${GATEWAY_URL}/conversations.list?${params}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw { slackError: data.error, raw: data, status: response.status };
        }

        for (const ch of data.channels || []) {
          channels.push({ id: ch.id, name: ch.name, is_private: ch.is_private || false });
        }
        cur = data.response_metadata?.next_cursor || undefined;
      } while (cur);
      return channels;
    };

    try {
      allChannels.push(...await fetchChannels(types));
    } catch (err: any) {
      if (err?.slackError === 'missing_scope') {
        console.warn('missing_scope for private channels, falling back to public only');
        allChannels.push(...await fetchChannels('public_channel'));
      } else {
        throw new Error(`Slack API error [${err?.status}]: ${JSON.stringify(err?.raw)}`);
      }
    }

    // Sort alphabetically
    allChannels.sort((a, b) => a.name.localeCompare(b.name));

    return new Response(JSON.stringify({ channels: allChannels }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error listing Slack channels:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
