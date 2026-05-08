import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { requireTenant } from "@zuplo/starter-kit-shared/auth";
import {
  leadRepository,
  listingRepository,
  showingRepository,
} from "../repositories/listings.ts";
import { createGCalEvent } from "../integrations/google-calendar.ts";
import { sendTwilioSms } from "../integrations/twilio.ts";

interface Body {
  listingId: string;
  leadId: string;
  scheduledFor: string;
  durationMinutes?: number;
  agentEmail: string;
  /** When true, skip Calendar + SMS side-effects. */
  silent?: boolean;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const tenantId = requireTenant(request);
  const body = (await request.json()) as Body;
  const durationMinutes = body.durationMinutes ?? 30;

  let calendarEventId: string | null = null;
  let calendarLink: string | null = null;
  let smsSid: string | null = null;
  const sideEffectErrors: Record<string, string> = {};

  let listing = null;
  let lead = null;
  if (!body.silent) {
    listing = await listingRepository.get(tenantId, body.listingId).catch(() => null);
    lead = await leadRepository.get(tenantId, body.leadId).catch(() => null);

    // 1. Calendar event for the agent + lead.
    try {
      const startIso = body.scheduledFor;
      const endIso = new Date(
        new Date(body.scheduledFor).getTime() + durationMinutes * 60_000,
      ).toISOString();
      const summary = listing
        ? `Showing: ${listing.address}${listing.city ? `, ${listing.city}` : ""}`
        : "Property showing";
      const descLines: string[] = [];
      if (listing) {
        descLines.push(`${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`);
        descLines.push(
          `${listing.bedrooms}bd / ${listing.bathrooms}ba / ${listing.squareFeet} sqft`,
        );
        descLines.push(`Listed at $${(listing.listPriceCents / 100).toLocaleString()}`);
      }
      if (lead) {
        descLines.push(`Lead: ${lead.firstName} ${lead.lastName} (${lead.email}${lead.phone ? `, ${lead.phone}` : ""})`);
      }
      const event = await createGCalEvent({
        summary,
        description: descLines.join("\n"),
        location: listing
          ? `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`
          : undefined,
        start: { dateTime: startIso },
        end: { dateTime: endIso },
        attendees: [
          { email: body.agentEmail },
          ...(lead ? [{ email: lead.email, displayName: `${lead.firstName} ${lead.lastName}` }] : []),
        ],
        extendedProperties: {
          private: {
            kitTenantId: tenantId,
            kitListingId: body.listingId,
            kitLeadId: body.leadId,
          },
        },
        sendUpdates: "all",
      });
      calendarEventId = event.id;
      calendarLink = event.htmlLink;
    } catch (err) {
      sideEffectErrors.calendar = (err as Error).message;
    }

    // 2. SMS the lead with the time + address (if we have a phone number).
    if (lead?.phone) {
      try {
        const when = new Date(body.scheduledFor).toUTCString();
        const where = listing
          ? ` at ${listing.address}, ${listing.city}`
          : "";
        const text = `Confirmed: showing${where} on ${when} (${durationMinutes}m). Reply to ${body.agentEmail} with questions.`;
        const sms = await sendTwilioSms({ to: lead.phone, body: text });
        smsSid = sms.sid;
      } catch (err) {
        sideEffectErrors.sms = (err as Error).message;
      }
    }
  }

  const created = await showingRepository.create(tenantId, {
    listingId: body.listingId,
    leadId: body.leadId,
    scheduledFor: body.scheduledFor,
    durationMinutes,
    agentEmail: body.agentEmail,
    status: "scheduled",
    feedback: "",
    calendarEventId,
    createdAt: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      showing: created,
      calendarEventId,
      calendarLink,
      smsSid,
      sideEffectErrors,
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}
