import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { eventRepository } from "../repositories/events.ts";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as {
    slug: string;
    name: string;
    description?: string;
    venue: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
  };

  const created = await eventRepository.create(tenantId, {
    slug: body.slug,
    name: body.name,
    description: body.description ?? "",
    venue: body.venue,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    capacity: body.capacity,
    ticketsSold: 0,
    status: "draft",
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
