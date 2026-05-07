import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { courseRepository } from "../repositories/courses.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const course = await courseRepository.get(tenantId, id);
  if (!course) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Course not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(course), {
    headers: { "content-type": "application/json" },
  });
}
