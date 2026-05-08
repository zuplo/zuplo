import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { surveyRepository } from "../repositories/surveys.ts";
import { sendResendEmail } from "../integrations/resend.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";

interface EmailRecipient {
  channel: "email";
  to: string;
}
interface SmsRecipient {
  channel: "sms";
  to: string;
}
type Recipient = EmailRecipient | SmsRecipient;

interface Body {
  /**
   * Recipients with channel — email goes through Resend, SMS goes through
   * Twilio. Bare strings (legacy callers) are interpreted as email.
   */
  recipients: Array<Recipient | string>;
  /** Hosted survey URL (e.g. https://forms.example.com/nps?token=...). */
  surveyUrl?: string;
  /** Twilio status webhook — recommended: https://<gateway>/webhooks/twilio. */
  smsStatusCallback?: string;
}

/**
 * Send a survey to a list of recipients.
 *
 * Email recipients go through Resend; SMS recipients go through Twilio.
 * Failures are isolated per recipient — the response includes a per-row
 * status so callers can retry just the rows that failed.
 *
 * Requires the survey to be in `active` status.
 */
export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const id = request.params.id;
  const body = (await request.json()) as Body;

  const survey = await surveyRepository.get(tenantId, id);
  if (!survey) {
    return new Response(
      JSON.stringify({ error: { type: "not_found", message: "Survey not found" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  if (survey.status !== "active") {
    return new Response(
      JSON.stringify({ error: { type: "conflict", message: "Survey is paused" } }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }

  const recipients: Recipient[] = body.recipients.map((r) =>
    typeof r === "string" ? { channel: "email", to: r } : r,
  );

  const surveyUrl = body.surveyUrl ?? "(your-survey-url-here)";
  const subjectLine = `Quick question: ${survey.question}`;

  const results: Array<{
    to: string;
    channel: "email" | "sms";
    ok: boolean;
    id?: string;
    error?: string;
  }> = [];

  for (const r of recipients) {
    try {
      if (r.channel === "email") {
        const sent = await sendResendEmail({
          to: r.to,
          subject: subjectLine,
          html: `<p>${survey.question}</p><p><a href="${surveyUrl}">Tap here to respond</a> — takes 10 seconds.</p>`,
          text: `${survey.question}\n\nRespond here: ${surveyUrl}`,
          tags: [
            { name: "survey_id", value: id },
            { name: "tenant_id", value: tenantId },
          ],
        });
        results.push({ to: r.to, channel: "email", ok: true, id: sent.id });
      } else {
        const msg = await sendTwilioSms({
          to: r.to,
          body: `${survey.question} ${surveyUrl}`,
          statusCallback: body.smsStatusCallback,
        });
        results.push({ to: r.to, channel: "sms", ok: true, id: msg.sid });
      }
    } catch (err) {
      results.push({
        to: r.to,
        channel: r.channel,
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  const sentCount = results.filter((r) => r.ok).length;

  return new Response(
    JSON.stringify({
      surveyId: id,
      queued: recipients.length,
      sent: sentCount,
      sentAt: new Date().toISOString(),
      results,
    }),
    { status: 202, headers: { "content-type": "application/json" } },
  );
}
