import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Job } from "../repositories/jobs.ts";

/**
 * Orchestrator MCP tool: optimize_route_for_day.
 *
 * Pulls a single technician's scheduled jobs for a given date, sorts them
 * by `scheduledFor`, and reports the suggested driving order plus any gap
 * longer than `maxGapMinutes` (between the end of one job and the start of
 * the next). The LLM uses this to suggest schedule consolidation or to slot
 * in a same-day callout.
 *
 * Geographic optimization is intentionally out of scope: an honest baseline
 * is "do them in order" and the LLM can layer city / address heuristics on
 * top of the returned list.
 */

interface Body {
  technicianEmail: string;
  date: string;
  maxGapMinutes?: number;
}

interface JobPage {
  items: Job[];
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

  const ordered = [...jobs].sort((a, b) =>
    a.scheduledFor.localeCompare(b.scheduledFor),
  );

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
  for (const j of ordered) {
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

  const totalDurationMinutes = ordered.reduce((s, j) => s + j.durationMinutes, 0);
  const flaggedGapCount = stops.filter((s) => s.flagLargeGap).length;

  return new Response(
    JSON.stringify({
      technicianEmail: body.technicianEmail,
      date: body.date,
      jobCount: ordered.length,
      totalDurationMinutes,
      flaggedGapCount,
      maxGapMinutes: maxGap,
      stops,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
