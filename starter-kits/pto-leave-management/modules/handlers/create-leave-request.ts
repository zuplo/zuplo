import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  leaveRequestRepository,
  type LeaveRequest,
} from "../repositories/leave-requests.ts";

interface Body {
  employeeId: string;
  startDate: string;
  endDate: string;
  type: LeaveRequest["type"];
  reason: string;
  days: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const created = await leaveRequestRepository.create(tenantId, {
    employeeId: body.employeeId,
    startDate: body.startDate,
    endDate: body.endDate,
    type: body.type,
    status: "pending",
    reason: body.reason,
    days: body.days,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
