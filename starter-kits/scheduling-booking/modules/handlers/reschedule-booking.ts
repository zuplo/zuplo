import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { bookingRepository } from "../repositories/bookings.ts";

interface Body {
  scheduledFor: string;
  durationMinutes?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  try {
    const updates: Record<string, unknown> = {
      scheduledFor: body.scheduledFor,
      status: "rescheduled",
    };
    if (typeof body.durationMinutes === "number") {
      updates.durationMinutes = body.durationMinutes;
    }
    const updated = await bookingRepository.update(tenantId, id, updates);
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
