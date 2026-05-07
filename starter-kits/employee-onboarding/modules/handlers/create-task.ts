import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  onboardingTaskRepository,
  type OnboardingTask,
} from "../repositories/onboarding-tasks.ts";

interface Body {
  hireId: string;
  title: string;
  description: string;
  ownerEmail: string;
  dueDate: string;
  category: OnboardingTask["category"];
  dependsOn?: string[];
  status?: OnboardingTask["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await onboardingTaskRepository.create(tenantId, {
    hireId: body.hireId,
    title: body.title,
    description: body.description,
    ownerEmail: body.ownerEmail,
    dueDate: body.dueDate,
    status: body.status ?? "open",
    category: body.category,
    dependsOn: body.dependsOn ?? [],
    completedAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
