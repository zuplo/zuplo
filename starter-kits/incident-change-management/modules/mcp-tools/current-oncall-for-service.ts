import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { OnCall } from "../repositories/incidents.ts";

/**
 * Orchestrator: current_oncall_for_service.
 *
 * Lists oncall rotation entries via /oncall-schedule and returns the entry
 * (or entries) covering `at` (defaults to now) for a given service / rotation
 * slug. The kit stores rotations by name — by convention the rotation name
 * matches the service slug it covers.
 */

interface Body {
  serviceSlug: string;
  at?: string;
}

interface OnCallPage {
  items: OnCall[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.serviceSlug) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "serviceSlug is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const at = body.at ? new Date(body.at) : new Date();
  if (Number.isNaN(at.getTime())) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "`at` is not a valid date" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Pull the rotation page for this service. The list-oncall-schedule
  // handler accepts ?rotationName=... as a filter.
  const all: OnCall[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      rotationName: body.serviceSlug,
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<OnCallPage>(
      context,
      `/oncall-schedule?${qs}`,
      { headers: auth },
    );
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const atMs = at.getTime();
  const active = all
    .filter((entry) => entry.rotationName === body.serviceSlug)
    .filter((entry) => {
      const start = Date.parse(entry.startsAt);
      const end = Date.parse(entry.endsAt);
      return start <= atMs && atMs < end;
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  // The "next up" entry for context.
  const upcoming = all
    .filter((entry) => entry.rotationName === body.serviceSlug)
    .filter((entry) => Date.parse(entry.startsAt) > atMs)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;

  return new Response(
    JSON.stringify({
      serviceSlug: body.serviceSlug,
      at: at.toISOString(),
      active: active.map((entry) => ({
        id: entry.id,
        employeeEmail: entry.employeeEmail,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
      })),
      upcoming: upcoming
        ? {
            id: upcoming.id,
            employeeEmail: upcoming.employeeEmail,
            startsAt: upcoming.startsAt,
            endsAt: upcoming.endsAt,
          }
        : null,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
