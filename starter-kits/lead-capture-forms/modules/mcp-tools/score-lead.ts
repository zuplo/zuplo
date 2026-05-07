import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Submission } from "../repositories/submissions.ts";

/**
 * Orchestrator MCP tool: score_lead.
 *
 * Loads a submission, evaluates a small set of fit signals (business email,
 * presence of company/title/phone, recency, spam status), and returns a
 * 0-100 score plus a per-signal breakdown the LLM can quote in a handoff.
 */
interface Body {
  submissionId: string;
}

interface Signal {
  name: string;
  weight: number;
  reason: string;
}

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "aol.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "live.com",
  "msn.com",
]);

function pickString(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const submission = await invokeJson<Submission>(
    context,
    `/submissions/${encodeURIComponent(body.submissionId)}`,
    { headers: auth },
  );

  const signals: Signal[] = [];
  let score = 0;

  // Spam check (negative, dominant).
  if (submission.spam) {
    signals.push({ name: "spam_flag", weight: -50, reason: "Spam rule flagged this submission" });
    score -= 50;
  }

  // Email domain.
  const email = submission.submitterEmail ?? pickString(submission.payload ?? {}, "email", "Email");
  if (email) {
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    if (FREE_MAIL_DOMAINS.has(domain)) {
      signals.push({ name: "free_mail_domain", weight: 5, reason: `Email domain ${domain} is a free-mail provider` });
      score += 5;
    } else if (domain) {
      signals.push({ name: "business_email", weight: 30, reason: `Business email domain (${domain})` });
      score += 30;
    }
  } else {
    signals.push({ name: "missing_email", weight: -15, reason: "No email present in payload" });
    score -= 15;
  }

  // Company.
  const company = pickString(submission.payload ?? {}, "company", "Company", "organization", "org");
  if (company) {
    signals.push({ name: "company_provided", weight: 20, reason: `Company: ${company}` });
    score += 20;
  }

  // Title.
  const title = pickString(submission.payload ?? {}, "title", "jobTitle", "role");
  if (title) {
    signals.push({ name: "title_provided", weight: 15, reason: `Title: ${title}` });
    score += 15;
    if (/(vp|chief|head|director|cto|ceo|cio|cmo)/i.test(title)) {
      signals.push({ name: "senior_title", weight: 15, reason: "Title looks senior" });
      score += 15;
    }
  }

  // Phone.
  const phone = pickString(submission.payload ?? {}, "phone", "Phone", "phoneNumber");
  if (phone) {
    signals.push({ name: "phone_provided", weight: 10, reason: "Phone number provided" });
    score += 10;
  }

  // Recency (anything submitted in the last 24h is fresh).
  const submittedAtMs = Date.parse(submission.submittedAt);
  if (Number.isFinite(submittedAtMs)) {
    const hours = (Date.now() - submittedAtMs) / (60 * 60 * 1000);
    if (hours <= 24) {
      signals.push({ name: "fresh", weight: 5, reason: `Submitted ${hours.toFixed(1)}h ago` });
      score += 5;
    }
  }

  const clamped = Math.max(0, Math.min(100, score));
  const narrative = `Lead scored ${clamped}/100 based on ${signals.length} signals. ` +
    `Top signals: ${signals
      .slice()
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      .slice(0, 3)
      .map((s) => s.name)
      .join(", ")}.`;

  return new Response(
    JSON.stringify({
      submissionId: submission.id,
      score: clamped,
      signals,
      narrative,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
