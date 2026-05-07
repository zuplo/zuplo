import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { signalRepository, type Signal } from "../repositories/signals.ts";

interface Body {
  accountId: string;
  kind: Signal["kind"];
  severity: Signal["severity"];
  value: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await signalRepository.create(tenantId, {
    accountId: body.accountId,
    kind: body.kind,
    severity: body.severity,
    value: body.value,
    detectedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
