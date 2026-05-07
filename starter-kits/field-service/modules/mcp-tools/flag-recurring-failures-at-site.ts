import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import { requireTenant } from "../_shared/auth/index.ts";
import type { Job } from "../repositories/jobs.ts";
import { inspectionRepository } from "../repositories/inspections.ts";

/**
 * Orchestrator MCP tool: flag_recurring_failures_at_site.
 *
 * Pulls every job for a customer (optionally filtered to one `siteAddress`),
 * walks the inspections for those jobs, and groups failed/warning findings
 * by item. Surfaces only items that fail at least `minFailures` times — a
 * strong signal that a different repair (or replacement) is warranted.
 *
 * Jobs are read through the public route (so tenant scope + customer filter
 * are inherited). Inspections have no public list endpoint in this kit, so
 * we read them directly with the verified tenantId.
 */

interface Body {
  customerId: string;
  siteAddress?: string;
  minFailures?: number;
}

interface JobPage {
  items: Job[];
  nextCursor: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.customerId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "customerId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const minFailures = Math.max(2, Math.min(20, body.minFailures ?? 2));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  // Walk jobs for this customer.
  const jobs: Job[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({
      limit: "200",
      customerId: body.customerId,
    });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<JobPage>(context, `/jobs?${qs}`, {
      headers: auth,
    });
    jobs.push(...page.items);
    cursor = page.nextCursor;
    if (jobs.length > 5000) break;
  } while (cursor);

  const filteredJobs = body.siteAddress
    ? jobs.filter((j) => j.siteAddress === body.siteAddress)
    : jobs;
  const jobIds = new Set(filteredJobs.map((j) => j.id));
  const jobById = new Map(filteredJobs.map((j) => [j.id, j]));

  // Inspections for those jobs.
  const allInspections = await inspectionRepository.list(tenantId, {
    limit: 500,
  });
  const matchingInspections = allInspections.items.filter((i) =>
    jobIds.has(i.jobId),
  );

  // Group by finding `item` -> { failures, warnings, occurrences[] }.
  type Occurrence = {
    inspectionId: string;
    jobId: string;
    siteAddress: string;
    performedAt: string;
    status: "fail" | "warning";
    notes?: string;
  };
  const buckets = new Map<
    string,
    { item: string; failures: number; warnings: number; occurrences: Occurrence[] }
  >();

  for (const insp of matchingInspections) {
    const job = jobById.get(insp.jobId);
    if (!job) continue;
    for (const finding of insp.findings) {
      if (finding.status === "pass") continue;
      const bucket = buckets.get(finding.item) ?? {
        item: finding.item,
        failures: 0,
        warnings: 0,
        occurrences: [],
      };
      if (finding.status === "fail") bucket.failures += 1;
      else bucket.warnings += 1;
      bucket.occurrences.push({
        inspectionId: insp.id,
        jobId: insp.jobId,
        siteAddress: job.siteAddress,
        performedAt: insp.performedAt,
        status: finding.status,
        notes: finding.notes,
      });
      buckets.set(finding.item, bucket);
    }
  }

  const recurring = [...buckets.values()]
    .filter((b) => b.failures + b.warnings >= minFailures)
    .sort((a, b) => b.failures + b.warnings - (a.failures + a.warnings));

  return new Response(
    JSON.stringify({
      customerId: body.customerId,
      siteAddress: body.siteAddress ?? null,
      jobCount: filteredJobs.length,
      inspectionCount: matchingInspections.length,
      minFailures,
      recurringItems: recurring,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
