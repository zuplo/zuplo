import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { matterDocumentRepository, type MatterDocument } from "../repositories/matters.ts";

interface Body {
  matterId: string;
  kind: MatterDocument["kind"];
  title: string;
  fileUrl: string;
  uploadedBy: string;
  privileged?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await matterDocumentRepository.create(tenantId, {
    matterId: body.matterId,
    kind: body.kind,
    title: body.title,
    fileUrl: body.fileUrl,
    uploadedAt: now,
    uploadedBy: body.uploadedBy,
    privileged: body.privileged ?? false,
    createdAt: now,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
