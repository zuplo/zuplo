/**
 * Claude (Anthropic Messages API) integration.
 *
 * Hits api.anthropic.com/v1/messages directly. If `AI_GATEWAY_URL` is set,
 * routes through Zuplo's AI Gateway instead — useful for adding rate
 * limits, prompt-injection scanning, and budget caps in front of Claude
 * without changing this code.
 *
 * Env:
 *   ANTHROPIC_API_KEY         Required when calling api.anthropic.com directly
 *   AI_GATEWAY_URL            Optional override (e.g. https://your-gateway.zuplo.app)
 *   ANTHROPIC_MODEL           Optional override; defaults to claude-sonnet-4-7
 */

const DEFAULT_MODEL = "claude-sonnet-4-7-20251022";
const ANTHROPIC_VERSION = "2023-06-01";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequest {
  system?: string;
  messages: ClaudeMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResponse {
  id: string;
  model: string;
  text: string;
  content: Array<{ type: string; text?: string }>;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const gateway = process.env.AI_GATEWAY_URL;
  const baseUrl = gateway ?? "https://api.anthropic.com";
  if (!gateway && !apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set (and AI_GATEWAY_URL is not configured)",
    );
  }

  const model = req.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.2,
      system: req.system,
      messages: req.messages,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Claude call failed: ${res.status} ${await res.text()}`,
    );
  }

  const json = (await res.json()) as {
    id: string;
    model: string;
    content: Array<{ type: string; text?: string }>;
    stop_reason: string | null;
    usage: { input_tokens: number; output_tokens: number };
  };

  const text = json.content
    .map((b) => (b.type === "text" ? b.text ?? "" : ""))
    .join("");

  return {
    id: json.id,
    model: json.model,
    text,
    content: json.content,
    stopReason: json.stop_reason,
    usage: json.usage,
  };
}
