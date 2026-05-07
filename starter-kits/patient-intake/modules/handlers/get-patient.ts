import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { patientRepository } from "../repositories/patients.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const patient = await patientRepository.get(tenantId, id);
  if (!patient) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Patient not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(patient), {
    headers: { "content-type": "application/json" },
  });
}
