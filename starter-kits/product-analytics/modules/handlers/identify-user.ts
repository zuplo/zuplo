import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { userRepository } from "../repositories/events.ts";

interface Body {
  identifiedEmail?: string | null;
  traits?: Record<string, unknown>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  const patch: Record<string, unknown> = {
    lastSeenAt: new Date().toISOString(),
  };
  if (body.identifiedEmail !== undefined) {
    patch.identifiedEmail = body.identifiedEmail;
  }
  if (body.traits !== undefined) {
    // Merge new traits into existing ones to avoid clobbering on a partial
    // identify. The repository update method patches the persisted record.
    const existing = await userRepository.get(tenantId, id);
    if (existing) {
      patch.traits = { ...(existing.traits ?? {}), ...body.traits };
    } else {
      patch.traits = body.traits;
    }
  }

  try {
    const updated = await userRepository.update(tenantId, id, patch);
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
