import { environment } from "@zuplo/runtime";

/**
 * Slack integration for incident broadcast.
 *
 * Posts to the configured channel via Incoming Webhook (one-way) or via the
 * Web API `chat.postMessage` when a bot token is configured (returns the
 * thread ts so we can thread updates onto the initial alert).
 *
 * Docs:
 *   - https://api.slack.com/messaging/webhooks
 *   - https://api.slack.com/methods/chat.postMessage
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
  username?: string;
  icon_emoji?: string;
}

export interface SlackPostResult {
  ok: boolean;
  ts?: string;
  channel?: string;
}

/** Post to Slack — bot token preferred (returns ts for threading). */
export async function postSlackMessage(msg: SlackMessage): Promise<SlackPostResult> {
  const botToken = environment.SLACK_BOT_TOKEN;
  if (botToken) {
    const channel =
      msg.channel ?? environment.SLACK_INCIDENT_CHANNEL ?? "#incidents";
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
        username: msg.username,
        icon_emoji: msg.icon_emoji ?? ":rotating_light:",
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
