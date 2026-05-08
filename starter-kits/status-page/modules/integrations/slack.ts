import { environment } from "@zuplo/runtime";

/**
 * Slack integration for status-page subscribers who consume incidents in a
 * dedicated workspace channel (e.g. enterprise customers want updates piped
 * into their #vendor-status channel).
 *
 * Each subscriber's `slackChannel` is a webhook URL — they own the URL on
 * their side, we don't store an OAuth grant. (Bot-token + chat.postMessage
 * is also supported when `SLACK_BOT_TOKEN` is set globally.)
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
  /** Per-subscriber webhook URL (preferred — they own their endpoint). */
  webhookUrl?: string;
}

export async function postSlackMessage(msg: SlackMessage): Promise<{ ok: boolean }> {
  // 1. If a per-subscriber webhook URL was provided, post there directly.
  if (msg.webhookUrl) {
    const res = await fetch(msg.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: msg.text, blocks: msg.blocks }),
    });
    if (!res.ok) {
      throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
    }
    return { ok: true };
  }

  // 2. Bot token + channel id (e.g. internal status updates into #status).
  const botToken = environment.SLACK_BOT_TOKEN;
  if (botToken) {
    const channel = msg.channel ?? environment.SLACK_DEFAULT_CHANNEL ?? "#status";
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

  // 3. Global default webhook URL fallback (env-level).
  const defaultWebhook = environment.SLACK_WEBHOOK_URL;
  if (!defaultWebhook) {
    throw new Error("Provide msg.webhookUrl, SLACK_BOT_TOKEN, or SLACK_WEBHOOK_URL");
  }
  const res = await fetch(defaultWebhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: msg.text, blocks: msg.blocks }),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
  }
  return { ok: true };
}
