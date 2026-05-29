import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { submissionRepository } from "../repositories/submissions.ts";
import { spamRuleRepository } from "../repositories/spam-rules.ts";

interface Body {
  formId: string;
  payload: Record<string, unknown>;
}

function pickEmail(payload: Record<string, unknown>): string | null {
  for (const value of Object.values(payload)) {
    if (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return value;
    }
  }
  return null;
}

function evaluateSpam(
  payload: Record<string, unknown>,
  rules: Array<{ pattern: string; action: "block" | "flag"; active: boolean }>,
): { blocked: boolean; flagged: boolean } {
  const haystack = JSON.stringify(payload);
  let blocked = false;
  let flagged = false;
  for (const rule of rules) {
    if (!rule.active) continue;
    let matched = false;
    try {
      const regex = new RegExp(rule.pattern, "i");
      matched = regex.test(haystack);
    } catch {
      // Treat invalid regex as a substring search.
      matched = haystack.toLowerCase().includes(rule.pattern.toLowerCase());
    }
    if (!matched) continue;
    if (rule.action === "block") blocked = true;
    if (rule.action === "flag") flagged = true;
  }
  return { blocked, flagged };
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  const rulesPage = await spamRuleRepository.list(tenantId, { limit: 200 });
  const verdict = evaluateSpam(body.payload ?? {}, rulesPage.items);

  if (verdict.blocked) {
    return new Response(
      JSON.stringify({ error: { type: "blocked", message: "Submission blocked by spam rule" } }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;
  const submitterEmail = pickEmail(body.payload ?? {});

  const created = await submissionRepository.create(tenantId, {
    formId: body.formId,
    payload: body.payload ?? {},
    submitterEmail,
    ip,
    userAgent,
    submittedAt: new Date().toISOString(),
    score: null,
    routedTo: null,
    processed: false,
    spam: verdict.flagged,
  });

  return new Response(JSON.stringify(created), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}
