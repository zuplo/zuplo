import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import type { PurchaseRequest } from "../repositories/purchase-requests.ts";
import { approvalStepRepository, type ApprovalStep } from "../repositories/approval-steps.ts";
import {
  postSlackMessage,
  lookupSlackUserByEmail,
  defaultProcurementChannel,
} from "../integrations/slack.ts";

interface Body {
  requestId: string;
  /** Skip Slack notification even if SLACK_BOT_TOKEN is set. Defaults to false. */
  skipSlack?: boolean;
}

/**
 * Orchestrator: route_request_for_approval.
 *
 * Reads a purchase request, builds an approval chain based on the dollar
 * threshold and cost center, and inserts ApprovalStep rows. Heuristic chain:
 *   - up to $5k: cost-center manager only
 *   - up to $25k: + finance director
 *   - over $25k: + CFO
 *
 * Pings the FIRST approver in Slack so the chain can actually start
 * moving. Subsequent approvers get pinged when the previous one approves
 * (you'd wire that into approve_purchase_request).
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const pr = await invokeJson<PurchaseRequest>(
    context,
    `/purchase-requests/${body.requestId}`,
    { headers: { authorization: auth } },
  );

  const chain: string[] = [`manager+${pr.costCenter}@example.com`];
  if (pr.totalCents > 500000) chain.push("finance-director@example.com");
  if (pr.totalCents > 2500000) chain.push("cfo@example.com");

  const created: ApprovalStep[] = [];
  for (let i = 0; i < chain.length; i++) {
    const step = await approvalStepRepository.create(tenantId, {
      purchaseRequestId: pr.id,
      stepOrder: i + 1,
      approverEmail: chain[i],
      status: "pending",
      decidedAt: null,
    });
    created.push(step);
  }

  let slackTs: string | null = null;
  if (!body.skipSlack && environment.SLACK_BOT_TOKEN && created.length > 0) {
    const firstApprover = created[0].approverEmail;
    try {
      const user = await lookupSlackUserByEmail(firstApprover);
      const target = user?.id ?? defaultProcurementChannel();
      const total = (pr.totalCents / 100).toFixed(2);
      const next = created
        .slice(1)
        .map((s, idx) => `${idx + 2}. ${s.approverEmail}`)
        .join("\n");
      const subsequent = next ? `\n\n*Then:*\n${next}` : "";
      const sent = await postSlackMessage({
        channel: target,
        text: `Purchase request ${pr.id} (${pr.currency} ${total}) needs your approval`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Purchase request needs your approval*\n• Request: \`${pr.id}\`\n• Cost center: ${pr.costCenter}\n• Total: ${pr.currency} ${total}${subsequent}`,
            },
          },
        ],
      });
      slackTs = sent.ts ?? null;
    } catch (err) {
      context.log.error(
        `route_request_for_approval slack ping failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return new Response(
    JSON.stringify({ requestId: pr.id, steps: created, slackTs }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
