import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { formRepository } from "../repositories/forms.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const form = await formRepository.get(tenantId, id);
  if (!form) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Form not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(form), {
    headers: { "content-type": "application/json" },
  });
}
