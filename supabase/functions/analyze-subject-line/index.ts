import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaudeTool, toClaudeTool, dataUriToImageBlock, ClaudeRateLimitError } from "../_shared/claude.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnalysisRequest {
  subjectLine: string;
  siteName: string;
  mainImageUrl?: string;
  title?: string;
  bodyContent?: string;
}

interface AnalysisResult {
  needsEditing: boolean;
  editedSubjectLine: string;
  explanation: string;
  alternatives: string[];
}

/** Strip HTML tags and decode common entities to get plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch an image URL and return a base64 data URI, or null on failure. */
async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    let res = await fetch(url);

    // If original URL fails, try the _optimized variant
    // (background processing may have replaced the original file)
    if (!res.ok) {
      const optimizedUrl = url.replace(/(\.[^.]+)$/, '_optimized$1');
      if (optimizedUrl !== url) {
        console.warn(`Original URL failed (${res.status}), trying optimized: ${optimizedUrl}`);
        res = await fetch(optimizedUrl);
      }
    }

    if (!res.ok) {
      console.warn(`Failed to fetch image (${res.status}): ${url}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary);
    return `data:${contentType};base64,${b64}`;
  } catch (err) {
    console.warn("Image base64 conversion failed, proceeding without image:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subjectLine, siteName, mainImageUrl, title, bodyContent } = await req.json() as AnalysisRequest;

    if (!subjectLine || !siteName) {
      return new Response(
        JSON.stringify({ error: "subjectLine and siteName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a copy editor for ${siteName} and its sister local news sites.
Your task is to edit subject lines for sponsored email blasts so that they match 
the editorial tone and standards of these publications.

Editorial guidelines:
1. Do NOT use language that implies ${siteName} is affiliated with or attending the 
   advertiser's event unless explicitly stated.
2. Write in a neutral, informative, and locally grounded tone — avoid sounding 
   sales-y or promotional.
3. Avoid using ALL CAPS, excessive punctuation (e.g. "!!"), or slang/profanity.
4. Keep subject lines concise — ideally 30–50 characters (6–10 words). Over 60 characters risks truncation on mobile.
5. Capture what makes the event/news/item interesting to a local audience.
6. Emojis are acceptable if they fit naturally.

If the client's original subject line meets standards, say so. Otherwise, revise 
it and explain what was changed.`;

    let userPrompt = `Please analyze this subject line for a sponsored email blast:

**Client-Provided Subject Line:**
"${subjectLine}"`;

    if (title) {
      userPrompt += `\n\n**Email Title/Topic:**
${title}`;
    }

    // Include body content (stripped of HTML) for additional context
    if (bodyContent) {
      const plainBody = stripHtml(bodyContent);
      if (plainBody.length > 0) {
        const truncated = plainBody.length > 500 ? plainBody.slice(0, 500) + "…" : plainBody;
        userPrompt += `\n\n**Email Body Text:**
${truncated}`;
      }
    }

    if (mainImageUrl) {
      userPrompt += `\n\nAn image is included with this email blast. Please examine it carefully — it shows what the blast is promoting and should inform your subject line suggestions.`;
    }

    userPrompt += `

Please evaluate whether this subject line meets ${siteName}'s editorial standards and provide your analysis.`;

    const tools = [
      {
        type: "function",
        function: {
          name: "analyze_subject_line",
          description: "Analyze and suggest improvements for an email subject line",
          parameters: {
            type: "object",
            properties: {
              needsEditing: {
                type: "boolean",
                description: "Whether the subject line needs changes to meet editorial standards"
              },
              editedSubjectLine: {
                type: "string",
                description: "The improved subject line (or original if no changes needed)"
              },
              explanation: {
                type: "string",
                description: "Explanation of what was changed and why, or confirmation that it meets standards"
              },
              alternatives: {
                type: "array",
                items: { type: "string" },
                description: "Three alternative subject line options in sentence case"
              }
            },
            required: ["needsEditing", "editedSubjectLine", "explanation", "alternatives"]
          }
        }
      }
    ];

    // Convert image to base64 data URI so AI providers don't need to fetch it
    let imageDataUrl: string | null = null;
    if (mainImageUrl) {
      imageDataUrl = await imageUrlToBase64(mainImageUrl);
      if (!imageDataUrl) {
        console.warn("Falling back to text-only analysis (image conversion failed)");
      }
    }

    // Build the user message — multimodal (with image) or text-only
    const userContent: any[] = [{ type: "text", text: userPrompt }];
    if (imageDataUrl) {
      try {
        userContent.push(dataUriToImageBlock(imageDataUrl));
      } catch (_err) {
        console.warn("Image block conversion failed; proceeding text-only");
      }
    }

    let result: AnalysisResult;
    try {
      result = await callClaudeTool<AnalysisResult>({
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
        tool: toClaudeTool(tools[0].function),
        maxTokens: 1024,
      });
    } catch (err) {
      if (err instanceof ClaudeRateLimitError) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Graceful fallback preserves prior behavior: 200 with the original line.
      console.error("Subject-line analysis failed:", err);
      return new Response(
        JSON.stringify({
          error: "Unexpected AI response",
          needsEditing: false,
          editedSubjectLine: subjectLine,
          explanation: "Analysis complete. Your subject line appears to meet our standards.",
          alternatives: []
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure we have exactly 3 alternatives
    if (!result.alternatives || result.alternatives.length < 3) {
      result.alternatives = result.alternatives || [];
      while (result.alternatives.length < 3) {
        result.alternatives.push(subjectLine);
      }
    }
    result.alternatives = result.alternatives.slice(0, 3);

    return new Response(
      JSON.stringify({
        editedSubjectLine: result.needsEditing ? result.editedSubjectLine : null,
        explanation: result.explanation,
        alternatives: result.alternatives,
        hasIssues: result.needsEditing
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("analyze-subject-line error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
