import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pollId } = await req.json();

    if (!pollId) {
      throw new Error('pollId is required');
    }

    const apiKey = Deno.env.get('CROWDSIGNAL_API_KEY');
    const userCode = Deno.env.get('CROWDSIGNAL_USER_CODE');

    if (!apiKey || !userCode) {
      throw new Error('Crowdsignal credentials not configured');
    }

    console.log('Deleting poll:', pollId);

    const API_URL = 'https://api.crowdsignal.com/v1';
    
    const body = {
      pdRequest: {
        partnerGUID: apiKey,
        userCode,
        demands: {
          demand: {
            poll: {
              id: String(pollId)
            },
            id: 'DeletePoll'
          }
        }
      }
    };

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('DeletePoll HTTP error:', response.status, text);
      throw new Error(`DeletePoll HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log('Crowdsignal DeletePoll response:', JSON.stringify(data));

    const errors = data?.pdResponse?.errors;
    
    if (errors && errors.error) {
      console.error('Crowdsignal API error:', errors);
      return new Response(
        JSON.stringify({
          deleted: false,
          pollId: String(pollId),
          error: 'Crowdsignal returned an error during DeletePoll.',
          apiErrors: errors
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Poll deleted successfully:', pollId);

    return new Response(
      JSON.stringify({
        deleted: true,
        pollId: String(pollId)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in delete-crowdsignal-poll:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
