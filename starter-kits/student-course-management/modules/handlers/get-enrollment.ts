import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { enrollmentRepository } from "../repositories/enrollments.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const enrollment = await enrollmentRepository.get(tenantId, id);
  if (!enrollment) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Enrollment not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(enrollment), {
    headers: { "content-type": "application/json" },
  });
}
