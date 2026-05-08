import { environment } from "@zuplo/runtime";

/**
 * Anthropic Claude integration.
 *
 * Calls the Anthropic Messages API (https://docs.claude.com/en/api/messages).
 * Reads ANTHROPIC_API_KEY for auth. If AI_GATEWAY_URL is set, requests are
 * routed through Zuplo's AI Gateway instead of api.anthropic.com — that's
 * where you get caching, budgets, prompt-injection scanning, and audit logs.
 */

const ANTHROPIC_API = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-4-7-20251022";
const ANTHROPIC_VERSION = "2023-06-01";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeCompletionRequest {
  /** System prompt — domain context for the model. */
  system?: string;
  /** Conversation messages (user first). */
  messages: ClaudeMessage[];
  /** Override the default model. */
  model?: string;
  /** Cap output length. Defaults to 1024. */
  maxTokens?: number;
  /** Lower for deterministic output. Defaults to 0.3. */
  temperature?: number;
}

export interface ClaudeCompletionResponse {
  /** Concatenated text from all text blocks in the response. */
  text: string;
  /** Raw model response id, useful for logging. */
  id: string;
  /** Model that produced the response. */
  model: string;
  /** Stop reason: "end_turn", "max_tokens", "stop_sequence", "tool_use". */
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

interface RawAnthropicResponse {
  id: string;
  model: string;
  stop_reason: string | null;
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

function envVar(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

/**
 * Get a single completion from Claude. Pulls extracted text out of the
 * response so callers don't have to walk the content blocks themselves.
 */
export async function completeWithClaude(
  req: ClaudeCompletionRequest,
): Promise<ClaudeCompletionResponse> {
  const apiKey = envVar("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  // Route through Zuplo AI Gateway if AI_GATEWAY_URL is configured. The
  // gateway proxies to Anthropic and adds caching / budgets / audit logs.
  const baseUrl = envVar("AI_GATEWAY_URL") ?? ANTHROPIC_API;

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: req.model ?? DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.3,
      system: req.system,
      messages: req.messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude completion failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as RawAnthropicResponse;
  const text = data.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("");
  return {
    text,
    id: data.id,
    model: data.model,
    stopReason: data.stop_reason,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}
