import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Person, Team } from "../repositories/people.ts";

/**
 * Orchestrator MCP tool: find_owner_of_team.
 *
 * Given a team name, returns the team's lead and the people who report to that
 * lead (effectively the team roster).
 */

interface Body {
  teamName: string;
}

interface TeamPage {
  items: Team[];
  nextCursor: string | null;
}

interface PersonPage {
  items: Person[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.teamName) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "teamName is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Find the team (case-insensitive match on name).
  const teams: Team[] = [];
  let teamsCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (teamsCursor) qs.set("cursor", teamsCursor);
    const page = await invokeJson<TeamPage>(context, `/teams?${qs}`, { headers: auth });
    teams.push(...page.items);
    teamsCursor = page.nextCursor;
    if (teams.length > 2000) break;
  } while (teamsCursor);

  const team = teams.find((t) => t.name.toLowerCase() === body.teamName.toLowerCase());
  if (!team) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: `No team named ${body.teamName}` } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  // Find people whose managerEmail equals team.leadEmail.
  const people: Person[] = [];
  let peopleCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (peopleCursor) qs.set("cursor", peopleCursor);
    const page = await invokeJson<PersonPage>(context, `/people?${qs}`, { headers: auth });
    people.push(...page.items);
    peopleCursor = page.nextCursor;
    if (people.length > 5000) break;
  } while (peopleCursor);

  const lead = people.find((p) => p.email === team.leadEmail) ?? null;
  const members = people.filter((p) => p.managerEmail === team.leadEmail);

  return new Response(
    JSON.stringify({
      team,
      lead,
      members,
      memberCount: members.length,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
