import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  componentRepository,
  type Component,
} from "../repositories/components.ts";

interface Body {
  slug: string;
  name: string;
  description?: string;
  status?: Component["status"];
  parentSlug?: string | null;
  displayOrder?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await componentRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    description: body.description ?? "",
    status: body.status ?? "operational",
    parentSlug: body.parentSlug ?? null,
    displayOrder: body.displayOrder ?? 0,
    updatedAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
