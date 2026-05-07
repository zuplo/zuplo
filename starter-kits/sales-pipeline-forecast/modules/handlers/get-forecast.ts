import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { forecastRepository } from "../repositories/forecasts.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const forecast = await forecastRepository.get(tenantId, id);
  if (!forecast) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Forecast not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(forecast), { headers: { "content-type": "application/json" } });
}
