import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaudeTool, toClaudeTool, ClaudeRateLimitError } from "../_shared/claude.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { headline, content, authorName, currentDate, typosOnly, efficacyOnly } = await req.json();

    console.log(`Reviewing post with AI... typosOnly=${typosOnly}, efficacyOnly=${efficacyOnly}`);

    // Build appropriate system prompt based on mode
    let systemPrompt: string;
    if (typosOnly) {
      systemPrompt = `You are an expert editor reviewing a news article for typos and errors only.
Current date: ${currentDate}
IMPORTANT: Do not flag years as errors if they match or are close to the current date (within 1-2 years). The current year is ${new Date(currentDate).getFullYear()}.

Review the post ONLY for:
1. Typos, grammatical errors, and obvious mistakes

CRITICAL TYPO GUIDELINES:
- Only flag low priority items if they are genuine errors (typos, grammar mistakes, factual errors)
- Do NOT flag low priority stylistic preferences or minor wording choices that are subjective
- Skip any low severity suggestions that are merely alternative phrasings
- For context field: ALWAYS include the ORIGINAL text with the error, NOT the suggested correction. Include enough surrounding text (1-2 sentences) to UNIQUELY identify this specific instance in the document.
- Keep originalText and suggestedText SHORT - just the specific word or phrase with the error, not entire sentences or paragraphs

Be helpful but not overly critical. Focus on genuine issues.`;
    } else if (efficacyOnly) {
      systemPrompt = `You are an expert editor evaluating a news article's effectiveness.
Current date: ${currentDate}

Evaluate the post for:
1. Message strength and clarity
2. Organization and readability
3. Length appropriateness
4. Overall effectiveness
5. SEO optimization (headline length, keyword usage, meta description)

NOTE: This content has already been reviewed for typos and corrected. Focus ONLY on effectiveness evaluation.
Be helpful and constructive with suggestions for improvement.`;
    } else {
      systemPrompt = `You are an expert editor reviewing a news article for publication.
Current date: ${currentDate}
IMPORTANT: Do not flag years as errors if they match or are close to the current date (within 1-2 years). The current year is ${new Date(currentDate).getFullYear()}.

Review the post for:
1. Typos, grammatical errors, and obvious mistakes
2. Message strength and clarity
3. Organization and readability
4. Length appropriateness
5. Overall effectiveness
6. SEO optimization (headline length, keyword usage, meta description)

CRITICAL TYPO GUIDELINES:
- Only flag low priority items if they are genuine errors (typos, grammar mistakes, factual errors)
- Do NOT flag low priority stylistic preferences or minor wording choices that are subjective
- Skip any low severity suggestions that are merely alternative phrasings
- For context field: ALWAYS include the ORIGINAL text with the error, NOT the suggested correction. Include enough surrounding text (1-2 sentences) to UNIQUELY identify this specific instance in the document.
- Keep originalText and suggestedText SHORT - just the specific word or phrase with the error, not entire sentences or paragraphs

Be helpful but not overly critical. Focus on genuine issues that would improve the post.`;
    }

    const userPrompt = `Please review this post:

HEADLINE: ${headline}

AUTHOR: ${authorName || "Not specified"}

CONTENT:
${content}

Provide a thorough review with specific, actionable suggestions.`;

    // Build tools array based on mode
    const typosTool = {
      type: "function",
      function: {
        name: "provide_typos",
        description: "Provide a list of typos and errors found in the post",
        parameters: {
          type: "object",
          properties: {
            typos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique identifier for this typo" },
                  location: { 
                    type: "string", 
                    enum: ["headline", "content"],
                    description: "Where the typo is located" 
                  },
                  originalText: { type: "string", description: "The SHORT text with the error - just the word or phrase, not entire sentences" },
                  suggestedText: { type: "string", description: "The corrected SHORT text - just the word or phrase" },
                  context: { type: "string", description: "Surrounding text showing the ORIGINAL text with the error (1-2 sentences). Include enough context to UNIQUELY identify this specific instance in the document." },
                  reason: { type: "string", description: "Why this change is needed" },
                  severity: { 
                    type: "string",
                    enum: ["high", "medium", "low"],
                    description: "How important this fix is"
                  },
                },
                required: ["id", "location", "originalText", "suggestedText", "context", "reason", "severity"],
              },
            },
          },
          required: ["typos"],
        },
      },
    };

    const efficacyTool = {
      type: "function",
      function: {
        name: "provide_efficacy",
        description: "Provide an efficacy and SEO evaluation of the post",
        parameters: {
          type: "object",
          properties: {
            efficacy: {
              type: "object",
              properties: {
                overallScore: { 
                  type: "number",
                  description: "Overall score from 1-10",
                  minimum: 1,
                  maximum: 10
                },
                strengths: {
                  type: "array",
                  items: { type: "string" },
                  description: "What's working well in the post"
                },
                improvements: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: {
                        type: "string",
                        enum: ["message_strength", "length", "organization", "readability"],
                        description: "Category of improvement"
                      },
                      suggestion: { type: "string", description: "Specific suggestion" },
                      priority: {
                        type: "string",
                        enum: ["high", "medium", "low"],
                        description: "Priority level"
                      },
                    },
                    required: ["category", "suggestion", "priority"],
                  },
                },
                summary: { type: "string", description: "Overall summary of the review" },
              },
              required: ["overallScore", "strengths", "improvements", "summary"],
            },
            seo: {
              type: "object",
              properties: {
                headlineLength: {
                  type: "object",
                  properties: {
                    current: { type: "number", description: "Current headline character count" },
                    ideal: { type: "string", description: "Ideal range (50-60 characters)" },
                    status: { 
                      type: "string", 
                      enum: ["optimal", "too_short", "too_long"],
                      description: "Whether headline length is optimal"
                    },
                    suggestion: { type: "string", description: "Suggestion if not optimal" },
                  },
                  required: ["current", "ideal", "status"],
                },
                keywordDensity: {
                  type: "object",
                  properties: {
                    topKeywords: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          keyword: { type: "string" },
                          count: { type: "number" },
                          density: { type: "string", description: "Percentage as string (e.g., '2.5%')" },
                        },
                        required: ["keyword", "count", "density"],
                      },
                      description: "Top 3-5 keywords found in content"
                    },
                    analysis: { type: "string", description: "Analysis of keyword usage" },
                  },
                  required: ["topKeywords", "analysis"],
                },
                metaDescription: {
                  type: "object",
                  properties: {
                    suggested: { type: "string", description: "Suggested meta description (150-160 chars)" },
                    reason: { type: "string", description: "Why this meta description works" },
                  },
                  required: ["suggested", "reason"],
                },
              },
              required: ["headlineLength", "keywordDensity", "metaDescription"],
            },
          },
          required: ["efficacy", "seo"],
        },
      },
    };

    // Select tools and tool_choice based on mode
    let tools: any[];
    let toolChoice: any;

    if (typosOnly) {
      tools = [typosTool];
      toolChoice = { type: "function", function: { name: "provide_typos" } };
    } else if (efficacyOnly) {
      tools = [efficacyTool];
      toolChoice = { type: "function", function: { name: "provide_efficacy" } };
    } else {
      // Full review - use both tools combined into one
      tools = [
        {
          type: "function",
          function: {
            name: "provide_review",
            description: "Provide a structured review of the post with typos and efficacy evaluation",
            parameters: {
              type: "object",
              properties: {
                typos: typosTool.function.parameters.properties.typos,
                efficacy: efficacyTool.function.parameters.properties.efficacy,
                seo: efficacyTool.function.parameters.properties.seo,
              },
              required: ["typos", "efficacy", "seo"],
            },
          },
        },
      ];
      toolChoice = { type: "function", function: { name: "provide_review" } };
    }

    const reviewData = await callClaudeTool({
      system: systemPrompt,
      user: userPrompt,
      tool: toClaudeTool(tools[0].function),
      maxTokens: 4096,
    });
    
    // Override AI's headline length estimate with actual calculated value
    // AI is unreliable at counting characters, so we do it server-side
    if (reviewData.seo?.headlineLength) {
      const actualHeadlineLength = headline.length;
      reviewData.seo.headlineLength.current = actualHeadlineLength;
      reviewData.seo.headlineLength.ideal = "50-70 characters";
      
      // Recalculate status based on actual length with consistent thresholds
      if (actualHeadlineLength >= 50 && actualHeadlineLength <= 70) {
        reviewData.seo.headlineLength.status = 'optimal';
        reviewData.seo.headlineLength.suggestion = null;
      } else if (actualHeadlineLength < 50) {
        reviewData.seo.headlineLength.status = 'too_short';
        reviewData.seo.headlineLength.suggestion = `Add ${50 - actualHeadlineLength} more characters for optimal SEO visibility.`;
      } else {
        reviewData.seo.headlineLength.status = 'too_long';
        reviewData.seo.headlineLength.suggestion = `Consider shortening by ${actualHeadlineLength - 70} characters to avoid truncation in search results.`;
      }
      console.log(`Headline length: AI estimated unknown, actual is ${actualHeadlineLength} chars`);
    }
    
    if (typosOnly) {
      console.log(`Typo check complete: ${reviewData.typos.length} typos found`);
      // Return with empty efficacy/seo for consistency
      return new Response(
        JSON.stringify({
          typos: reviewData.typos,
          efficacy: null,
          seo: null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (efficacyOnly) {
      console.log(`Efficacy check complete: score ${reviewData.efficacy.overallScore}/10`);
      return new Response(
        JSON.stringify({
          typos: [],
          efficacy: reviewData.efficacy,
          seo: reviewData.seo,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.log(`Review complete: ${reviewData.typos.length} typos found, score: ${reviewData.efficacy.overallScore}/10`);
      return new Response(
        JSON.stringify(reviewData),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error in review-post function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (error instanceof ClaudeRateLimitError) {
      return new Response(
        JSON.stringify({ error: "rate_limit", message: "AI service rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: "internal_error", message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
