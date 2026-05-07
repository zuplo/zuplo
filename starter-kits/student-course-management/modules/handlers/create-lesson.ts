import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { lessonRepository } from "../repositories/lessons.ts";

interface Body {
  courseId: string;
  title: string;
  description: string;
  scheduledFor: string;
  durationMinutes: number;
  videoUrl?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await lessonRepository.create(tenantId, {
    courseId: body.courseId,
    title: body.title,
    description: body.description,
    scheduledFor: body.scheduledFor,
    durationMinutes: body.durationMinutes,
    videoUrl: body.videoUrl ?? null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
