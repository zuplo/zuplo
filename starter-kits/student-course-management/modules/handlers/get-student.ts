import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { studentRepository } from "../repositories/students.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const student = await studentRepository.get(tenantId, id);
  if (!student) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Student not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(student), {
    headers: { "content-type": "application/json" },
  });
}
