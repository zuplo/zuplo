import { environment } from "@zuplo/runtime";

/**
 * Slack integration — posts a message to a channel via an incoming webhook
 * URL or via the chat.postMessage API. Used by the lead-capture-forms kit
 * to notify a sales channel when a new submission lands (or an inbound lead
 * scores high).
 *
 * Set either:
 *   SLACK_WEBHOOK_URL — incoming webhook URL (preferred for one-channel sends)
 *   SLACK_BOT_TOKEN + SLACK_CHANNEL — token + channel id for chat.postMessage
 */

const SLACK_API = "https://slack.com/api";

export interface SlackBlock {
  type: string;
  // Slack blocks have many shapes — keep it open.
  [key: string]: unknown;
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  channel?: string;
  threadTs?: string;
}

export interface SlackPostResult {
  ok: boolean;
  ts?: string;
  channel?: string;
}

/**
 * Send a message to Slack. Prefers SLACK_WEBHOOK_URL; falls back to
 * chat.postMessage with SLACK_BOT_TOKEN.
 */
export async function postToSlack(
  msg: SlackMessage,
): Promise<SlackPostResult> {
  const env = environment as Record<string, string | undefined>;
  const webhookUrl = env.SLACK_WEBHOOK_URL;

  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: msg.text,
        blocks: msg.blocks,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Slack webhook failed: ${res.status} ${await res.text()}`,
      );
    }
    return { ok: true };
  }

  const token = env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "Slack credentials missing. Set SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN.",
    );
  }
  const channel = msg.channel ?? env.SLACK_CHANNEL;
  if (!channel) {
    throw new Error(
      "Slack channel missing. Pass `channel` or set SLACK_CHANNEL.",
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
      text: msg.text,
      blocks: msg.blocks,
      thread_ts: msg.threadTs,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Slack chat.postMessage HTTP failed: ${res.status} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { ok: boolean; ts?: string; channel?: string; error?: string };
  if (!body.ok) {
    throw new Error(`Slack chat.postMessage failed: ${body.error ?? "unknown"}`);
  }
  return { ok: true, ts: body.ts, channel: body.channel };
}

/**
 * Build a tidy Slack message for a fresh form submission. Used by the
 * `route_submission_to_owner` orchestrator and the new submission webhook.
 */
export function buildSubmissionAlert(args: {
  formName: string;
  submitterEmail: string | null;
  score: number | null;
  routedTo: string | null;
  payloadPreview: Record<string, unknown>;
  submissionId: string;
}): SlackMessage {
  const { formName, submitterEmail, score, routedTo, payloadPreview, submissionId } = args;
  const headline = score !== null
    ? `New lead (${score}/100) — ${formName}`
    : `New submission — ${formName}`;

  const fields: SlackBlock = {
    type: "section",
    fields: [
      submitterEmail
        ? { type: "mrkdwn", text: `*Email:*\n${submitterEmail}` }
        : { type: "mrkdwn", text: "*Email:*\n_unknown_" },
      routedTo
        ? { type: "mrkdwn", text: `*Owner:*\n${routedTo}` }
        : { type: "mrkdwn", text: "*Owner:*\n_unassigned_" },
    ],
  };

  const previewLines = Object.entries(payloadPreview)
    .slice(0, 6)
    .map(([k, v]) => `• *${k}*: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");

  return {
    text: headline,
    blocks: [
      { type: "header", text: { type: "plain_text", text: headline } },
      fields,
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: previewLines || "_no payload preview_",
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `submissionId: \`${submissionId}\`` },
        ],
      },
    ],
  };
}
