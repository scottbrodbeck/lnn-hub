import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaudeText, ClaudeRateLimitError } from "../_shared/claude.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stylePrompts: Record<string, string> = {
  professional: 'Write in a polished, professional tone suitable for LinkedIn or a business audience. Avoid slang. Use confident, authoritative language.',
  conversational: "Write like you're casually telling a friend about something interesting you just read. Keep it warm and approachable.",
  curiosity: 'Frame each post as a question or a teaser that makes people want to click. Create intrigue without clickbait.',
  community: 'Emphasize local impact, community pride, and why this matters to neighbors and residents. Speak as a proud community member.',
  newsworthy: 'Write with urgency and authority like a breaking news alert. Keep it factual, concise, and attention-grabbing.',
  quote: "Extract or paraphrase the most compelling quote or statement from the content. Wrap it in quotation marks if it's a direct quote. Let the quote speak for itself.",
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const extractSocialTextFromHtml = (html: string) =>
  normalizeWhitespace(
    html
      .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
      .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, ' ')
      .replace(/<img[^>]*>/gi, ' ')
      .replace(/<video[\s\S]*?<\/video>/gi, ' ')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  );

const extractFirstSentence = (text: string) => {
  const sentenceMatch = text.match(/^.*?[.!?](?=\s|$)/);
  if (sentenceMatch) return sentenceMatch[0].trim();
  return text.slice(0, 140).trim();
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { headline, content = '', siteName, style } = await req.json();

    const textContent = extractSocialTextFromHtml(content);
    const openingSentence = extractFirstSentence(textContent);

    if (style) {
      const styleInstruction = stylePrompts[style] || stylePrompts.professional;

      console.log('Generating styled social posts:', {
        style,
        headline: headline?.substring?.(0, 80),
        openingSentence: openingSentence.substring(0, 80),
        siteName,
      });

      const systemPrompt = `You are a social media specialist for a local news organization. Your job is to write short social media posts that promote articles.

Style: ${styleInstruction}

Rules:
- Each post must be under 140 characters
- No hashtags
- No exclamation points
- Sound like a real person, not a press release
- Each post should take a DIFFERENT angle or highlight a DIFFERENT detail
- The posts should feel appropriate for a local business or community organization`;

      const userPrompt = `Write exactly 6 short social media posts to promote this article. Each post should highlight a different interesting angle.

Article headline: ${headline}
Opening sentence: ${openingSentence}
Article body for context: ${textContent.substring(0, 1500)}

Return ONLY the 6 posts, one per line. No numbering, no bullet points, no extra text.`;

      const rawText = (await callClaudeText({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 1024,
      })).trim();
      const posts = rawText.split('\n').filter((post: string) => post.trim().length > 5);

      const suggestions = posts.slice(0, 6).map((text: string) => ({
        id: crypto.randomUUID(),
        text: text.trim().replace(/^\d+[\.\)]\s*/, ''),
        type: style,
      }));

      if (suggestions.length === 0) {
        throw new Error('Failed to generate any social post suggestions');
      }

      console.log(`Generated ${suggestions.length} styled social post suggestions`);

      return new Response(
        JSON.stringify({ suggestions }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating social posts (legacy):', { headline, siteName });

    const systemPrompt = `You're the friend at a dinner party who just read something interesting and wants to share it. You're not selling anything - you're genuinely curious about what you found.

Rules:
- Under 140 characters
- No exclamation points, no hashtags
- Sound like a real person, not a press release`;

    const prompt = `Write 5 short social posts about this article. Each should highlight a DIFFERENT interesting angle.

Under 140 characters each. No exclamation points or hashtags. Return only the posts, one per line.

Headline: ${headline}
Opening sentence: ${openingSentence}
Content: ${textContent.substring(0, 1200)}`;

    const rawText = (await callClaudeText({
      system: systemPrompt,
      user: prompt,
      maxTokens: 1024,
    })).trim();
    const posts = rawText.split('\n').filter((post: string) => post.trim().length > 5);
    const suggestions = posts.slice(0, 5).map((text: string) => ({
      id: crypto.randomUUID(),
      text: text.trim().replace(/^\d+[\.\)]\s*/, ''),
      type: 'informative',
    }));

    if (suggestions.length === 0) {
      throw new Error('Failed to generate any social post suggestions');
    }

    console.log(`Generated ${suggestions.length} social post suggestions`);

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-social-posts:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = error instanceof ClaudeRateLimitError ? 429 : 500;

    return new Response(
      JSON.stringify({
        error: errorMessage,
        suggestions: []
      }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
