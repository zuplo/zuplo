import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { enrollmentRepository } from "../repositories/enrollments.ts";

interface Body {
  studentId: string;
  courseId: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await enrollmentRepository.create(tenantId, {
    studentId: body.studentId,
    courseId: body.courseId,
    status: "enrolled",
    enrolledAt: new Date().toISOString(),
    completedAt: null,
    finalGrade: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
