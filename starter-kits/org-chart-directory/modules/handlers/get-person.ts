import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { personRepository } from "../repositories/people.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const person = await personRepository.get(tenantId, id);
  if (!person) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Person not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(person), {
    headers: { "content-type": "application/json" },
  });
}
