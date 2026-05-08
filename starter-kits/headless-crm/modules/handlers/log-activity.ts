import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import type { Activity } from "../repositories/activities.ts";
import { activityRepository } from "../repositories/activities.ts";
import { sendResendEmail } from "../integrations/resend.ts";

interface Body {
  kind: Activity["kind"];
  subject: string;
  body: string;
  dealId?: string;
  contactId?: string;
  accountId?: string;
  occurredAt?: string;
  ownerEmail: string;
  /** When true and kind === "email", also send the email via Resend. */
  sendEmail?: boolean;
  /** Recipient(s) — required when sendEmail is true. */
  toEmail?: string | string[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;

  let resendId: string | undefined;
  if (body.sendEmail && body.kind === "email") {
    if (!body.toEmail) {
      return new Response(
        JSON.stringify({
          error: {
            type: "invalid_body",
            message: "toEmail is required when sendEmail is true",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    const sent = await sendResendEmail({
      to: body.toEmail,
      subject: body.subject,
      text: body.body,
      replyTo: body.ownerEmail,
    });
    resendId = sent.id;
  }

  const created = await activityRepository.create(tenantId, {
    kind: body.kind,
    subject: body.subject,
    body: body.body,
    dealId: body.dealId ?? null,
    contactId: body.contactId ?? null,
    accountId: body.accountId ?? null,
    occurredAt: body.occurredAt ?? new Date().toISOString(),
    ownerEmail: body.ownerEmail,
  });

  return new Response(
    JSON.stringify({ ...created, resendId }),
    {
      status: 201,
      headers: { "content-type": "application/json" },
    },
  );
}
