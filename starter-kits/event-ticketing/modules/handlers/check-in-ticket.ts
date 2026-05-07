import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { ticketRepository } from "../repositories/tickets.ts";
import { checkInRepository } from "../repositories/check-ins.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json().catch(() => ({}))) as {
    checkedInBy?: string;
    gate?: string;
  };
  const now = new Date().toISOString();

  try {
    const updated = await ticketRepository.update(tenantId, id, {
      status: "checked_in",
      checkedInAt: now,
    });

    await checkInRepository.create(tenantId, {
      ticketId: id,
      checkedInAt: now,
      checkedInBy: body.checkedInBy ?? "",
      gate: body.gate ?? "main",
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
