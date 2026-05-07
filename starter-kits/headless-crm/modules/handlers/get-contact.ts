import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { contactRepository } from "../repositories/contacts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const contact = await contactRepository.get(tenantId, id);
  if (!contact) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Contact not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(contact), { headers: { "content-type": "application/json" } });
}
