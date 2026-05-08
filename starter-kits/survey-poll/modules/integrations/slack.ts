import { environment } from "@zuplo/runtime";

/**
 * Slack integration.
 *
 * Posts messages to a Slack channel via either an incoming webhook URL
 * (`SLACK_WEBHOOK_URL`) or via the Web API `chat.postMessage` endpoint
 * using a bot token (`SLACK_BOT_TOKEN`). Webhook is preferred when set
 * because it requires no scopes; bot-token mode is used when posting to
 * arbitrary channels (`SLACK_DEFAULT_CHANNEL`) is required.
 */

const SLACK_API = "https://slack.com/api";

export interface SlackBlock {
  type: string;
  // Slack blocks are loose JSON; let callers pass through any block kit JSON.
  [key: string]: unknown;
}

export interface SlackMessageRequest {
  /** Channel ID or name (e.g. `#detractors`). Required for bot-token mode, ignored for webhooks. */
  channel?: string;
  /** Plain text body. Always include something in case a client can't render blocks. */
  text: string;
  /** Optional rich content. */
  blocks?: SlackBlock[];
  /** Optional thread parent timestamp. */
  threadTs?: string;
}

export interface SlackMessageResponse {
  ok: true;
  channel?: string;
  ts?: string;
}

function envValue(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

/**
 * Send a message to Slack. Picks webhook mode if `SLACK_WEBHOOK_URL` is
 * configured, otherwise falls back to bot-token mode.
 */
export async function sendSlackMessage(
  req: SlackMessageRequest,
): Promise<SlackMessageResponse> {
  const webhookUrl = envValue("SLACK_WEBHOOK_URL");
  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: req.text,
        blocks: req.blocks,
        thread_ts: req.threadTs,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Slack webhook send failed: ${res.status} ${await res.text()}`,
      );
    }
    return { ok: true };
  }

  const token = envValue("SLACK_BOT_TOKEN");
  if (!token) {
    throw new Error(
      "No Slack credentials configured: set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN.",
    );
  }
  const channel = req.channel ?? envValue("SLACK_DEFAULT_CHANNEL");
  if (!channel) {
    throw new Error(
      "No Slack channel: pass `channel` or set SLACK_DEFAULT_CHANNEL.",
    );
  }

  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      text: req.text,
      blocks: req.blocks,
      thread_ts: req.threadTs,
    }),
  });
  const json = (await res.json()) as {
    ok: boolean;
    error?: string;
    channel?: string;
    ts?: string;
  };
  if (!res.ok || !json.ok) {
    throw new Error(
      `Slack chat.postMessage failed: ${res.status} ${json.error ?? "unknown error"}`,
    );
  }
  return { ok: true, channel: json.channel, ts: json.ts };
}
