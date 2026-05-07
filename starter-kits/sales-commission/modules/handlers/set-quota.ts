import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "../_shared/auth/index.ts";
import { quotaRepository } from "../repositories/quotas.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    repEmail: string;
    period: string;
    quotaCents: number;
  };

  // Idempotent upsert by (repEmail, period). If a quota row already exists,
  // update its value; otherwise create.
  let cursor: string | null | undefined;
  let existingId: string | null = null;
  do {
    const page = await quotaRepository.list(tenantId, { limit: 200, cursor });
    for (const q of page.items) {
      if (q.repEmail === body.repEmail && q.period === body.period) {
        existingId = q.id;
        break;
      }
    }
    if (existingId) break;
    cursor = page.nextCursor;
  } while (cursor);

  if (existingId) {
    const updated = await quotaRepository.update(tenantId, existingId, {
      quotaCents: body.quotaCents,
    });
    return new Response(JSON.stringify(updated), {
      headers: { "content-type": "application/json" },
    });
  }

  const created = await quotaRepository.create(tenantId, {
    repEmail: body.repEmail,
    period: body.period,
    quotaCents: body.quotaCents,
  });
  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
