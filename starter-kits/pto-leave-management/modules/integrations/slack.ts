import { environment } from "@zuplo/runtime";

/**
 * Slack integration.
 *
 * Posts messages either via the Web API (chat.postMessage) using a bot token
 * or via an incoming webhook URL. Set SLACK_BOT_TOKEN + SLACK_DEFAULT_CHANNEL
 * to use the Web API path, or SLACK_WEBHOOK_URL to use the incoming-webhook
 * path. The Web API is preferred — it returns an addressable message ts you
 * can thread on later.
 */

const SLACK_API = "https://slack.com/api";

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackPostMessageRequest {
  /** Channel id or name (e.g. "#general") or a user id for a DM. Required for Web API. */
  channel?: string;
  /** Plain text fallback / body. */
  text: string;
  /** Optional Block Kit blocks for rich formatting. */
  blocks?: SlackBlock[];
  /** Reply in a thread on this parent ts. */
  thread_ts?: string;
}

export interface SlackPostMessageResponse {
  ok: boolean;
  channel?: string;
  ts?: string;
  error?: string;
}

function envVar(name: string): string | undefined {
  return (environment as Record<string, string | undefined>)[name];
}

/**
 * Post a Slack message. Routes to Web API when SLACK_BOT_TOKEN is set,
 * otherwise falls back to SLACK_WEBHOOK_URL. Throws if neither is configured
 * or the call fails.
 */
export async function postSlackMessage(
  req: SlackPostMessageRequest,
): Promise<SlackPostMessageResponse> {
  const botToken = envVar("SLACK_BOT_TOKEN");
  const webhookUrl = envVar("SLACK_WEBHOOK_URL");

  if (botToken) {
    const channel = req.channel ?? envVar("SLACK_DEFAULT_CHANNEL");
    if (!channel) {
      throw new Error(
        "Slack Web API: channel required (pass req.channel or set SLACK_DEFAULT_CHANNEL).",
      );
    }
    const res = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({
        channel,
        text: req.text,
        blocks: req.blocks,
        thread_ts: req.thread_ts,
      }),
    });
    const data = (await res.json()) as SlackPostMessageResponse;
    if (!res.ok || !data.ok) {
      throw new Error(
        `Slack chat.postMessage failed: ${res.status} ${data.error ?? "unknown"}`,
      );
    }
    return data;
  }

  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: req.text,
        blocks: req.blocks,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Slack webhook failed: ${res.status} ${await res.text()}`,
      );
    }
    return { ok: true };
  }

  throw new Error(
    "No Slack credentials. Set SLACK_BOT_TOKEN (Web API) or SLACK_WEBHOOK_URL (incoming webhook).",
  );
}
