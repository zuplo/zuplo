import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { waitlistRepository } from "../repositories/waitlist.ts";

interface Body {
  guestName: string;
  partySize: number;
  quotedWaitMinutes: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const addedAt = new Date();
  const quotedReadyAt = new Date(
    addedAt.getTime() + body.quotedWaitMinutes * 60_000,
  ).toISOString();

  const created = await waitlistRepository.create(tenantId, {
    guestName: body.guestName,
    partySize: body.partySize,
    addedAt: addedAt.toISOString(),
    quotedWaitMinutes: body.quotedWaitMinutes,
    status: "waiting",
    quotedReadyAt,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
