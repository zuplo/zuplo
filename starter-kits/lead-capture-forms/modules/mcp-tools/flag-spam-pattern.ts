import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Submission } from "../repositories/submissions.ts";

/**
 * Orchestrator MCP tool: flag_spam_pattern.
 *
 * Scans recent submissions inside the lookback window. If a substring is
 * supplied, it counts how many submissions contain it and proposes a `flag`
 * rule. Otherwise it derives the most common email domain across submissions
 * already marked as `spam` and proposes a domain-block rule.
 *
 * The result is intended for human review — never auto-create the rule.
 */
interface Body {
  lookbackHours?: number;
  substring?: string;
}

interface SubmissionPage {
  items: Submission[];
  nextCursor: string | null;
}

interface ProposedRule {
  name: string;
  pattern: string;
  action: "block" | "flag";
}

function emailDomain(submission: Submission): string | null {
  const email = submission.submitterEmail;
  if (typeof email === "string" && email.includes("@")) {
    return email.split("@")[1]!.toLowerCase();
  }
  return null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const lookbackHours = Math.max(1, Math.min(720, body.lookbackHours ?? 24));
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const submissions: Submission[] = [];
  let cursor: string | null | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await invokeJson<SubmissionPage>(context, `/submissions?${qs}`, { headers: auth });
    submissions.push(...page.items);
    cursor = page.nextCursor;
    if (submissions.length > 5000) break;
  } while (cursor);

  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  const recent = submissions.filter((s) => {
    const t = Date.parse(s.submittedAt);
    return Number.isFinite(t) && t >= cutoff;
  });

  let proposedRule: ProposedRule | null = null;
  let matchCount = 0;
  let narrative = "";

  if (body.substring) {
    const needle = body.substring.toLowerCase();
    matchCount = recent.filter((s) =>
      JSON.stringify(s.payload ?? {}).toLowerCase().includes(needle),
    ).length;
    if (matchCount > 0) {
      proposedRule = {
        name: `Suspicious substring: ${body.substring}`,
        pattern: body.substring,
        action: "flag",
      };
      narrative = `${matchCount}/${recent.length} recent submissions contain "${body.substring}". ` +
        `Proposing a flag rule for human review.`;
    } else {
      narrative = `No matches for "${body.substring}" in the last ${lookbackHours}h.`;
    }
  } else {
    // No explicit substring — derive a candidate domain from existing spam-flagged submissions.
    const flagged = recent.filter((s) => s.spam);
    const domainCounts = new Map<string, number>();
    for (const submission of flagged) {
      const domain = emailDomain(submission);
      if (!domain) continue;
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    }
    const top = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) {
      proposedRule = {
        name: `Block domain: ${top[0]}`,
        pattern: `@${top[0]}`,
        action: "block",
      };
      matchCount = top[1];
      narrative = `Domain ${top[0]} appeared in ${top[1]} flagged submissions in the last ${lookbackHours}h. ` +
        `Proposing a block rule.`;
    } else {
      narrative = `No clear repeated pattern in the last ${lookbackHours}h. No rule proposed.`;
    }
  }

  return new Response(
    JSON.stringify({
      matchCount,
      totalConsidered: recent.length,
      proposedRule,
      narrative,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
