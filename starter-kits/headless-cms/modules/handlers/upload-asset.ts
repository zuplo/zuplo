import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { assetRepository } from "../repositories/entries.ts";

interface Body {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  altText?: string;
  uploadedBy: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await assetRepository.create(tenantId, {
    filename: body.filename,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
    url: body.url,
    altText: body.altText ?? "",
    uploadedBy: body.uploadedBy,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
