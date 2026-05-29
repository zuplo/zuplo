import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { evidenceRepository, type Evidence } from "../repositories/evidence.ts";

interface Body {
  controlId: string;
  kind: Evidence["kind"];
  title: string;
  description: string;
  fileUrl: string;
  sha256: string;
  collectedAt?: string;
  collectedBy: string;
  validUntil?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await evidenceRepository.create(tenantId, {
    controlId: body.controlId,
    kind: body.kind,
    title: body.title,
    description: body.description,
    fileUrl: body.fileUrl,
    sha256: body.sha256,
    collectedAt: body.collectedAt ?? new Date().toISOString(),
    collectedBy: body.collectedBy,
    validUntil: body.validUntil ?? null,
    status: "current",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
