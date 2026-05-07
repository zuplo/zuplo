import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { reportRepository } from "../repositories/reports.ts";

interface Body {
  postId: string;
  reportedBy: string;
  reason: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await reportRepository.create(tenantId, {
    postId: body.postId,
    reportedBy: body.reportedBy,
    reason: body.reason,
    status: "pending",
    resolvedAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
