import { environment } from "@zuplo/runtime";

/**
 * Claude (Anthropic API) integration.
 *
 * Wraps `POST /v1/messages` for the orchestrator MCP tools. The base URL
 * defaults to api.anthropic.com but routes through `AI_GATEWAY_URL` if set
 * (e.g. https://gateway.example.com/anthropic) so you can centralise spend
 * tracking, caching, and rate-limiting at your gateway.
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
  /** Default 1024. */
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

/**
 * Call the Claude messages API and return the parsed response.
 */
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

/**
 * Helper: extract concatenated text from a Claude response.
 */
export function claudeText(res: ClaudeResponse): string {
  return res.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/**
 * Helper: ask Claude to return strict JSON. Wraps the system prompt with a
 * JSON-only directive and parses the first JSON object in the response.
 * Throws if the result isn't valid JSON.
 */
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
  // Defensive: strip optional code fence and find first { .. last }.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Claude did not return JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}
