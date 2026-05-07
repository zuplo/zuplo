import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { spamRuleRepository } from "../repositories/spam-rules.ts";

interface Body {
  name: string;
  pattern: string;
  action: "block" | "flag";
  active?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await spamRuleRepository.create(tenantId, {
    name: body.name,
    pattern: body.pattern,
    action: body.action,
    active: body.active ?? true,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
