import { environment } from "@zuplo/runtime";

/**
 * Slack integration for vendor / contract notifications.
 *
 * Supports incoming-webhook URLs and the Web API `chat.postMessage` (when a
 * bot token is configured). One-way only — we don't subscribe to anything.
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
}

export async function postSlackMessage(msg: SlackMessage): Promise<{ ok: boolean }> {
  const botToken = environment.SLACK_BOT_TOKEN;
  if (botToken) {
    const channel =
      msg.channel ?? environment.SLACK_DEFAULT_CHANNEL ?? "#procurement";
    const res = await fetch(`${SLACK_WEB}/chat.postMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, text: msg.text, blocks: msg.blocks }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      throw new Error(`Slack chat.postMessage failed: ${json.error ?? "unknown"}`);
    }
    return { ok: true };
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
