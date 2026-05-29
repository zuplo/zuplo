import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { clientRepository } from "../repositories/matters.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const client = await clientRepository.get(tenantId, id);
  if (!client) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Client not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(client), {
    headers: { "content-type": "application/json" },
  });
}
