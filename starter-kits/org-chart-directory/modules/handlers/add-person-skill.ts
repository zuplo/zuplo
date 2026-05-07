import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { personSkillRepository } from "../repositories/people.ts";

interface Body {
  personEmail: string;
  skillName: string;
  level: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await personSkillRepository.create(tenantId, {
    personEmail: body.personEmail,
    skillName: body.skillName,
    level: body.level,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
