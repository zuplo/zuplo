import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import { pageRepository } from "../repositories/pages.ts";

/**
 * Archive a page (soft-delete via status=archived). The row is retained
 * so revisions and comments can still be audited, but it disappears from
 * default listings.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;

  try {
    await pageRepository.update(tenantId, id, {
      status: "archived",
      lastEditedAt: new Date().toISOString(),
    });
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
