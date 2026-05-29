import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { leaveRequestRepository } from "../repositories/leave-requests.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const leaveRequest = await leaveRequestRepository.get(tenantId, id);
  if (!leaveRequest) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Leave request not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(leaveRequest), {
    headers: { "content-type": "application/json" },
  });
}
