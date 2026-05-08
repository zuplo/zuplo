import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { payoutRepository } from "../repositories/payouts.ts";
import { postSlackMessage } from "../integrations/slack.ts";

interface Body {
  /** When true (default), Slack-DM the rep about the approved payout. */
  notifySlack?: boolean;
  /** Override the channel/user the message goes to (e.g. a Slack user id). */
  slackChannel?: string;
}

/**
 * Approve a payout and (optionally) ping the rep on Slack.
 *
 * Slack notification is best-effort — if it fails the payout is still
 * marked approved. The Slack response is returned alongside the payout
 * so callers can confirm delivery.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json().catch(() => ({}))) as Body;

  try {
    const updated = await payoutRepository.update(tenantId, id, {
      status: "approved",
    });

    let slack: { ok: boolean; ts?: string; error?: string } | undefined;
    if (
      body.notifySlack !== false &&
      (process.env.SLACK_BOT_TOKEN || process.env.SLACK_WEBHOOK_URL)
    ) {
      try {
        const dollars = (updated.commissionCents / 100).toFixed(2);
        const text = `Commission approved for *${updated.repEmail}* — $${dollars} for ${updated.period} (attainment ${updated.attainmentPercent}%).`;
        const result = await postSlackMessage({
          channel: body.slackChannel,
          text,
          blocks: [
            { type: "section", text: { type: "mrkdwn", text } },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Payout id: ${updated.id} • Period: ${updated.period}`,
                },
              ],
            },
          ],
        });
        slack = { ok: result.ok, ts: result.ts, error: result.error };
      } catch (err) {
        slack = { ok: false, error: (err as Error).message };
      }
    }

    return new Response(
      JSON.stringify({ ...updated, slack }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
