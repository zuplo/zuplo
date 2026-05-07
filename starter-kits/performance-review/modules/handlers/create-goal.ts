import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  goalRepository,
  type Goal,
} from "../repositories/goals.ts";

interface Body {
  employeeEmail: string;
  title: string;
  description: string;
  dueDate: string;
  progress?: number;
  status?: Goal["status"];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const progress = Math.max(0, Math.min(100, body.progress ?? 0));
  const created = await goalRepository.create(tenantId, {
    employeeEmail: body.employeeEmail,
    title: body.title,
    description: body.description,
    dueDate: body.dueDate,
    progress,
    status: body.status ?? "on_track",
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
