import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { spaceRepository, type Space } from "../repositories/spaces.ts";

interface Body {
  slug: string;
  name: string;
  description?: string;
  ownerEmail: string;
  visibility?: Space["visibility"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await spaceRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    description: body.description ?? "",
    ownerEmail: body.ownerEmail,
    visibility: body.visibility ?? "team",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
