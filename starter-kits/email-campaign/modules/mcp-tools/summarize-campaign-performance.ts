import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Campaign } from "../repositories/campaigns.ts";

/**
 * Orchestrator MCP tool: summarize_campaign_performance.
 *
 * Loads a campaign by id and computes engagement rates from its
 * counters. Returns a structured metrics block plus a one-paragraph
 * narrative the LLM can quote in a status update.
 */
interface Body {
  campaignId: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const campaign = await invokeJson<Campaign>(
    context,
    `/campaigns/${encodeURIComponent(body.campaignId)}`,
    { headers: auth },
  );

  // Estimated sent: opens + bounces is the conservative lower bound when no
  // separate sent counter is tracked. Real implementations should keep one.
  const estimatedSent = Math.max(
    1,
    (campaign.openCount ?? 0) + (campaign.bounceCount ?? 0),
  );
  const openRate = (campaign.openCount ?? 0) / estimatedSent;
  const clickRate = (campaign.clickCount ?? 0) / estimatedSent;
  const bounceRate = (campaign.bounceCount ?? 0) / estimatedSent;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const narrative = `Campaign "${campaign.name}" (status: ${campaign.status}) shows ` +
    `an open rate of ${pct(openRate)}, click rate of ${pct(clickRate)}, ` +
    `and bounce rate of ${pct(bounceRate)} across approximately ${estimatedSent} sends.`;

  return new Response(
    JSON.stringify({
      campaign,
      metrics: {
        openRate,
        clickRate,
        bounceRate,
        estimatedSent,
      },
      narrative,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
