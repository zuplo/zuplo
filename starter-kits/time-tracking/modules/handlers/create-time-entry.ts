import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import {
  timeEntryRepository,
  type TimeEntry,
} from "../repositories/time-entries.ts";

interface Body {
  employeeId: string;
  projectId: string;
  taskId?: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  billable: boolean;
  description: string;
}

function diffMinutes(start: string, end: string): number {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60000));
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const durationMinutes =
    body.durationMinutes ?? diffMinutes(body.startTime, body.endTime);

  const created = await timeEntryRepository.create(tenantId, {
    employeeId: body.employeeId,
    projectId: body.projectId,
    taskId: body.taskId ?? null,
    startTime: body.startTime,
    endTime: body.endTime,
    durationMinutes,
    billable: body.billable,
    description: body.description,
    status: "draft" as TimeEntry["status"],
    timesheetId: null,
    createdAt: new Date().toISOString(),
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
