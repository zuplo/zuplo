import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  consentRepository,
  type Consent,
} from "../repositories/consents.ts";

interface Body {
  patientId: string;
  kind: Consent["kind"];
  version: string;
  signedAt?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await consentRepository.create(tenantId, {
    patientId: body.patientId,
    kind: body.kind,
    version: body.version,
    signedAt: body.signedAt ?? new Date().toISOString(),
    withdrawnAt: null,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
