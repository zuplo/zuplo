import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import type { ForecastCategory } from "../repositories/deals.ts";
import { dealRepository } from "../repositories/deals.ts";

interface Body {
  forecastCategory: ForecastCategory;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;
  try {
    const updated = await dealRepository.update(tenantId, id, {
      forecastCategory: body.forecastCategory,
    });
    return new Response(JSON.stringify(updated), { headers: { "content-type": "application/json" } });
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
