import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import type { PurchaseRequest } from "../repositories/purchase-requests.ts";
import { approvalStepRepository, type ApprovalStep } from "../repositories/approval-steps.ts";

interface Body {
  requestId: string;
}

/**
 * Orchestrator: route_request_for_approval.
 *
 * Reads a purchase request, builds an approval chain based on the dollar
 * threshold and cost center, and inserts ApprovalStep rows. Heuristic chain:
 *   - up to $5k: cost-center manager only
 *   - up to $25k: + finance director
 *   - over $25k: + CFO
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

  return new Response(JSON.stringify({ requestId: pr.id, steps: created }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
