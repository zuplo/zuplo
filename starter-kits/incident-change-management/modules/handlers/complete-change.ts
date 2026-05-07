import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { changeRepository, type Change } from "../repositories/incidents.ts";

interface Body {
  outcome: "completed" | "failed" | "rolled_back";
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  const status: Change["status"] =
    body.outcome === "completed" ? "completed" :
    body.outcome === "failed" ? "failed" : "rolled_back";

  try {
    const updated = await changeRepository.update(tenantId, id, {
      status,
      completedAt: new Date().toISOString(),
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
