import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { flagRepository, type Flag } from "../repositories/experiments.ts";

interface Body {
  key: string;
  name: string;
  kind: Flag["kind"];
  value: unknown;
  defaultValue: unknown;
  rollout?: Flag["rollout"];
  active?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await flagRepository.create(tenantId, {
    key: body.key,
    name: body.name,
    kind: body.kind,
    value: body.value,
    defaultValue: body.defaultValue,
    rollout: body.rollout ?? [],
    active: body.active ?? true,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
