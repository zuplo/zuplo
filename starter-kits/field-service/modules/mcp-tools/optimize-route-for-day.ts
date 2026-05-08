import { environment, type ZuploContext, type ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Job } from "../repositories/jobs.ts";
import type { Technician } from "../repositories/technicians.ts";
import {
  geocodeMapboxAddress,
  getMapboxMatrix,
  greedyNearestNeighborOrder,
} from "../integrations/mapbox.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";

/**
 * Orchestrator MCP tool: optimize_route_for_day.
 *
 * Pulls a single technician's scheduled jobs for a date, geocodes each
 * site address via Mapbox, fetches a drive-time matrix from the
 * Directions Matrix API, then runs a greedy nearest-neighbor solve to
 * produce a sane visit order with realistic ETAs.
 *
 * When `notifyTechnician=true`, fires a Twilio SMS to the tech with
 * their first 3 stops so they have something usable on the truck.
 *
 * Falls back to time-ordering (the previous behavior) if Mapbox isn't
 * configured.
 */

interface Body {
  technicianEmail: string;
  date: string;
  maxGapMinutes?: number;
  notifyTechnician?: boolean;
  /** Origin to start the route from (e.g. the depot). Defaults to the first job's site. */
  originAddress?: string;
}

interface JobPage {
  items: Job[];
  nextCursor: string | null;
}

interface TechnicianPage {
  items: Technician[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.technicianEmail || !body.date) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "technicianEmail and date are required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const maxGap = Math.max(5, Math.min(480, body.maxGapMinutes ?? 60));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const dayStart = `${body.date}T00:00:00.000Z`;
  const nextDay = new Date(`${body.date}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dayEnd = nextDay.toISOString();

  const jobs: Job[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      technicianEmail: body.technicianEmail,
      from: dayStart,
      to: dayEnd,
      status: "scheduled",
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<JobPage>(context, `/jobs?${qs}`, {
      headers: auth,
    });
    jobs.push(...page.items);
    cursor = page.nextCursor;
    if (jobs.length > 200) break;
  } while (cursor);

  // Default order: by scheduledFor.
  const timeOrdered = [...jobs].sort((a, b) =>
    a.scheduledFor.localeCompare(b.scheduledFor),
  );

  const useMapbox = !!environment.MAPBOX_ACCESS_TOKEN && jobs.length >= 2;
  let visitOrder: Job[] = timeOrdered;
  let routeStrategy: "time" | "mapbox-nearest-neighbor" = "time";
  let totalDriveSeconds: number | null = null;
  let geocodeFailures: string[] = [];

  if (useMapbox) {
    // Geocode each site (Mapbox supports up to 25 stops in a matrix call).
    const sites = timeOrdered.slice(0, 24);
    const origin = body.originAddress
      ? await geocodeMapboxAddress(body.originAddress).catch(() => null)
      : null;

    const geos = await Promise.all(
      sites.map((j) =>
        geocodeMapboxAddress(j.siteAddress).catch(() => null),
      ),
    );
    const coords: Array<[number, number]> = [];
    const labelMap: Array<{ kind: "origin" | "job"; job?: Job }> = [];
    if (origin) {
      coords.push([origin.longitude, origin.latitude]);
      labelMap.push({ kind: "origin" });
    }
    geos.forEach((g, i) => {
      if (g) {
        coords.push([g.longitude, g.latitude]);
        labelMap.push({ kind: "job", job: sites[i] });
      } else {
        geocodeFailures.push(sites[i].siteAddress);
      }
    });

    if (coords.length >= 2) {
      try {
        const matrix = await getMapboxMatrix({ coordinates: coords });
        const order = greedyNearestNeighborOrder(matrix.durations, 0);
        const orderedIdx = order.filter((idx) => labelMap[idx]?.kind === "job");
        visitOrder = orderedIdx
          .map((idx) => labelMap[idx]?.job)
          .filter((j): j is Job => !!j);
        routeStrategy = "mapbox-nearest-neighbor";

        let total = 0;
        for (let i = 0; i < order.length - 1; i++) {
          const segment = matrix.durations[order[i]]?.[order[i + 1]];
          if (segment != null) total += segment;
        }
        totalDriveSeconds = Math.round(total);
      } catch (err) {
        context.log.warn(
          `Mapbox matrix failed, falling back to time order: ${(err as Error).message}`,
        );
      }
    }
  }

  const stops: Array<{
    jobId: string;
    customerId: string;
    siteAddress: string;
    kind: Job["kind"];
    scheduledFor: string;
    durationMinutes: number;
    gapMinutesBefore: number;
    flagLargeGap: boolean;
  }> = [];

  let prevEndMs: number | null = null;
  for (const j of visitOrder) {
    const startMs = Date.parse(j.scheduledFor);
    const gap = prevEndMs === null ? 0 : Math.max(0, Math.round((startMs - prevEndMs) / 60_000));
    stops.push({
      jobId: j.id,
      customerId: j.customerId,
      siteAddress: j.siteAddress,
      kind: j.kind,
      scheduledFor: j.scheduledFor,
      durationMinutes: j.durationMinutes,
      gapMinutesBefore: gap,
      flagLargeGap: prevEndMs !== null && gap > maxGap,
    });
    prevEndMs = startMs + j.durationMinutes * 60_000;
  }

  const totalDurationMinutes = visitOrder.reduce(
    (s, j) => s + j.durationMinutes,
    0,
  );
  const flaggedGapCount = stops.filter((s) => s.flagLargeGap).length;

  // Optionally text the tech. Look up their phone via list_technicians.
  let smsSid: string | null = null;
  let smsError: string | null = null;
  if (
    body.notifyTechnician &&
    environment.TWILIO_ACCOUNT_SID &&
    environment.TWILIO_AUTH_TOKEN &&
    environment.TWILIO_FROM_NUMBER
  ) {
    let techPhone: string | null = null;
    let tCursor: string | null | undefined = undefined;
    do {
      const tqs = new URLSearchParams({ limit: "200" });
      if (tCursor) tqs.set("cursor", tCursor);
      const tp = await invokeJson<TechnicianPage>(context, `/technicians?${tqs}`, {
        headers: auth,
      });
      const match = tp.items.find((t) => t.email === body.technicianEmail);
      if (match?.phone) {
        techPhone = match.phone;
        break;
      }
      tCursor = tp.nextCursor;
    } while (tCursor);

    if (techPhone) {
      const lines = [
        `Today's route (${stops.length} stop${stops.length === 1 ? "" : "s"}):`,
        ...stops.slice(0, 3).map(
          (s, i) =>
            `${i + 1}. ${new Date(s.scheduledFor).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })} ${s.kind} — ${s.siteAddress}`,
        ),
      ];
      try {
        const result = await sendTwilioSms({
          to: techPhone,
          body: lines.join("\n"),
        });
        smsSid = result.sid;
      } catch (err) {
        // Log full error server-side; return only a generic flag to the caller.
        context.log.warn("Twilio SMS dispatch failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        smsError = "send_failed";
      }
    }
  }

  return new Response(
    JSON.stringify({
      technicianEmail: body.technicianEmail,
      date: body.date,
      jobCount: visitOrder.length,
      totalDurationMinutes,
      totalDriveSeconds,
      flaggedGapCount,
      maxGapMinutes: maxGap,
      routeStrategy,
      geocodeFailures,
      smsSid,
      smsError,
      stops,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
