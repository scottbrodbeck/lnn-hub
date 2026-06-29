import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_URL = 'https://api.crowdsignal.com/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, answers } = await req.json();

    console.log('Creating Crowdsignal poll:', { question, answers });

    // Get Crowdsignal credentials from environment
    const apiKey = Deno.env.get('CROWDSIGNAL_API_KEY');
    const userCode = Deno.env.get('CROWDSIGNAL_USER_CODE');
    const styleIdBasic = Deno.env.get('CROWDSIGNAL_STYLE_ID');
    const packIdBasic = Deno.env.get('CROWDSIGNAL_PACK_ID');
    const folderIdPolls = Deno.env.get('CROWDSIGNAL_FOLDER_ID');

    // Validation
    if (!apiKey || !userCode) {
      throw new Error('apiKey and userCode are required.');
    }
    if (!question) {
      throw new Error('question is required.');
    }
    if (!answers || !Array.isArray(answers) || answers.length < 2) {
      throw new Error('At least two answers are required.');
    }
    if (!styleIdBasic || !packIdBasic || !folderIdPolls) {
      throw new Error('Missing Crowdsignal configuration.');
    }

    // Build poll object
    const poll = {
      question,
      multipleChoice: 'no',
      randomiseAnswers: 'no',
      otherAnswer: { content: 'no' },
      resultsType: 'percent',
      blockRepeatVotersType: 'cookie',
      blockExpiration: '7257600',
      comments: { content: 'off' },
      makePublic: 'yes',
      closePoll: 'no',
      closeDate: '2099-12-31T00:00:00',
      styleID: String(styleIdBasic),
      packID: String(packIdBasic),
      folderID: String(folderIdPolls),
      languageID: '30',
      sharing: 'no',
      answers: {
        answer: answers.map((text: string) => ({ text }))
      }
    };

    // Request body
    const body = {
      pdRequest: {
        partnerGUID: apiKey,
        userCode,
        demands: {
          demand: {
            poll,
            id: 'CreatePoll'
          }
        }
      }
    };

    // Call Crowdsignal API
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Crowdsignal API error:', errorText);
      throw new Error(`Crowdsignal API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('Crowdsignal API response:', JSON.stringify(data));

    // Parse response
    let demandNode = data?.pdResponse?.demands?.demand;
    
    if (Array.isArray(demandNode)) {
      demandNode = demandNode.find((d: any) => d && d.poll) || demandNode[0];
    }

    const createdPoll = demandNode?.poll;
    const errors = data?.pdResponse?.errors;

    if (errors && errors.error) {
      console.error('Crowdsignal returned errors:', errors);
      throw new Error('Crowdsignal returned an error: ' + JSON.stringify(errors));
    }

    if (!createdPoll) {
      console.warn('Could not locate poll node in response');
      throw new Error('Could not locate poll in API response');
    }

    // Build response
    const pollId = createdPoll.id;
    const embedUrl = `https://poll.fm/${pollId}`;
    const jsEmbedCode =
      `<script type="text/javascript" charset="utf-8" src="https://secure.polldaddy.com/p/${pollId}.js"></script>` +
      `<noscript><a href="${embedUrl}">Take Our Poll</a></noscript>`;

    console.log('Poll created successfully:', { pollId, embedUrl });

    return new Response(
      JSON.stringify({
        pollId,
        embedUrl,
        jsEmbedCode,
        question: createdPoll.question
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in create-crowdsignal-poll:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
