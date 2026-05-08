import { environment } from "@zuplo/runtime";

/**
 * Slack integration.
 *
 * Posts notifications via Incoming Webhook (preferred for one-way alerts) or
 * via the Web API `chat.postMessage` when a bot token is configured (required
 * for DMs).
 *
 * Docs: https://api.slack.com/messaging/webhooks
 *       https://api.slack.com/methods/chat.postMessage
 */

const SLACK_WEB = "https://slack.com/api";

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  text: string;
  channel?: string;
  blocks?: SlackBlock[];
  thread_ts?: string;
}

/**
 * Send a message to Slack. Uses the bot token (`SLACK_BOT_TOKEN`) when
 * available; falls back to the incoming webhook URL.
 */
export async function postSlackMessage(
  msg: SlackMessage,
): Promise<{ ok: boolean; ts?: string; channel?: string }> {
  const botToken = environment.SLACK_BOT_TOKEN;
  if (botToken) {
    const channel =
      msg.channel ?? environment.SLACK_DEFAULT_CHANNEL ?? "#it-helpdesk";
    const res = await fetch(`${SLACK_WEB}/chat.postMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({
        channel,
        text: msg.text,
        blocks: msg.blocks,
        thread_ts: msg.thread_ts,
      }),
    });
    const json = (await res.json()) as {
      ok: boolean;
      ts?: string;
      channel?: string;
      error?: string;
    };
    if (!json.ok) {
      throw new Error(`Slack chat.postMessage failed: ${json.error ?? "unknown"}`);
    }
    return { ok: true, ts: json.ts, channel: json.channel };
  }

  const webhook = environment.SLACK_WEBHOOK_URL;
  if (!webhook) throw new Error("Set SLACK_BOT_TOKEN or SLACK_WEBHOOK_URL");
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: msg.text, blocks: msg.blocks }),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
  }
  return { ok: true };
}

/**
 * Look up a Slack user by email and DM them. Required for assignee
 * notifications.
 */
export async function dmSlackUserByEmail(
  email: string,
  msg: Omit<SlackMessage, "channel">,
): Promise<{ ok: boolean; ts?: string }> {
  const botToken = environment.SLACK_BOT_TOKEN;
  if (!botToken) throw new Error("SLACK_BOT_TOKEN is required to DM users by email");
  const lookup = await fetch(
    `${SLACK_WEB}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { authorization: `Bearer ${botToken}` } },
  );
  const lookupJson = (await lookup.json()) as {
    ok: boolean;
    user?: { id: string };
    error?: string;
  };
  if (!lookupJson.ok || !lookupJson.user) {
    throw new Error(`Slack user lookup failed for ${email}: ${lookupJson.error ?? "unknown"}`);
  }
  return postSlackMessage({ ...msg, channel: lookupJson.user.id });
}
