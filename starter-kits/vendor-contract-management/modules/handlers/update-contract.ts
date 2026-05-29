import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { NotFoundError } from "@zuplo/starter-kit-shared/adapters";
import { contractRepository, type Contract } from "../repositories/contracts.ts";

interface Body {
  title?: string;
  kind?: Contract["kind"];
  startDate?: string;
  endDate?: string;
  autoRenews?: boolean;
  noticePeriodDays?: number;
  annualValueCents?: number;
  currency?: string;
  status?: Contract["status"];
  documentUrl?: string | null;
  owner?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const patch = (await request.json()) as Body;

  try {
    const updated = await contractRepository.update(tenantId, id, patch);
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
