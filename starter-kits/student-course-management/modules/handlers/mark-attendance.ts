import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  attendanceRepository,
  type Attendance,
} from "../repositories/attendance.ts";

interface Body {
  lessonId: string;
  studentId: string;
  status: Attendance["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await attendanceRepository.create(tenantId, {
    lessonId: body.lessonId,
    studentId: body.studentId,
    status: body.status,
    markedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
