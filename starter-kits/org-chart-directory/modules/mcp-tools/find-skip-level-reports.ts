import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Person } from "../repositories/people.ts";

/**
 * Orchestrator MCP tool: find_skip_level_reports.
 *
 * Returns a flat list of every person two levels deep under the given manager
 * (people whose manager's manager is the given email). Useful for skip-level
 * 1:1 planning.
 */

interface Body {
  managerEmail: string;
}

interface PersonPage {
  items: Person[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.managerEmail) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "managerEmail is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const all: Person[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<PersonPage>(context, `/people?${qs}`, {
      headers: { authorization: request.headers.get("authorization") ?? "" },
    });
    all.push(...page.items);
    cursor = page.nextCursor;
    if (all.length > 5000) break;
  } while (cursor);

  const directReports = all.filter((p) => p.managerEmail === body.managerEmail).map((p) => p.email);
  const skipLevels = all.filter(
    (p) => p.managerEmail !== null && directReports.includes(p.managerEmail),
  );

  return new Response(
    JSON.stringify({
      managerEmail: body.managerEmail,
      directReportCount: directReports.length,
      skipLevelReportCount: skipLevels.length,
      skipLevelReports: skipLevels,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
