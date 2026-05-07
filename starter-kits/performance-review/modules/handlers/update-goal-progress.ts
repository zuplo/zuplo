import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import {
  goalRepository,
  type Goal,
} from "../repositories/goals.ts";

interface Body {
  progress: number;
  status?: Goal["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;
  const progress = Math.max(0, Math.min(100, body.progress));

  const patch: Partial<Goal> = { progress };
  if (body.status) {
    patch.status = body.status;
  } else if (progress >= 100) {
    patch.status = "completed";
  }

  try {
    const updated = await goalRepository.update(tenantId, id, patch);
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
