import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import { leadRepository, type Lead } from "../repositories/listings.ts";
import { sendResendEmail } from "../integrations/resend.ts";

interface Body {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source?: string;
  agentEmail: string;
  budgetCents?: number | null;
  areaInterest?: string;
  bedroomsMin?: number | null;
  status?: Lead["status"];
  /** When true, suppress confirmation + agent-notification emails. */
  silent?: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const now = new Date().toISOString();

  const created = await leadRepository.create(tenantId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone ?? "",
    source: body.source ?? "manual",
    status: body.status ?? "new",
    agentEmail: body.agentEmail,
    budgetCents: body.budgetCents ?? null,
    areaInterest: body.areaInterest ?? "",
    bedroomsMin: body.bedroomsMin ?? null,
    addedAt: now,
    createdAt: now,
  });

  let confirmationEmailId: string | null = null;
  let agentEmailId: string | null = null;
  const sideEffectErrors: Record<string, string> = {};

  if (!body.silent) {
    // 1. Lead confirmation email.
    try {
      const subject = "Thanks for reaching out — we got your inquiry";
      const text = [
        `Hi ${body.firstName},`,
        ``,
        `Thanks for getting in touch. ${body.agentEmail} will reach out shortly to discuss your search${body.areaInterest ? ` in ${body.areaInterest}` : ""}.`,
        ``,
        `If you have anything to add, just reply to this email.`,
      ].join("\n");
      const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.5">${text
        .split("\n")
        .map((l) => `<p style="margin:0 0 0.6em">${escapeHtml(l) || "&nbsp;"}</p>`)
        .join("")}</div>`;
      const res = await sendResendEmail({
        to: body.email,
        subject,
        text,
        html,
        replyTo: body.agentEmail,
        idempotencyKey: `lead-confirm-${created.id}`,
      });
      confirmationEmailId = res.id;
    } catch (err) {
      sideEffectErrors.confirmation = (err as Error).message;
    }

    // 2. Agent notification email.
    try {
      const subject = `New lead: ${body.firstName} ${body.lastName}`;
      const text = [
        `${body.firstName} ${body.lastName}`,
        `Email: ${body.email}`,
        body.phone ? `Phone: ${body.phone}` : "",
        body.areaInterest ? `Looking in: ${body.areaInterest}` : "",
        body.bedroomsMin ? `Min bedrooms: ${body.bedroomsMin}` : "",
        body.budgetCents
          ? `Budget: $${(body.budgetCents / 100).toLocaleString()}`
          : "",
        `Source: ${body.source ?? "manual"}`,
        ``,
        `Lead id: ${created.id}`,
      ]
        .filter(Boolean)
        .join("\n");
      const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`;
      const res = await sendResendEmail({
        to: body.agentEmail,
        subject,
        text,
        html,
        replyTo: body.email,
        idempotencyKey: `lead-notify-${created.id}`,
      });
      agentEmailId = res.id;
    } catch (err) {
      sideEffectErrors.agentNotification = (err as Error).message;
    }
  }

  return new Response(
    JSON.stringify({
      lead: created,
      confirmationEmailId,
      agentEmailId,
      sideEffectErrors,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
