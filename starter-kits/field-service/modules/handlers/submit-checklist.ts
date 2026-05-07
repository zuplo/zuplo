import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  checklistRepository,
  type ChecklistItem,
} from "../repositories/checklists.ts";

interface Body {
  jobId: string;
  items: ChecklistItem[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await checklistRepository.create(tenantId, {
    jobId: body.jobId,
    items: body.items,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
