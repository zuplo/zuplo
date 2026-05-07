import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { entryRepository, type Entry } from "../repositories/entries.ts";

interface Body {
  title?: string;
  body?: string;
  excerpt?: string;
  slug?: string;
  locale?: string;
  status?: Entry["status"];
  authorEmail?: string;
  scheduledFor?: string | null;
  fields?: Record<string, unknown>;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const patch = (await request.json()) as Body;

  try {
    const updated = await entryRepository.update(tenantId, id, {
      ...patch,
      updatedAt: new Date().toISOString(),
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
