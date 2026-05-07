import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { controlRepository, type Control } from "../repositories/evidence.ts";

interface Body {
  slug: string;
  framework: Control["framework"];
  domain: Control["domain"];
  title: string;
  description: string;
  evidenceFrequencyDays: number;
  owner: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await controlRepository.create(tenantId, {
    slug: body.slug,
    framework: body.framework,
    domain: body.domain,
    title: body.title,
    description: body.description,
    evidenceFrequencyDays: body.evidenceFrequencyDays,
    owner: body.owner,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
