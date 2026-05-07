import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { courseRepository } from "../repositories/courses.ts";

interface Body {
  slug: string;
  name: string;
  description: string;
  instructorEmail: string;
  startDate: string;
  endDate: string;
  capacity: number;
  schedule: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await courseRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    description: body.description,
    instructorEmail: body.instructorEmail,
    startDate: body.startDate,
    endDate: body.endDate,
    capacity: body.capacity,
    schedule: body.schedule,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
