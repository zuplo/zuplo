import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { entryRepository } from "../repositories/entries.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const entry = await entryRepository.get(tenantId, id);
  if (!entry) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Entry not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(entry), {
    headers: { "content-type": "application/json" },
  });
}
