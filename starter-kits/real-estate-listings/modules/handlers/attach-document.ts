import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { listingDocumentRepository, type ListingDocument } from "../repositories/listings.ts";

interface Body {
  listingId: string;
  kind: ListingDocument["kind"];
  title: string;
  fileUrl: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await listingDocumentRepository.create(tenantId, {
    listingId: body.listingId,
    kind: body.kind,
    title: body.title,
    fileUrl: body.fileUrl,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
