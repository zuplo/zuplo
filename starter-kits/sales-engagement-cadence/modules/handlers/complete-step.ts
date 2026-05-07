import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
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

  try {
    const updated = await enrollmentRepository.update(tenantId, id, {
      currentStep: enrollment.currentStep + 1,
      lastActivityAt: new Date().toISOString(),
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
