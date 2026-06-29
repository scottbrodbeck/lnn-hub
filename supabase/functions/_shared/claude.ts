// Shared Anthropic Claude API helpers for AI edge functions.
//
// Replaces the former Lovable AI gateway (ai.gateway.lovable.dev). Calls the
// Claude Messages API directly: https://api.anthropic.com/v1/messages
//
// Secrets:
//   ANTHROPIC_API_KEY  (required)  — key from the Anthropic console
//   ANTHROPIC_MODEL    (optional)  — model id; defaults to claude-sonnet-4-6

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | any[];
}

export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

// Thrown on a 429 so callers can map it back to a 429 for the frontend.
export class ClaudeRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeRateLimitError";
  }
}

interface ClaudeRequest {
  system?: string;
  messages: ClaudeMessage[];
  tools?: ClaudeTool[];
  tool_choice?: { type: "tool"; name: string } | { type: "auto" } | { type: "any" };
  maxTokens?: number;
  model?: string;
}

// Core call: POST to the Messages API with 3-try backoff on 429/5xx
// (mirrors the retry shape of _shared/hubspot.ts hsFetch).
async function callClaude(req: ClaudeRequest): Promise<any> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = req.model || Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;

  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens ?? 2048,
    messages: req.messages,
  };
  if (req.system) body.system = req.system;
  if (req.tools) body.tools = req.tools;
  if (req.tool_choice) body.tool_choice = req.tool_choice;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return res.json();

    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    const text = await res.text();
    lastErr = res.status === 429
      ? new ClaudeRateLimitError(`Claude API 429: ${text.slice(0, 300)}`)
      : new Error(`Claude API ${res.status}: ${text.slice(0, 500)}`);
    if (!retryable || attempt === 2) throw lastErr;

    const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
    const backoff = retryAfter > 0 ? retryAfter * 1000 : [1000, 3000, 9000][attempt];
    await sleep(backoff);
  }
  throw lastErr;
}

// system + user-text prompt → concatenated text from the response.
export async function callClaudeText(opts: {
  system?: string;
  user?: string;
  messages?: ClaudeMessage[];
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  const messages = opts.messages ?? [{ role: "user", content: opts.user ?? "" }];
  const data = await callClaude({
    system: opts.system,
    messages,
    maxTokens: opts.maxTokens,
    model: opts.model,
  });
  return (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
}

// Force a single tool and return its parsed input object (already an object —
// no JSON.parse needed, unlike the old OpenAI tool_calls[].function.arguments).
export async function callClaudeTool<T = any>(opts: {
  system?: string;
  user?: string;
  messages?: ClaudeMessage[];
  tool: ClaudeTool;
  maxTokens?: number;
  model?: string;
}): Promise<T> {
  const messages = opts.messages ?? [{ role: "user", content: opts.user ?? "" }];
  const data = await callClaude({
    system: opts.system,
    messages,
    tools: [opts.tool],
    tool_choice: { type: "tool", name: opts.tool.name },
    maxTokens: opts.maxTokens,
    model: opts.model,
  });
  const block = (data.content || []).find(
    (b: any) => b.type === "tool_use" && b.name === opts.tool.name,
  );
  if (!block) {
    throw new Error(`Claude returned no tool_use block for ${opts.tool.name}`);
  }
  return block.input as T;
}

// OpenAI-style function tool → Claude tool. Lets callers keep their existing
// { name, description, parameters } definitions with a one-line conversion.
export function toClaudeTool(fn: {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}): ClaudeTool {
  return { name: fn.name, description: fn.description, input_schema: fn.parameters };
}

// Convert a data: URI (data:image/png;base64,XXXX) to a Claude image block.
export function dataUriToImageBlock(dataUri: string): any {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUri);
  if (!match) throw new Error("Unsupported image data URI");
  return {
    type: "image",
    source: { type: "base64", media_type: match[1], data: match[2] },
  };
}
