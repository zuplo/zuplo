import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type {
  Deadline,
  Matter,
  MatterDocument,
  MatterTimeEntry,
} from "../repositories/matters.ts";

/**
 * Orchestrator MCP tool: summarize_matter_status.
 *
 * Returns the matter, plus its open deadlines, recent documents, and recent
 * time entries — a "single-screen" status view an LLM can ground a client
 * update letter on.
 */

interface Body {
  matterId: string;
}

interface DeadlinePage { items: Deadline[]; nextCursor: string | null; }
interface DocPage { items: MatterDocument[]; nextCursor: string | null; }
interface TimePage { items: MatterTimeEntry[]; nextCursor: string | null; }

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  if (!body.matterId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "matterId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const matter = await invokeJson<Matter>(context, `/matters/${encodeURIComponent(body.matterId)}`, {
    headers: auth,
  });

  const deadlines: Deadline[] = [];
  let dCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (dCursor) qs.set("cursor", dCursor);
    const page = await invokeJson<DeadlinePage>(context, `/deadlines?${qs}`, { headers: auth });
    deadlines.push(...page.items);
    dCursor = page.nextCursor;
    if (deadlines.length > 5000) break;
  } while (dCursor);

  const docs: MatterDocument[] = [];
  let docCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (docCursor) qs.set("cursor", docCursor);
    const page = await invokeJson<DocPage>(context, `/documents?${qs}`, { headers: auth });
    docs.push(...page.items);
    docCursor = page.nextCursor;
    if (docs.length > 5000) break;
  } while (docCursor);

  const times: MatterTimeEntry[] = [];
  let tCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (tCursor) qs.set("cursor", tCursor);
    const page = await invokeJson<TimePage>(context, `/time-entries?${qs}`, { headers: auth });
    times.push(...page.items);
    tCursor = page.nextCursor;
    if (times.length > 5000) break;
  } while (tCursor);

  const openDeadlines = deadlines
    .filter((d) => d.matterId === body.matterId && d.status === "upcoming")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const recentDocs = docs
    .filter((d) => d.matterId === body.matterId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 10);
  const recentTimes = times
    .filter((t) => t.matterId === body.matterId)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
    .slice(0, 10);

  const totalBillableMinutes = recentTimes.reduce(
    (sum, t) => sum + (t.billable ? t.durationMinutes : 0),
    0,
  );

  return new Response(
    JSON.stringify({
      matter,
      openDeadlineCount: openDeadlines.length,
      openDeadlines,
      recentDocuments: recentDocs,
      recentTimeEntries: recentTimes,
      recentBillableMinutes: totalBillableMinutes,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
