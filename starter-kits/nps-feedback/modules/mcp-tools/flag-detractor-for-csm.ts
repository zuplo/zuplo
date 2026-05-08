import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Response_ } from "../repositories/responses.ts";
import { postSlackMessage } from "../integrations/slack.ts";

interface Body {
  segment?: string;
  daysBack?: number;
  /**
   * When true, posts the top detractor list to Slack so the CSM team sees
   * it without polling. Skipped silently if Slack isn't configured.
   */
  postToSlack?: boolean;
  /** Override the channel/user the message goes to. */
  slackChannel?: string;
  /** Cap the number of detractors included in the Slack message. Defaults to 10. */
  slackTopN?: number;
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Orchestrator: flag_detractor_for_csm.
 *
 * Returns recent detractor responses (score 0..6) where `followedUp` is
 * still false. Optionally pings a Slack channel so the CSM team sees the
 * latest detractors without checking the API.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const auth = request.headers.get("authorization") ?? "";
  const daysBack = body.daysBack ?? 14;
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString();

  const detractors: Response_[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200", category: "detractor" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<Page<Response_>>(context, `/responses?${qs}`, {
      headers: { authorization: auth },
    });
    for (const r of page.items) {
      if (r.followedUp) continue;
      if (r.respondedAt < cutoff) continue;
      if (body.segment && r.segment !== body.segment) continue;
      detractors.push(r);
    }
    cursor = page.nextCursor;
    if (detractors.length > 1000) break;
  } while (cursor);

  // Optional Slack escalation.
  let slack: { ok: boolean; ts?: string; error?: string } | undefined;
  const slackConfigured =
    !!process.env.SLACK_BOT_TOKEN || !!process.env.SLACK_WEBHOOK_URL;
  if (body.postToSlack && slackConfigured && detractors.length > 0) {
    const topN = Math.max(1, Math.min(50, body.slackTopN ?? 10));
    const top = detractors.slice(0, topN);
    const heading = `${detractors.length} unactioned detractor${detractors.length === 1 ? "" : "s"} in the last ${daysBack}d${body.segment ? ` (segment: ${body.segment})` : ""}`;
    const lines = top.map(
      (r) =>
        `• score ${r.score}${r.segment ? ` (${r.segment})` : ""} — ${r.comment ? r.comment.slice(0, 140) : "(no comment)"}`,
    );
    try {
      const result = await postSlackMessage({
        channel: body.slackChannel,
        text: heading,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*${heading}*` } },
          {
            type: "section",
            text: { type: "mrkdwn", text: lines.join("\n") },
          },
        ],
      });
      slack = { ok: result.ok, ts: result.ts, error: result.error };
    } catch (err) {
      slack = { ok: false, error: (err as Error).message };
    }
  }

  return new Response(
    JSON.stringify({
      filter: { segment: body.segment ?? null, daysBack },
      detractorCount: detractors.length,
      detractors,
      slack,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
