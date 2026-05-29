import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { deadlineRepository, type Deadline } from "../repositories/matters.ts";

interface Body {
  matterId: string;
  title: string;
  dueDate: string;
  kind: Deadline["kind"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await deadlineRepository.create(tenantId, {
    matterId: body.matterId,
    title: body.title,
    dueDate: body.dueDate,
    kind: body.kind,
    status: "upcoming",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
