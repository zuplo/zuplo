import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { renewalRepository, type Renewal } from "../repositories/apps.ts";

interface Body {
  saasAppSlug: string;
  dueDate: string;
  plannedAction: Renewal["plannedAction"];
  currentSeats: number;
  plannedSeats: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await renewalRepository.create(tenantId, {
    saasAppSlug: body.saasAppSlug,
    dueDate: body.dueDate,
    plannedAction: body.plannedAction,
    currentSeats: body.currentSeats,
    plannedSeats: body.plannedSeats,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
