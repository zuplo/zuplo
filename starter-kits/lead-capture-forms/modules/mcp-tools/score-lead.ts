import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Submission } from "../repositories/submissions.ts";
import { gradeLeadWithClaude, type LeadGrade } from "../integrations/claude.ts";
import { sendResendEmail, buildSubmissionConfirmation } from "../integrations/resend.ts";
import { postToSlack, buildSubmissionAlert } from "../integrations/slack.ts";

/**
 * Orchestrator MCP tool: score_lead.
 *
 * Loads a submission, evaluates a small set of fit signals (business email,
 * presence of company/title/phone, recency, spam status), then optionally
 * grades the submission with Claude for intent + spam detection. Returns a
 * 0-100 score plus a per-signal breakdown the LLM can quote in a handoff.
 *
 * Side effects (configurable via body flags, default off):
 *   - notifySlack: post a `New lead` card to Slack with score + payload preview
 *   - confirmEmail: send a Resend confirmation email back to the submitter
 *
 * Failures in either side-effect path are caught and reported in the
 * response so the caller can see what shipped vs what did not.
 */
interface Body {
  submissionId: string;
  /** If true, blend Claude's grade into the score and surface its reasoning. */
  useClaude?: boolean;
  /** If true, post the result to Slack via SLACK_WEBHOOK_URL or chat.postMessage. */
  notifySlack?: boolean;
  /** If true, send a Resend confirmation email to the submitter. */
  confirmEmail?: boolean;
  /** Optional form name to use in Slack/Resend templates. Defaults to "this form". */
  formName?: string;
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

  // Optional: Claude grading. Blends 50/50 with the heuristic score and
  // surfaces an `isSpam` veto.
  let claudeGrade: LeadGrade | null = null;
  let claudeError: string | null = null;
  if (body.useClaude) {
    try {
      claudeGrade = await gradeLeadWithClaude({
        formName: body.formName ?? "this form",
        payload: submission.payload ?? {},
        submitterEmail: email,
      });
      // Blend: average heuristic (clamped) and Claude scores.
      const heuristicClamped = Math.max(0, Math.min(100, score));
      score = Math.round((heuristicClamped + claudeGrade.score) / 2);
      signals.push({
        name: "claude_grade",
        weight: claudeGrade.score - heuristicClamped,
        reason: `Claude graded ${claudeGrade.score}/100 (${claudeGrade.intent}): ${claudeGrade.reasoning}`,
      });
      if (claudeGrade.isSpam) {
        signals.push({ name: "claude_spam_veto", weight: -100, reason: "Claude flagged this as spam." });
        score = Math.min(score, 5);
      }
    } catch (err) {
      claudeError = err instanceof Error ? err.message : String(err);
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

  const sideEffects: { slack: string | null; email: string | null } = {
    slack: null,
    email: null,
  };

  if (body.notifySlack) {
    try {
      const result = await postToSlack(
        buildSubmissionAlert({
          formName: body.formName ?? "Unknown form",
          submitterEmail: email,
          score: clamped,
          routedTo: submission.routedTo,
          payloadPreview: submission.payload ?? {},
          submissionId: submission.id,
        }),
      );
      sideEffects.slack = result.ok ? "sent" : "failed";
    } catch (err) {
      sideEffects.slack = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (body.confirmEmail && email) {
    try {
      const result = await sendResendEmail(
        buildSubmissionConfirmation({
          to: email,
          formName: body.formName ?? "our website",
        }),
      );
      sideEffects.email = `sent:${result.id}`;
    } catch (err) {
      // Log full error server-side; return only a stable label to the caller.
      context.log.warn("Lead-capture confirm email failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      sideEffects.email = "error: send_failed";
    }
  } else if (body.confirmEmail && !email) {
    sideEffects.email = "skipped: no email in payload";
  }

  return new Response(
    JSON.stringify({
      submissionId: submission.id,
      score: clamped,
      signals,
      narrative,
      claude: claudeGrade
        ? {
            score: claudeGrade.score,
            intent: claudeGrade.intent,
            isSpam: claudeGrade.isSpam,
            reasoning: claudeGrade.reasoning,
          }
        : null,
      claudeError,
      sideEffects,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
