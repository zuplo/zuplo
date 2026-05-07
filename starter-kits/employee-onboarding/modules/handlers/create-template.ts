import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  onboardingTemplateRepository,
  type TaskTemplate,
} from "../repositories/onboarding-templates.ts";

interface Body {
  name: string;
  role: string;
  tasks: TaskTemplate[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await onboardingTemplateRepository.create(tenantId, {
    name: body.name,
    role: body.role,
    tasks: body.tasks,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
