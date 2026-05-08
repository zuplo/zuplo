import { environment } from "@zuplo/runtime";

/**
 * Claude (Anthropic API) integration for triage + KB suggestion drafting.
 *
 * Wraps `POST /v1/messages`. Routes through `AI_GATEWAY_URL` when set so
 * spend tracking + caching can centralise at the gateway.
 *
 * Docs: https://docs.anthropic.com/en/api/messages
 */

const ANTHROPIC_VERSION = "2023-06-01";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequest {
  model?: string;
  system?: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResponse {
  id: string;
  model: string;
  role: "assistant";
  content: Array<{ type: "text"; text: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/** Call the Claude messages API and return the parsed response. */
export async function callClaude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const apiKey = environment.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const base = environment.AI_GATEWAY_URL ?? "https://api.anthropic.com";

  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: req.model ?? environment.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
      system: req.system,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature,
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude messages call failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ClaudeResponse;
}

/** Concatenate text content blocks into a single string. */
export function claudeText(res: ClaudeResponse): string {
  return res.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/** Helper that asks Claude to return strict JSON. */
export async function callClaudeJson<T>(
  req: ClaudeRequest & { jsonSchemaHint?: string },
): Promise<T> {
  const system = [
    req.system ?? "",
    "Respond with a single JSON object and nothing else. No markdown, no prose, no code fences.",
    req.jsonSchemaHint ? `Schema:\n${req.jsonSchemaHint}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await callClaude({ ...req, system });
  const text = claudeText(res).trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Claude did not return JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}
