import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { inspectionRepository } from "../repositories/inspections.ts";
import type { Job } from "../repositories/jobs.ts";
import type { Customer } from "../repositories/customers.ts";

/**
 * Orchestrator MCP tool: draft_estimate_from_inspection.
 *
 * Loads an inspection + its parent job + the customer, then produces a
 * draft estimate the LLM can flesh out: per-finding line items (only fail/
 * warning rows), a customer-facing summary, and a suggested total based on
 * `perFindingCents` (or fall back to the job's existing totalCents). The
 * draft is returned — nothing is created in the kit's data store.
 */

interface Body {
  inspectionId: string;
  perFindingCents?: number;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  if (!body.inspectionId) {
    return new Response(
      JSON.stringify({
        error: { type: "bad_request", message: "inspectionId is required" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const perFindingCents = Math.max(0, body.perFindingCents ?? 25_000);
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const inspection = await inspectionRepository.get(tenantId, body.inspectionId);
  if (!inspection) {
    return new Response(
      JSON.stringify({
        error: { type: "not_found", message: "Inspection not found" },
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  const job = await invokeJson<Job>(
    context,
    `/jobs/${encodeURIComponent(inspection.jobId)}`,
    { headers: auth },
  ).catch(() => null);

  let customer: Customer | null = null;
  if (job) {
    interface CustomerPage {
      items: Customer[];
      nextCursor: string | null;
    }
    let cursor: string | null | undefined = undefined;
    do {
      const qs = new URLSearchParams({ limit: "200" });
      if (cursor) qs.set("cursor", cursor);
      const page = await invokeJson<CustomerPage>(
        context,
        `/customers?${qs}`,
        { headers: auth },
      );
      const found = page.items.find((c) => c.id === job.customerId);
      if (found) {
        customer = found;
        break;
      }
      cursor = page.nextCursor;
    } while (cursor);
  }

  const actionable = inspection.findings.filter((f) => f.status !== "pass");
  const lineItems = actionable.map((f) => ({
    description: `${f.item}${f.notes ? ` — ${f.notes}` : ""}`,
    severity: f.status,
    suggestedCents: perFindingCents,
  }));
  const subtotalCents = lineItems.reduce(
    (s, l) => s + l.suggestedCents,
    0,
  );
  const fallbackTotalCents = job?.totalCents ?? 0;
  const suggestedTotalCents = subtotalCents > 0 ? subtotalCents : fallbackTotalCents;

  const summaryLines: string[] = [];
  summaryLines.push(
    `Inspection completed ${new Date(inspection.performedAt).toLocaleDateString()}.`,
  );
  if (customer) summaryLines.push(`Customer: ${customer.name}.`);
  if (job) summaryLines.push(`Site: ${job.siteAddress}.`);
  if (actionable.length === 0) {
    summaryLines.push("No corrective work required — all findings passed.");
  } else {
    summaryLines.push(
      `${actionable.length} item${actionable.length === 1 ? "" : "s"} flagged for follow-up:`,
    );
    for (const f of actionable) {
      summaryLines.push(`  • [${f.status}] ${f.item}${f.notes ? ` — ${f.notes}` : ""}`);
    }
  }

  return new Response(
    JSON.stringify({
      inspectionId: inspection.id,
      jobId: inspection.jobId,
      customerId: job?.customerId ?? null,
      lineItems,
      subtotalCents,
      suggestedTotalCents,
      summary: summaryLines.join("\n"),
      inspection,
      job,
      customer,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
