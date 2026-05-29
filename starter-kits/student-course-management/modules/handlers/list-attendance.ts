import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { attendanceRepository } from "../repositories/attendance.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const studentId = url.searchParams.get("studentId");
  const lessonId = url.searchParams.get("lessonId");

  const page = await attendanceRepository.list(tenantId, {
    limit: limit ? Math.min(parseInt(limit, 10), 200) : undefined,
    cursor,
    orderBy: { field: "markedAt", direction: "desc" },
  });

  let items = page.items;
  if (studentId) items = items.filter((a) => a.studentId === studentId);
  if (lessonId) items = items.filter((a) => a.lessonId === lessonId);

  return new Response(
    JSON.stringify({ items, nextCursor: page.nextCursor }),
    { headers: { "content-type": "application/json" } },
  );
}
