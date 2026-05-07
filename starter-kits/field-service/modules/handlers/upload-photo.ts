import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { photoRepository } from "../repositories/photos.ts";

interface Body {
  jobId: string;
  url: string;
  caption?: string;
  takenAt?: string;
  takenBy: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await photoRepository.create(tenantId, {
    jobId: body.jobId,
    url: body.url,
    caption: body.caption ?? null,
    takenAt: body.takenAt ?? new Date().toISOString(),
    takenBy: body.takenBy,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
