import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaudeTool, toClaudeTool, ClaudeRateLimitError } from "../_shared/claude.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Article type configurations with system prompt additions
const ARTICLE_TYPE_PROMPTS: Record<string, { systemPromptAddition: string; targetWordCount: { min: number; max: number } }> = {
  business_feature: {
    systemPromptAddition: `Write a magazine-style business profile that tells a compelling story. 
Structure: Lead with an engaging hook, weave in the origin story, highlight what makes them unique, 
include specific examples or anecdotes, and end with a forward-looking statement or call to action.
Tone: Professional yet warm, like a local business magazine feature.`,
    targetWordCount: { min: 500, max: 700 }
  },
  customer_success: {
    systemPromptAddition: `Write a customer success story that follows a problem-solution-result structure.
Lead with the customer's challenge, show how the business helped, and quantify or describe the positive outcomes.
Include any direct quotes or testimonials naturally. End with a subtle call to action.
Tone: Testimonial-driven, authentic, results-focused.`,
    targetWordCount: { min: 450, max: 600 }
  },
  product_spotlight: {
    systemPromptAddition: `Write a product/service spotlight that educates and entices without being pushy.
Lead with the problem it solves, describe the offering in sensory or experiential terms,
highlight unique features, and include social proof if available.
Tone: Informative, enthusiastic but not salesy, focused on customer benefits.`,
    targetWordCount: { min: 400, max: 550 }
  },
  event_promotion: {
    systemPromptAddition: `Write an engaging event promotion that creates excitement and provides all essential details.
Lead with what makes this event unmissable, include all practical information (date, time, location, cost),
highlight special features or guests, and end with a clear call to action to register or attend.
Tone: Exciting, informative, community-focused.`,
    targetWordCount: { min: 350, max: 500 }
  },
  milestone: {
    systemPromptAddition: `Write a celebratory announcement that shares the excitement while informing readers.
Lead with the news, weave in the journey that led here, include event details if applicable,
and invite the community to be part of the celebration.
Tone: Celebratory, grateful, community-inviting.`,
    targetWordCount: { min: 400, max: 550 }
  },
  community: {
    systemPromptAddition: `Write a community-focused story that highlights genuine involvement without being self-congratulatory.
Lead with the cause and why it matters, show specific actions and impact,
include human-interest moments, and invite reader participation if applicable.
Tone: Heartfelt, authentic, community-centered rather than company-centered.`,
    targetWordCount: { min: 450, max: 600 }
  },
  expert_tips: {
    systemPromptAddition: `Write an expert tips article that educates while subtly establishing credibility.
Lead with why this topic matters to readers, present tips in a clear and actionable way,
use specific examples, and end with an invitation to learn more from the expert.
Tone: Educational, helpful, authoritative but approachable.`,
    targetWordCount: { min: 500, max: 700 }
  },
  qa_interview: {
    systemPromptAddition: `Write a Q&A interview article that feels conversational and personal.
Format as a series of questions and answers, preserving the interviewee's voice and personality.
Include a brief intro about who is being interviewed, then present the Q&A in an engaging flow.
Tone: Personal, conversational, like sitting down for coffee with the interviewee.`,
    targetWordCount: { min: 500, max: 800 }
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, conversationHistory, changeRequest, currentArticle, articleType, organization, organizationDescription } = await req.json();

    let systemPrompt = '';
    let userPrompt = '';
    let tools: any[] = [];
    let toolChoice: any = undefined;

    if (type === 'start') {
      // Legacy support for old flow - generate initial follow-up questions
      const initialAnswers = conversationHistory.slice(-3);
      systemPrompt = `You are an expert content interviewer and writer for sponsored articles.
Your goal is to gather authentic, interesting information through conversational questions.`;

      userPrompt = `Based on these initial answers:
- Organization: ${initialAnswers[0]?.content || 'N/A'}
- What they do: ${initialAnswers[1]?.content || 'N/A'}
- What to promote: ${initialAnswers[2]?.content || 'N/A'}

Generate 4-5 insightful follow-up questions that will help write a compelling sponsored article.`;

      tools = [{
        type: "function",
        function: {
          name: "provide_questions",
          description: "Provide follow-up interview questions",
          parameters: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    text: { type: "string" }
                  },
                  required: ["id", "text"]
                }
              }
            },
            required: ["questions"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "provide_questions" } };

    } else if (type === 'generate_final_question') {
      // NEW: Generate a personalized final question based on the interview
      systemPrompt = `You are an expert content interviewer. Based on the interview so far, 
generate ONE final insightful question that will add depth or a memorable detail to the article.`;

      const articleTypeLabel = articleType ? articleType.replace(/_/g, ' ') : 'sponsored';
      
      const qaPairs = conversationHistory.map((qa: { question: string; answer: string }) => 
        `Q: ${qa.question}\nA: ${qa.answer}`
      ).join('\n\n');

      userPrompt = `Based on this interview for a ${articleTypeLabel} article about ${organization}:

${organization} does: ${organizationDescription}

Interview so far:
${qaPairs}

Generate ONE final insightful question that:
- Builds on something interesting the client mentioned
- Will add depth or a memorable detail to the article
- Is conversational and easy to answer
- Is different from the questions already asked

Return just the question text.`;

      tools = [{
        type: "function",
        function: {
          name: "provide_final_question",
          description: "Provide the final personalized interview question",
          parameters: {
            type: "object",
            properties: {
              question: { type: "string", description: "The final question to ask" }
            },
            required: ["question"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "provide_final_question" } };

    } else if (type === 'generate') {
      // Generate the article with type-specific prompts
      const typeConfig = articleType ? ARTICLE_TYPE_PROMPTS[articleType] : null;
      const wordCount = typeConfig?.targetWordCount || { min: 400, max: 600 };
      const typeSpecificPrompt = typeConfig?.systemPromptAddition || '';

      systemPrompt = `You are an expert content writer for sponsored articles.
Your goal is to write engaging, informative articles that avoid being overly sales-y.
Tone: Professional yet warm, journalistic, genuinely curious about the story.

${typeSpecificPrompt}`;

      const qaPairs = conversationHistory.map((qa: { question: string; answer: string }) => 
        `Q: ${qa.question}\nA: ${qa.answer}`
      ).join('\n\n');

      userPrompt = `Write a sponsored article for ${organization}.

About the organization: ${organizationDescription}

Interview responses:
${qaPairs}

Write an article that is:
- Engaging and informative (not sales-y)
- Authentic and credible
- ${wordCount.min}-${wordCount.max} words
- Includes specific details from the interview
- Has a compelling headline (60-80 characters)
- Written in a journalistic style
- Content should be in HTML format with proper paragraph tags, headings, and formatting

Focus on storytelling and genuine value, not advertising.`;

      tools = [{
        type: "function",
        function: {
          name: "provide_article",
          description: "Provide the generated article with headline and content",
          parameters: {
            type: "object",
            properties: {
              headline: { type: "string" },
              content: { type: "string", description: "HTML formatted article content" }
            },
            required: ["headline", "content"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "provide_article" } };

    } else if (type === 'refine') {
      // Refine the article based on user feedback
      const headline = currentArticle?.headline || 'Unknown';
      const content = currentArticle?.content || 'No content provided';
      
      systemPrompt = `You are an expert content writer. Revise the article according to feedback while maintaining quality.`;

      userPrompt = `The user requested these changes to the article:\n\n"${changeRequest}"\n\n
Current article:
Headline: ${headline}
Content: ${content}

Please revise the article according to their feedback while maintaining the engaging, authentic style.`;

      tools = [{
        type: "function",
        function: {
          name: "provide_article",
          description: "Provide the revised article",
          parameters: {
            type: "object",
            properties: {
              headline: { type: "string" },
              content: { type: "string", description: "HTML formatted article content" }
            },
            required: ["headline", "content"]
          }
        }
      }];
      toolChoice = { type: "function", function: { name: "provide_article" } };
    }

    const maxTokens = (type === 'generate' || type === 'refine') ? 4096 : 1024;

    const result = await callClaudeTool({
      system: systemPrompt,
      user: userPrompt,
      tool: toClaudeTool(tools[0].function),
      maxTokens,
    });
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-post-interview:', error);
    const status = error instanceof ClaudeRateLimitError ? 429 : 500;
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error occurred' }), 
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
