import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Person } from "../repositories/people.ts";

/**
 * Orchestrator MCP tool: who_reports_to.
 *
 * Builds an N-deep reporting tree under a given manager.
 */

interface Body {
  managerEmail: string;
  depth?: number;
}

interface PersonPage {
  items: Person[];
  nextCursor: string | null;
}

interface Node {
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  reports: Node[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.managerEmail) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "managerEmail is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const depth = Math.max(1, Math.min(10, body.depth ?? 3));

  // Pull every person in the tenant into memory once (good enough for typical org sizes).
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

  const directReportsByManager = new Map<string, Person[]>();
  for (const person of all) {
    if (person.managerEmail) {
      const arr = directReportsByManager.get(person.managerEmail) ?? [];
      arr.push(person);
      directReportsByManager.set(person.managerEmail, arr);
    }
  }

  function build(email: string, remainingDepth: number): Node | null {
    const person = all.find((p) => p.email === email);
    if (!person) return null;
    const reports = remainingDepth > 0
      ? (directReportsByManager.get(email) ?? []).map((r) => build(r.email, remainingDepth - 1)).filter(
          (n): n is Node => n !== null,
        )
      : [];
    return {
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      title: person.title,
      reports,
    };
  }

  const root = build(body.managerEmail, depth);
  if (!root) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Manager not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify(root), {
    headers: { "content-type": "application/json" },
  });
}
