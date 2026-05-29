import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { bookingRepository, cancellationRepository } from "../repositories/bookings.ts";

interface Body {
  reason?: string;
  canceledBy?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json().catch(() => ({}))) as Body;
  const now = new Date().toISOString();
  const reason = body.reason ?? "";
  const canceledBy = body.canceledBy ?? "system";

  try {
    const updated = await bookingRepository.update(tenantId, id, {
      status: "canceled",
      canceledAt: now,
      cancelReason: reason,
    });

    // Audit row — keeps history even if the booking is later mutated.
    await cancellationRepository.create(tenantId, {
      bookingId: id,
      canceledBy,
      reason,
      canceledAt: now,
      createdAt: now,
    });

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
