import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { invokeJson } from "@zuplo/starter-kit-shared/mcp";
import type { Question, Survey } from "../repositories/surveys.ts";
import { sendResendEmail } from "../integrations/resend.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";

/**
 * Orchestrator MCP tool: send_survey.
 *
 * Distributes a survey to a recipient list. Supports two channels:
 *
 *   - `email` — uses Resend; one personalised email per recipient.
 *   - `sms` — uses Twilio; one short SMS per recipient with a link.
 *
 * The tool validates the survey is `open`, formats a per-recipient message
 * referencing the survey title and a `respondUrl` (which the caller should
 * pre-render — e.g. https://your-app.example/s/<slug>?email=foo), and
 * fans out. Returns a per-recipient delivery report.
 */

interface Recipient {
  email?: string;
  phone?: string;
  /** Personalisation token, e.g. first name. */
  name?: string;
}

interface Body {
  surveyId: string;
  channel: "email" | "sms";
  recipients: Recipient[];
  /** Public URL the recipient should visit. Use `{email}` / `{phone}` / `{name}` placeholders if you want substitution. */
  respondUrl: string;
  /** Override the email subject (email channel only). */
  subject?: string;
  /** Override the message body. Supports `{title}`, `{description}`, `{respondUrl}`, `{name}`. */
  bodyTemplate?: string;
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface QuestionPage {
  items: Question[];
  nextCursor: string | null;
}

interface DeliveryReport {
  to: string;
  channel: "email" | "sms";
  ok: boolean;
  id: string | null;
  error: string | null;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const body = (await request.json()) as Body;
  if (!body.surveyId) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "surveyId is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (body.channel !== "email" && body.channel !== "sms") {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "channel must be 'email' or 'sms'" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (!Array.isArray(body.recipients) || body.recipients.length === 0) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "recipients[] required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const auth = { authorization: request.headers.get("authorization") ?? "" };

  const survey = await invokeJson<Survey>(
    context,
    `/surveys/${encodeURIComponent(body.surveyId)}`,
    { headers: auth },
  );
  if (survey.status !== "open") {
    return new Response(
      JSON.stringify({ error: { type: "conflict", message: `Survey is ${survey.status}; open it before sending.` } }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  // Cap loop on questions to prevent runaway pagination on large surveys.
  let questionCount = 0;
  let qCursor: string | null | undefined = undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (qCursor) qs.set("cursor", qCursor);
    const page = await invokeJson<QuestionPage>(
      context,
      `/surveys/${encodeURIComponent(body.surveyId)}/questions?${qs}`,
      { headers: auth },
    );
    questionCount += page.items.length;
    qCursor = page.nextCursor;
    if (questionCount > 5000) break;
  } while (qCursor);

  const defaultSubject = `${survey.title} — your input requested`;
  const defaultText =
    "Hi {name}, please take {questionCount}-question survey: {title}. {description}\n\n{respondUrl}";

  const reports: DeliveryReport[] = [];
  for (const r of body.recipients) {
    const target = body.channel === "email" ? r.email : r.phone;
    if (!target) {
      reports.push({
        to: "",
        channel: body.channel,
        ok: false,
        id: null,
        error: `Missing ${body.channel === "email" ? "email" : "phone"}`,
      });
      continue;
    }
    const vars = {
      name: r.name ?? "there",
      title: survey.title,
      description: survey.description,
      respondUrl: render(body.respondUrl, {
        email: r.email ?? "",
        phone: r.phone ?? "",
        name: r.name ?? "",
      }),
      questionCount: String(questionCount),
    };
    const text = render(body.bodyTemplate ?? defaultText, vars);

    try {
      if (body.channel === "email") {
        const html = `<p>${escapeHtml(text).replace(/\n/g, "<br/>")}</p>`;
        const sent = await sendResendEmail({
          to: target,
          subject: render(body.subject ?? defaultSubject, vars),
          html,
          text,
        });
        reports.push({ to: target, channel: "email", ok: true, id: sent.id, error: null });
      } else {
        const sent = await sendTwilioSms({ to: target, body: text });
        reports.push({ to: target, channel: "sms", ok: true, id: sent.sid, error: null });
      }
    } catch (err) {
      reports.push({
        to: target,
        channel: body.channel,
        ok: false,
        id: null,
        error: (err as Error).message,
      });
    }
  }

  return new Response(
    JSON.stringify({
      surveyId: survey.id,
      channel: body.channel,
      attempted: body.recipients.length,
      delivered: reports.filter((r) => r.ok).length,
      failed: reports.filter((r) => !r.ok).length,
      reports,
    }),
    { headers: { "content-type": "application/json" } },
  );
}
