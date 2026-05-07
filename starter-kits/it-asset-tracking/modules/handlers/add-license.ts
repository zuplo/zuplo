import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { licenseRepository } from "../repositories/assets.ts";

interface Body {
  assetId: string;
  softwareName: string;
  licenseKey: string;
  expiresAt?: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const license = await licenseRepository.create(tenantId, {
    assetId: body.assetId,
    softwareName: body.softwareName,
    licenseKey: body.licenseKey,
    expiresAt: body.expiresAt ?? null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(license), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
