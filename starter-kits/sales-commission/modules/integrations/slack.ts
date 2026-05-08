/**
 * Slack integration — post commission events into a channel / DM.
 *
 * Two transport modes, picked automatically:
 *   1. Bot token + channel id (Web API: chat.postMessage) — preferred
 *   2. Incoming webhook URL — fallback, no auth needed beyond the URL
 *
 * Used by the sales-commission kit to ping reps when a payout is approved
 * and to broadcast clawback alerts to the comp ops channel.
 *
 * Env (mode 1):
 *   SLACK_BOT_TOKEN          xoxb-...
 *   SLACK_DEFAULT_CHANNEL    Channel id (Cxxxx) used when no channel passed
 * Env (mode 2):
 *   SLACK_WEBHOOK_URL        https://hooks.slack.com/services/T/B/secret
 */

const SLACK_API = "https://slack.com/api";

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export interface SlackMessage {
  channel?: string;
  text: string;
  blocks?: SlackBlock[];
  threadTs?: string;
}

export interface SlackPostResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  webhook?: boolean;
  error?: string;
}

async function postViaBotToken(
  token: string,
  msg: SlackMessage,
): Promise<SlackPostResult> {
  const channel = msg.channel ?? process.env.SLACK_DEFAULT_CHANNEL;
  if (!channel) {
    throw new Error(
      "Slack channel not provided and SLACK_DEFAULT_CHANNEL is not set",
    );
  }
  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text: msg.text,
      blocks: msg.blocks,
      thread_ts: msg.threadTs,
    }),
  });
  const json = (await res.json()) as { ok: boolean; ts?: string; channel?: string; error?: string };
  return { ok: json.ok, ts: json.ts, channel: json.channel, error: json.error };
}

async function postViaWebhook(
  url: string,
  msg: SlackMessage,
): Promise<SlackPostResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: msg.text,
      blocks: msg.blocks,
      thread_ts: msg.threadTs,
    }),
  });
  if (!res.ok) {
    return {
      ok: false,
      webhook: true,
      error: `${res.status} ${await res.text()}`,
    };
  }
  return { ok: true, webhook: true };
}

/** Post a message — picks bot-token mode if SLACK_BOT_TOKEN is set, else webhook. */
export async function postSlackMessage(
  msg: SlackMessage,
): Promise<SlackPostResult> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (botToken) return postViaBotToken(botToken, msg);
  if (webhookUrl) return postViaWebhook(webhookUrl, msg);
  throw new Error(
    "Slack is not configured: set SLACK_BOT_TOKEN or SLACK_WEBHOOK_URL",
  );
}
