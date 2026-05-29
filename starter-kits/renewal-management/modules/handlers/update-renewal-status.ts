import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import {
  renewalRepository,
  type RenewalOpportunity,
} from "../repositories/renewals.ts";

interface Body {
  status: RenewalOpportunity["status"];
  forecastCategory?: RenewalOpportunity["forecastCategory"];
  proposedArrCents?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  const patch: Partial<RenewalOpportunity> = { status: body.status };
  if (body.forecastCategory !== undefined) patch.forecastCategory = body.forecastCategory;
  if (body.proposedArrCents !== undefined) patch.proposedArrCents = body.proposedArrCents;

  try {
    const updated = await renewalRepository.update(tenantId, id, patch);
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
