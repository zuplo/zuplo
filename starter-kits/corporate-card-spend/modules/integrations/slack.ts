import { environment } from "@zuplo/runtime";

/**
 * Slack Web API integration (chat.postMessage + chat.postEphemeral).
 *
 * Used for memo-chasing: post a friendly DM/channel ping to the cardholder
 * for each uncoded transaction so they can reply with a memo from Slack.
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

/**
 * Look up a Slack user id by email. Used so the agent can DM a cardholder
 * about a missing memo using only their work email.
 */
export async function lookupSlackUserByEmail(
  email: string,
): Promise<{ id: string; name: string; real_name: string } | null> {
  const token = environment.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");
  const res = await fetch(
    `${SLACK_API}/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    ok: boolean;
    user?: { id: string; name: string; real_name: string };
  };
  return data.ok && data.user ? data.user : null;
}

export function defaultFinanceChannel(): string {
  return environment.SLACK_FINANCE_CHANNEL ?? "#finance";
}
