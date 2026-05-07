import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { leadRepository } from "../repositories/leads.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as { assignTo: string };

  try {
    const updated = await leadRepository.update(tenantId, id, {
      assignedTo: body.assignTo,
      assignedAt: new Date().toISOString(),
    });
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
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
}
