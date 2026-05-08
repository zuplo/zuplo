import { environment } from "@zuplo/runtime";

/**
 * Slack integration.
 *
 * Posts messages either via the Web API (chat.postMessage) using a bot token
 * or via an incoming webhook URL. Set SLACK_BOT_TOKEN + SLACK_DEFAULT_CHANNEL
 * to use the Web API path, or SLACK_WEBHOOK_URL to use the incoming-webhook
 * path. The Web API is preferred — DMing a user requires a bot token because
 * webhooks are channel-bound.
 *
 * For a user DM: pass the user's Slack user id (e.g. "U0123") as the channel.
 */

const SLACK_API = "https://slack.com/api";

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackPostMessageRequest {
  /** Channel id, channel name (#general), or user id (U0...) for a DM. */
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

export interface SlackOpenDmRequest {
  /** A Slack user id (U...) — the DM channel will be opened/found and used. */
  userId: string;
}

interface RawOpenDmResponse {
  ok: boolean;
  channel?: { id: string };
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

/**
 * Open a direct-message channel with a user and return the channel id. Required
 * before chat.postMessage will deliver a DM. Web API only — webhooks can't DM.
 */
export async function openSlackDm(
  req: SlackOpenDmRequest,
): Promise<{ channelId: string }> {
  const botToken = envVar("SLACK_BOT_TOKEN");
  if (!botToken) {
    throw new Error(
      "openSlackDm requires SLACK_BOT_TOKEN. Webhooks cannot send DMs.",
    );
  }
  const res = await fetch(`${SLACK_API}/conversations.open`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({ users: req.userId }),
  });
  const data = (await res.json()) as RawOpenDmResponse;
  if (!res.ok || !data.ok || !data.channel?.id) {
    throw new Error(
      `Slack conversations.open failed: ${res.status} ${data.error ?? "unknown"}`,
    );
  }
  return { channelId: data.channel.id };
}

/**
 * Look up a Slack user id by their email address, suitable for chat.postMessage.
 * Web API only.
 */
export async function lookupSlackUserByEmail(
  email: string,
): Promise<{ userId: string }> {
  const botToken = envVar("SLACK_BOT_TOKEN");
  if (!botToken) {
    throw new Error("lookupSlackUserByEmail requires SLACK_BOT_TOKEN.");
  }
  const res = await fetch(
    `${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { authorization: `Bearer ${botToken}` } },
  );
  const data = (await res.json()) as { ok: boolean; user?: { id: string }; error?: string };
  if (!res.ok || !data.ok || !data.user?.id) {
    throw new Error(
      `Slack users.lookupByEmail failed: ${res.status} ${data.error ?? "unknown"}`,
    );
  }
  return { userId: data.user.id };
}
