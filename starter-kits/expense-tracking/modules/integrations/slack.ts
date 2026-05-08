import { environment } from "@zuplo/runtime";

/**
 * Slack Web API integration (chat.postMessage).
 *
 * We send approval/violation notifications to a finance channel using a bot
 * token. Auth: `Authorization: Bearer xoxb-...`.
 *
 * For interactive approvals (button click -> back to gateway) you'd add a
 * separate `/webhooks/slack/interactions` route — this kit ships the outbound
 * notification path only, which is the part that actually saves time.
 */

const SLACK_API = "https://slack.com/api";

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  fields?: { type: string; text: string }[];
  elements?: unknown[];
  accessory?: unknown;
}

export interface PostMessageRequest {
  channel: string;
  text: string;
  blocks?: SlackBlock[];
  thread_ts?: string;
}

export interface PostMessageResponse {
  ok: boolean;
  channel?: string;
  ts?: string;
  error?: string;
}

export async function postSlackMessage(
  req: PostMessageRequest,
): Promise<PostMessageResponse> {
  const token = environment.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");

  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`Slack chat.postMessage HTTP ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as PostMessageResponse;
  if (!data.ok) {
    throw new Error(`Slack chat.postMessage failed: ${data.error}`);
  }
  return data;
}

/** Default channel for finance/approval notifications. */
export function defaultFinanceChannel(): string {
  return environment.SLACK_FINANCE_CHANNEL ?? "#finance";
}
