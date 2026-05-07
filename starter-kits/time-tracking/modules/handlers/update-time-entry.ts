import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { NotFoundError } from "../_shared/adapters/index.ts";
import {
  timeEntryRepository,
  type TimeEntry,
} from "../repositories/time-entries.ts";

interface Body {
  projectId?: string;
  taskId?: string | null;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  billable?: boolean;
  description?: string;
  status?: TimeEntry["status"];
}

function diffMinutes(start: string, end: string): number {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 60000));
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  const patch: Partial<TimeEntry> = { ...body };
  if (body.startTime && body.endTime && body.durationMinutes === undefined) {
    patch.durationMinutes = diffMinutes(body.startTime, body.endTime);
  }

  try {
    const updated = await timeEntryRepository.update(tenantId, id, patch);
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return new Response(
        JSON.stringify({ error: { type: "not_found", message: err.message } }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw err;
  }
}
