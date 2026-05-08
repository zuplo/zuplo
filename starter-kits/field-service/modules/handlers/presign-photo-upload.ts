import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { presignR2PutUrl } from "../integrations/r2.ts";

/**
 * POST /photos/presign-upload — return a presigned R2 PUT URL the
 * tech's mobile app can upload an inspection photo directly to,
 * without proxying bytes through the edge runtime.
 *
 * The client then PUTs the bytes and finally calls /photos with the
 * returned `key` + the public URL to register the photo against the
 * job.
 */

interface Body {
  jobId: string;
  filename: string;
  contentType?: string;
  expiresInSeconds?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const safeFilename = body.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const key = `tenants/${tenantId}/jobs/${body.jobId}/${Date.now()}-${safeFilename}`;

  const presigned = await presignR2PutUrl({
    key,
    contentType: body.contentType ?? "image/jpeg",
    expiresInSeconds: body.expiresInSeconds ?? 900,
  });

  return new Response(
    JSON.stringify({
      uploadUrl: presigned.uploadUrl,
      publicUrl: presigned.publicUrl,
      key: presigned.key,
      bucket: presigned.bucket,
      expiresInSeconds: presigned.expiresInSeconds,
      signedHeaders: presigned.signedHeaders,
      jobId: body.jobId,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}
