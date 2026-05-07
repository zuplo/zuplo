import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "../_shared/mcp/helpers.ts";
import type { Lead } from "../repositories/leads.ts";

interface Body {
  leadId: string;
}

interface LeadPage {
  items: Lead[];
  nextCursor: string | null;
}

/**
 * Orchestrator: match_lead_to_account.
 *
 * Given a lead's email domain, finds existing leads that share the domain
 * (a proxy for "same account") and returns the candidate set so the LLM
 * can decide whether to merge / treat the lead as part of an existing
 * sales motion.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = request.headers.get("authorization") ?? "";

  const lead = await invokeJson<Lead>(context, `/leads/${body.leadId}`, {
    headers: { authorization: auth },
  });

  const domain = lead.email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain || domain === "gmail.com" || domain === "yahoo.com" || domain === "hotmail.com") {
    return new Response(
      JSON.stringify({
        leadId: lead.id,
        domain,
        candidates: [],
        note: "Personal-email or empty domain — no account match attempted",
      }),
      { headers: { "content-type": "application/json" } },
    );
  }

  const matches: Lead[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<LeadPage>(context, `/leads?${qs}`, {
      headers: { authorization: auth },
    });
    for (const candidate of page.items) {
      if (candidate.id === lead.id) continue;
      const candidateDomain = candidate.email.split("@")[1]?.toLowerCase();
      if (candidateDomain === domain) matches.push(candidate);
    }
    cursor = page.nextCursor;
    if (matches.length > 100) break;
  } while (cursor);

  return new Response(
    JSON.stringify({
      leadId: lead.id,
      domain,
      candidateCount: matches.length,
      candidates: matches.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        company: m.company,
        title: m.title,
        assignedTo: m.assignedTo,
        status: m.status,
      })),
    }),
    { headers: { "content-type": "application/json" } },
  );
}
