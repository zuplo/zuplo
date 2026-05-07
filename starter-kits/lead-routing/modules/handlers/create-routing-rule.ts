import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { routingRuleRepository } from "../repositories/routing-rules.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    name: string;
    priority: number;
    conditions: Record<string, unknown>;
    assignTo: string;
    active?: boolean;
  };

  const created = await routingRuleRepository.create(tenantId, {
    name: body.name,
    priority: body.priority,
    conditions: body.conditions,
    assignTo: body.assignTo,
    active: body.active ?? true,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
