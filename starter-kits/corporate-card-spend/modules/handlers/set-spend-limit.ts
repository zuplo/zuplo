import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { cardRepository } from "../repositories/cards.ts";
import { updateRampCardLimit } from "../integrations/ramp.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as {
    limitCents: number;
    intervalDays?: number;
    rampCardId?: string;
  };

  try {
    const updated = await cardRepository.update(tenantId, id, {
      spendLimitCents: body.limitCents,
      ...(body.intervalDays !== undefined ? { intervalDays: body.intervalDays } : {}),
    });

    let rampStatus: string | null = null;
    if (environment.RAMP_CLIENT_ID && body.rampCardId) {
      try {
        const interval =
          (body.intervalDays ?? updated.intervalDays) >= 365
            ? "YEARLY"
            : (body.intervalDays ?? updated.intervalDays) >= 28
              ? "MONTHLY"
              : (body.intervalDays ?? updated.intervalDays) >= 7
                ? "WEEKLY"
                : "DAILY";
        await updateRampCardLimit({
          cardId: body.rampCardId,
          amountCents: body.limitCents,
          interval,
        });
        rampStatus = "synced";
      } catch (err) {
        rampStatus = `failed: ${err instanceof Error ? err.message : String(err)}`;
        context.log.error(`set_spend_limit ramp push failed: ${rampStatus}`);
      }
    }

    return new Response(JSON.stringify({ ...updated, rampStatus }), {
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
