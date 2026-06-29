import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pollId, newQuestion, answers } = await req.json();

    // Get environment variables
    const apiKey = Deno.env.get('CROWDSIGNAL_API_KEY');
    const userCode = Deno.env.get('CROWDSIGNAL_USER_CODE');

    // Validate inputs
    if (!apiKey || !userCode) {
      console.error('Missing Crowdsignal credentials');
      throw new Error('Crowdsignal API credentials not configured');
    }

    if (!pollId) {
      throw new Error('pollId is required');
    }

    console.log('Updating poll:', pollId);

    const API_URL = 'https://api.crowdsignal.com/v1';

    // Step 1: Get existing poll
    const getPollBody = {
      pdRequest: {
        partnerGUID: apiKey,
        userCode,
        demands: {
          demand: {
            poll: { id: String(pollId) },
            id: 'GetPoll'
          }
        }
      }
    };

    console.log('Fetching existing poll...');
    let response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getPollBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GetPoll failed:', errorText);
      throw new Error(`Failed to fetch existing poll: ${response.status}`);
    }

    let data = await response.json();

    // Handle both object and array shapes for demands.demand
    let demandNode = data?.pdResponse?.demands?.demand;
    if (Array.isArray(demandNode)) {
      demandNode = demandNode.find((d: any) => d && d.poll) || demandNode[0];
    }

    const existingPoll = demandNode?.poll;
    if (!existingPoll) {
      console.error('Could not locate poll in GetPoll response');
      throw new Error('Could not retrieve existing poll data');
    }

    console.log('Existing poll retrieved:', existingPoll.id);

    // Step 2: Build updated poll object
    const otherAnswerValue =
      typeof existingPoll.otherAnswer === 'string'
        ? existingPoll.otherAnswer
        : existingPoll.otherAnswer?.content || 'no';

    const commentsValue =
      typeof existingPoll.comments === 'string'
        ? existingPoll.comments
        : existingPoll.comments?.content || 'off';

    const updatedPoll: any = {
      id: String(pollId),
      question: newQuestion && newQuestion.trim().length
        ? newQuestion
        : existingPoll.question,
      multipleChoice: existingPoll.multipleChoice || 'no',
      randomiseAnswers: existingPoll.randomiseAnswers || 'no',
      otherAnswer: { content: otherAnswerValue },
      resultsType: existingPoll.resultsType || 'percent',
      blockRepeatVotersType: existingPoll.blockRepeatVotersType || 'cookie',
      blockExpiration: existingPoll.blockExpiration || '7257600',
      comments: { content: commentsValue },
      makePublic: existingPoll.makePublic || 'yes',
      closePoll: existingPoll.closePoll || 'no',
      closeDate: existingPoll.closeDate || '2099-12-31T00:00:00',
      styleID: existingPoll.styleID,
      packID: existingPoll.packID,
      folderID: existingPoll.folderID,
      languageID: existingPoll.languageID || '30',
      sharing: existingPoll.sharing || 'no',
      password: existingPoll.password || '',
    };

    // Handle answers
    if (answers && Array.isArray(answers) && answers.length > 0) {
      updatedPoll.answers = {
        answer: answers.map((text: string, index: number) => ({
          text,
          position: String(index + 1)
        }))
      };
    } else if (existingPoll.answers) {
      updatedPoll.answers = existingPoll.answers;
    }

    // Step 3: Update poll
    const updateBody = {
      pdRequest: {
        partnerGUID: apiKey,
        userCode,
        demands: {
          demand: {
            poll: updatedPoll,
            id: 'UpdatePoll'
          }
        }
      }
    };

    console.log('Updating poll with new data...');
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UpdatePoll failed:', errorText);
      throw new Error(`Failed to update poll: ${response.status}`);
    }

    data = await response.json();

    // Handle both object and array shapes for demands.demand
    let updDemand = data?.pdResponse?.demands?.demand;
    if (Array.isArray(updDemand)) {
      updDemand = updDemand.find((d: any) => d && d.poll) || updDemand[0];
    }

    const updatedPollFromApi = updDemand?.poll;
    const apiErrors = data?.pdResponse?.errors;

    if (apiErrors && apiErrors.error) {
      console.error('Crowdsignal API error:', apiErrors);
      throw new Error('Crowdsignal API returned an error during update');
    }

    if (!updatedPollFromApi) {
      console.error('Could not locate poll node in UpdatePoll response');
      throw new Error('Poll update response missing poll data');
    }

    console.log('Poll updated successfully:', updatedPollFromApi.id);

    // Step 4: Build response
    const finalPollId = updatedPollFromApi.id || pollId;
    const embedUrl = `https://poll.fm/${finalPollId}`;
    const jsEmbedCode =
      `<script type="text/javascript" charset="utf-8" src="https://secure.polldaddy.com/p/${finalPollId}.js"></script>` +
      `<noscript><a href="${embedUrl}">Take Our Poll</a></noscript>`;

    return new Response(
      JSON.stringify({
        pollId: finalPollId,
        embedUrl,
        jsEmbedCode,
        question: updatedPollFromApi.question
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in update-crowdsignal-poll function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
