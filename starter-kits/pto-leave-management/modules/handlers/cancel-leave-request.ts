import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { leaveRequestRepository } from "../repositories/leave-requests.ts";

/**
 * Soft-delete via status=cancelled. The row is retained for audit.
 * Returns 204 to match the typical DELETE contract clients expect.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;

  try {
    await leaveRequestRepository.update(tenantId, id, {
      status: "cancelled",
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }

  return new Response(null, { status: 204 });
}
