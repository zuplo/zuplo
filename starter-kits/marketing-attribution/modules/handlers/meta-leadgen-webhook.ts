import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import {
  fetchMetaLead,
  flattenLeadFields,
  verifyMetaSignature,
} from "../integrations/meta-ads.ts";
import { visitorRepository, conversionRepository, touchpointRepository } from "../repositories/touchpoints.ts";

/**
 * Inbound webhook for Meta Lead Ads (Facebook/Instagram).
 *
 * GET — Meta's verification handshake. Returns hub.challenge if the
 *       provided hub.verify_token matches META_VERIFY_TOKEN.
 *
 * POST — Lead notification. Verifies x-hub-signature-256 with META_APP_SECRET,
 *        fetches each leadgen_id from the Graph API, then:
 *          1. upserts a Visitor (anonymous_id = `meta_lead:{leadId}`),
 *          2. records a `paid_search`-style touchpoint with channel=social,
 *             source=meta, medium=lead_ad, campaignName from the lead,
 *          3. records a `signup` conversion.
 *
 * Tenant resolution: this webhook is unauthenticated by Meta, so the kit
 * routes by a `?tenant=` query parameter — set the URL you give Meta to
 * `…/webhooks/meta-ads-leadgen?tenant=<tenantId>`.
 */
interface MetaLeadgenChange {
  field: string;
  value: {
    leadgen_id?: string;
    page_id?: string;
    form_id?: string;
    ad_id?: string;
    created_time?: number;
  };
}

interface MetaLeadgenEntry {
  id: string;
  time: number;
  changes: MetaLeadgenChange[];
}

interface MetaLeadgenPayload {
  object: string;
  entry: MetaLeadgenEntry[];
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const url = new URL(request.url);
  const env = environment as Record<string, string | undefined>;

  // --- GET: Meta verification handshake ---
  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && verifyToken && verifyToken === env.META_VERIFY_TOKEN) {
      return new Response(challenge ?? "", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    return new Response("forbidden", { status: 403 });
  }

  // --- POST: lead notification ---
  const tenantId = url.searchParams.get("tenant") ?? env.META_DEFAULT_TENANT_ID;
  if (!tenantId) {
    return new Response(
      JSON.stringify({ error: { type: "missing_tenant", message: "Pass ?tenant=<tenantId> or set META_DEFAULT_TENANT_ID." } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const rawBody = await request.text();
  const verified = await verifyMetaSignature({ rawBody, headers: request.headers });
  if (!verified) {
    context.log.warn("Meta webhook signature verification failed");
    return new Response(
      JSON.stringify({ error: { type: "invalid_signature" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  let payload: MetaLeadgenPayload;
  try {
    payload = JSON.parse(rawBody) as MetaLeadgenPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: { type: "invalid_body" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const processedLeadIds: string[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const leadId = change.value.leadgen_id;
      if (!leadId) continue;

      try {
        const lead = await fetchMetaLead(leadId);
        const fields = flattenLeadFields(lead);
        const email = fields.email ?? fields.work_email ?? null;
        const visitor = await visitorRepository.create(tenantId, {
          anonymousId: `meta_lead:${leadId}`,
          firstSeenAt: lead.created_time,
          lastSeenAt: lead.created_time,
          identifiedEmail: email,
          attributes: { ...fields, source: "meta_lead_ads" },
        });

        await touchpointRepository.create(tenantId, {
          visitorId: visitor.id,
          channel: "social",
          campaignName: lead.campaign_name ?? "",
          source: "meta",
          medium: "lead_ad",
          occurredAt: lead.created_time,
          url: lead.form_id ? `https://facebook.com/forms/${lead.form_id}` : "",
          sessionId: leadId,
        });

        await conversionRepository.create(tenantId, {
          visitorId: visitor.id,
          kind: "signup",
          valueCents: 0,
          occurredAt: lead.created_time,
          dealId: null,
        });

        processedLeadIds.push(leadId);
      } catch (err) {
        context.log.error("Meta lead processing failed", {
          leadId,
          err: String(err),
        });
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed: processedLeadIds.length, leadIds: processedLeadIds }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
