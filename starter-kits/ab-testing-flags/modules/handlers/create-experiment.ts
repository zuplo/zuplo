import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { experimentRepository, type Experiment } from "../repositories/experiments.ts";

interface Body {
  key: string;
  name: string;
  hypothesis?: string;
  variants: Experiment["variants"];
  metricGoals?: string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await experimentRepository.create(tenantId, {
    key: body.key,
    name: body.name,
    hypothesis: body.hypothesis ?? "",
    status: "draft",
    variants: body.variants,
    metricGoals: body.metricGoals ?? [],
    startedAt: null,
    completedAt: null,
    winnerVariantKey: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
