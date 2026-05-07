import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { subscriberRepository } from "../repositories/subscribers.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;

  try {
    await subscriberRepository.delete(tenantId, id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({
          error: { type: "not_found", message: err.message },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }

  return new Response(null, { status: 204 });
}
