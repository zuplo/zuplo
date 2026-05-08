import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { deadlineRepository } from "../repositories/matters.ts";
import { deleteGCalEvent } from "../integrations/google-calendar.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;

  try {
    const before = await deadlineRepository.get(tenantId, id);
    const updated = await deadlineRepository.update(tenantId, id, { status: "completed" });

    let calendarError: string | null = null;
    if (before?.calendarEventId) {
      try {
        await deleteGCalEvent(before.calendarEventId, { sendUpdates: "all" });
      } catch (err) {
        calendarError = (err as Error).message;
      }
    }

    return new Response(JSON.stringify({ deadline: updated, calendarError }), {
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
