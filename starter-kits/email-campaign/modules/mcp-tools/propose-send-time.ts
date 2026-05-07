import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Campaign } from "../repositories/campaigns.ts";

/**
 * Orchestrator MCP tool: propose_send_time.
 *
 * Looks at recent campaigns that have already been sent, derives a
 * (dayOfWeek, hourUtc) → openRate histogram, and recommends the slot with
 * the highest historical open rate. Returns the proposed slot + the full
 * histogram sorted by open rate descending so callers can show alternatives.
 *
 * If no usable history exists, falls back to "Tuesday 14:00 UTC" — a
 * reasonable industry-default warm-start.
 */
interface Body {
  lookbackDays?: number;
}

interface CampaignPage {
  items: Campaign[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const lookbackDays = Math.max(1, Math.min(365, body.lookbackDays ?? 30));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const campaigns: Campaign[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<CampaignPage>(context, `/campaigns?${qs}`, { headers: auth });
    campaigns.push(...page.items);
    cursor = page.nextCursor;
    if (campaigns.length > 5000) break;
  } while (cursor);

  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const buckets = new Map<string, { dayOfWeek: number; hourUtc: number; sends: number; opens: number }>();

  for (const campaign of campaigns) {
    if (campaign.status !== "sent" || !campaign.sentAt) continue;
    const sentAtMs = Date.parse(campaign.sentAt);
    if (!Number.isFinite(sentAtMs) || sentAtMs < cutoff) continue;
    const sentAt = new Date(sentAtMs);
    const dayOfWeek = sentAt.getUTCDay();
    const hourUtc = sentAt.getUTCHours();
    const key = `${dayOfWeek}:${hourUtc}`;
    const bucket = buckets.get(key) ?? { dayOfWeek, hourUtc, sends: 0, opens: 0 };
    bucket.sends += 1;
    bucket.opens += campaign.openCount ?? 0;
    buckets.set(key, bucket);
  }

  const histogram = [...buckets.values()]
    .map((b) => ({
      dayOfWeek: b.dayOfWeek,
      hourUtc: b.hourUtc,
      sends: b.sends,
      opens: b.opens,
      openRate: b.sends > 0 ? b.opens / b.sends : 0,
    }))
    .sort((a, b) => b.openRate - a.openRate);

  const top = histogram[0];
  const fallback = { dayOfWeek: 2, hourUtc: 14, sends: 0, opens: 0, openRate: 0 };
  const chosen = top ?? fallback;

  return new Response(
    JSON.stringify({
      proposedDayOfWeek: chosen.dayOfWeek,
      proposedHourUtc: chosen.hourUtc,
      openRate: chosen.openRate,
      sampleSize: chosen.sends,
      histogram,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
