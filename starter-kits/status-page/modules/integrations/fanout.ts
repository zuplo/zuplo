import type { ZuploContext } from "@zuplo/runtime";
import { subscriberRepository, type Subscriber } from "../repositories/subscribers.ts";
import { sendResendEmail } from "./resend.ts";
import { sendTwilioSms } from "./twilio.ts";
import { postSlackMessage } from "./slack.ts";

/**
 * Fanout helper.
 *
 * Iterate all subscribers in the tenant, filter by:
 *   - whether their `notifyOnImpact` admits this incident's impact level
 *   - whether they're scoped to the affected components (or all)
 * and dispatch in parallel to each enabled channel (email/sms/slack).
 */

const IMPACT_RANK: Record<string, number> = {
  none: 0,
  minor: 1,
  major: 2,
  critical: 3,
};

export interface FanoutEvent {
  /** Notification subject + first line. */
  subject: string;
  /** Plain-text body. */
  text: string;
  /** Optional richer HTML body (email only). */
  html?: string;
  /** Incident impact level — used to filter subscribers. */
  impact: "minor" | "major" | "critical";
  /** Affected component slugs. Subscribers scoped to specific components
   *  only get pinged when there's an intersection. Empty = all components. */
  affectedComponents: string[];
  /** Stable id for this event — e.g. incident id + update id. */
  dedupKey: string;
}

export interface FanoutResult {
  attempted: number;
  delivered: number;
  errors: Array<{ subscriberId: string; channel: string; message: string }>;
}

function shouldNotify(sub: Subscriber, evt: FanoutEvent): boolean {
  if (sub.notifyOnImpact === "none") return false;
  const subThreshold = IMPACT_RANK[sub.notifyOnImpact] ?? 1;
  const eventLevel = IMPACT_RANK[evt.impact] ?? 1;
  if (eventLevel < subThreshold) return false;
  if (sub.components.length > 0 && evt.affectedComponents.length > 0) {
    const overlap = sub.components.some((c) => evt.affectedComponents.includes(c));
    if (!overlap) return false;
  }
  return true;
}

export async function fanoutToSubscribers(
  tenantId: string,
  evt: FanoutEvent,
  context: ZuploContext,
): Promise<FanoutResult> {
  const result: FanoutResult = { attempted: 0, delivered: 0, errors: [] };
  let cursor: string | null | undefined;
  do {
    const page = await subscriberRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
    });
    const tasks: Array<Promise<void>> = [];
    for (const sub of page.items) {
      if (!shouldNotify(sub, evt)) continue;
      const channels = sub.channels.length > 0 ? sub.channels : ["email"];
      for (const channel of channels) {
        result.attempted += 1;
        tasks.push(
          deliver(sub, channel, evt)
            .then(() => {
              result.delivered += 1;
            })
            .catch((err: Error) => {
              context.log.warn(
                `Fanout ${channel} failed for ${sub.id}: ${err.message}`,
              );
              result.errors.push({
                subscriberId: sub.id,
                channel,
                message: err.message,
              });
            }),
        );
      }
    }
    await Promise.all(tasks);
    cursor = page.nextCursor;
  } while (cursor);
  return result;
}

async function deliver(
  sub: Subscriber,
  channel: "email" | "sms" | "slack",
  evt: FanoutEvent,
): Promise<void> {
  switch (channel) {
    case "email": {
      await sendResendEmail({
        to: sub.email,
        subject: evt.subject,
        text: evt.text,
        html: evt.html,
        tags: [{ name: "dedup", value: evt.dedupKey }],
      });
      return;
    }
    case "sms": {
      if (!sub.phone) throw new Error("sms channel requires sub.phone");
      await sendTwilioSms({ to: sub.phone, body: `${evt.subject}\n${evt.text}`.slice(0, 1500) });
      return;
    }
    case "slack": {
      if (!sub.slackWebhookUrl) throw new Error("slack channel requires sub.slackWebhookUrl");
      await postSlackMessage({
        webhookUrl: sub.slackWebhookUrl,
        text: `*${evt.subject}*\n${evt.text}`,
      });
      return;
    }
  }
}
