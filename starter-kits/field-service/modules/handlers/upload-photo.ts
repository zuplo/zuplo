import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { photoRepository } from "../repositories/photos.ts";

/**
 * POST /photos — register a photo against a job.
 *
 * For R2-backed flows, the client first calls /photos/presign-upload,
 * PUTs the bytes to the returned `uploadUrl`, then calls this endpoint
 * with the `r2Key` + `url` from the presign response.
 *
 * For other storage backends (S3, GCS, an existing CDN), pass the
 * already-public `url` and skip the R2 fields.
 */
interface Body {
  jobId: string;
  url: string;
  caption?: string;
  takenAt?: string;
  takenBy: string;
  r2Key?: string;
  r2Bucket?: string;
  contentType?: string;
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
    r2Key: body.r2Key ?? null,
    r2Bucket: body.r2Bucket ?? null,
    contentType: body.contentType ?? null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
