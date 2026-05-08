import { environment } from "@zuplo/runtime";

/**
 * Claude (Anthropic Messages API) integration.
 *
 * Sends a single-turn or multi-turn message to Claude and returns the
 * concatenated text content. Routes through `ANTHROPIC_API_BASE` if set
 * (e.g. Zuplo's AI Gateway URL) — otherwise hits api.anthropic.com.
 *
 * Docs: https://docs.claude.com/en/api/messages
 */

const DEFAULT_BASE = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_VERSION = "2023-06-01";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeRequest {
  /** Defaults to env `CLAUDE_MODEL` or `claude-sonnet-4-5`. */
  model?: string;
  system?: string;
  messages: ClaudeMessage[];
  /** Defaults to 1024. */
  maxTokens?: number;
  /** 0–1; lower = more deterministic. */
  temperature?: number;
}

export interface ClaudeRawResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{ type: "text"; text: string } | { type: string }>;
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ClaudeTextResponse {
  text: string;
  raw: ClaudeRawResponse;
}

function envValue(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

/**
 * Call the Claude Messages API and return the joined text content.
 */
export async function callClaude(
  req: ClaudeRequest,
): Promise<ClaudeTextResponse> {
  const apiKey = envValue("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  // Route through Zuplo's AI Gateway if configured; otherwise direct.
  const base =
    envValue("AI_GATEWAY_URL") ??
    envValue("ANTHROPIC_API_BASE") ??
    DEFAULT_BASE;
  const url = `${base.replace(/\/$/, "")}/v1/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": DEFAULT_VERSION,
    },
    body: JSON.stringify({
      model: req.model ?? envValue("CLAUDE_MODEL") ?? DEFAULT_MODEL,
      system: req.system,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature,
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude API failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as ClaudeRawResponse;
  const text = json.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return { text, raw: json };
}
