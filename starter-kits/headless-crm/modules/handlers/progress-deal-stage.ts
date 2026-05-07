import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import type { DealStage } from "../repositories/deals.ts";
import { dealRepository } from "../repositories/deals.ts";

interface Body {
  stage: DealStage;
  probability?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;
  try {
    const updated = await dealRepository.update(tenantId, id, {
      stage: body.stage,
      ...(body.probability !== undefined ? { probability: body.probability } : {}),
      updatedAt: new Date().toISOString(),
    });
    return new Response(JSON.stringify(updated), { headers: { "content-type": "application/json" } });
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
