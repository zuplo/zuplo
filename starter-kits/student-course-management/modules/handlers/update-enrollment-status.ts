import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import {
  enrollmentRepository,
  type Enrollment,
} from "../repositories/enrollments.ts";

interface Body {
  status: Enrollment["status"];
  finalGrade?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  const patch: Partial<Enrollment> = { status: body.status };
  if (body.status === "completed") {
    patch.completedAt = new Date().toISOString();
    if (body.finalGrade !== undefined) patch.finalGrade = body.finalGrade;
  }

  try {
    const updated = await enrollmentRepository.update(tenantId, id, patch);
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
