import type { ZuploContext, ZuploRequest } from "@zuplo/runtime";
import { environment } from "@zuplo/runtime";
import { verifyGoogleConversionSignature, uploadOfflineConversion } from "../integrations/google-ads.ts";
import {
  conversionRepository,
  touchpointRepository,
  visitorRepository,
} from "../repositories/touchpoints.ts";

/**
 * Inbound webhook for Google Ads conversion events.
 *
 * Use case: a server-side Google Tag Manager tag (or your CRM) POSTs here
 * when a conversion fires. The handler:
 *   1. Verifies the bearer token against GOOGLE_ADS_CONVERSION_SECRET.
 *   2. Records a paid_search touchpoint (with the gclid as sessionId so we
 *      can later upload offline conversions back to Google Ads).
 *   3. Records the conversion against the visitor.
 *   4. Optionally calls Google Ads' uploadClickConversions to credit the
 *      gclid (only when `?upload=true` is set on the URL).
 *
 * Tenant resolution: pass `?tenant=<tenantId>` in the webhook URL or set
 * GOOGLE_ADS_DEFAULT_TENANT_ID.
 */
interface Body {
  /** Google Click ID — required to attribute back to a Google Ads click. */
  gclid: string;
  /** Visitor identifier (matches existing first-party visitor or creates one). */
  visitorAnonymousId?: string;
  /** "purchase", "signup", "trial", "demo". */
  kind?: "signup" | "purchase" | "trial" | "demo";
  /** Conversion value in cents. */
  valueCents?: number;
  /** ISO timestamp; defaults to now. */
  occurredAt?: string;
  /** Optional CRM deal id. */
  dealId?: string | null;
  /** Optional campaign info from the GTM tag. */
  campaignName?: string;
  source?: string;
  medium?: string;
  url?: string;
  currencyCode?: string;
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const env = environment as Record<string, string | undefined>;
  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenant") ?? env.GOOGLE_ADS_DEFAULT_TENANT_ID;
  if (!tenantId) {
    return new Response(
      JSON.stringify({
        error: {
          type: "missing_tenant",
          message: "Pass ?tenant=<tenantId> or set GOOGLE_ADS_DEFAULT_TENANT_ID.",
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (!verifyGoogleConversionSignature(request.headers)) {
    return new Response(
      JSON.stringify({ error: { type: "unauthorized" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new Response(
      JSON.stringify({ error: { type: "invalid_body" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if (!body.gclid) {
    return new Response(
      JSON.stringify({ error: { type: "bad_request", message: "gclid is required" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Find or create the visitor.
  const anonymousId = body.visitorAnonymousId ?? `gclid:${body.gclid}`;
  let visitor: { id: string } | null = null;
  let cursor: string | null | undefined;
  do {
    const page = await visitorRepository.list(tenantId, {
      limit: 200,
      cursor: cursor ?? undefined,
    });
    const match = page.items.find((v) => v.anonymousId === anonymousId);
    if (match) {
      visitor = match;
      break;
    }
    cursor = page.nextCursor;
  } while (cursor);

  const occurredAt = body.occurredAt ?? new Date().toISOString();

  if (!visitor) {
    visitor = await visitorRepository.create(tenantId, {
      anonymousId,
      firstSeenAt: occurredAt,
      lastSeenAt: occurredAt,
      identifiedEmail: null,
      attributes: { gclid: body.gclid, source: "google_ads_conversion" },
    });
  }

  // Touchpoint for the paid click (sessionId = gclid so we can upload back).
  await touchpointRepository.create(tenantId, {
    visitorId: visitor.id,
    channel: "paid_search",
    campaignName: body.campaignName ?? "",
    source: body.source ?? "google",
    medium: body.medium ?? "cpc",
    occurredAt,
    url: body.url ?? "",
    sessionId: body.gclid,
  });

  // Conversion.
  const created = await conversionRepository.create(tenantId, {
    visitorId: visitor.id,
    kind: body.kind ?? "purchase",
    valueCents: body.valueCents ?? 0,
    occurredAt,
    dealId: body.dealId ?? null,
  });

  // Optionally bounce the conversion back to Google Ads.
  let upload: { ok: boolean; error?: string } | null = null;
  if (url.searchParams.get("upload") === "true" && env.GOOGLE_ADS_OAUTH_ACCESS_TOKEN) {
    try {
      await uploadOfflineConversion({
        gclid: body.gclid,
        conversionDateTime: formatGoogleConvTime(occurredAt),
        conversionValue: (body.valueCents ?? 0) / 100,
        currencyCode: body.currencyCode ?? "USD",
      });
      upload = { ok: true };
    } catch (err) {
      upload = { ok: false, error: err instanceof Error ? err.message : String(err) };
      context.log.warn("Google Ads upload failed", { err: upload.error });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      visitorId: visitor.id,
      conversion: created,
      upload,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/**
 * Google Ads conversion upload requires a `yyyy-MM-dd HH:mm:ss±HH:MM` format
 * (with timezone offset). Convert ISO 8601 by simple substitution.
 */
function formatGoogleConvTime(iso: string): string {
  // 2026-05-08T12:34:56.000Z -> 2026-05-08 12:34:56+00:00
  const parts = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  if (!parts) return iso;
  return `${parts[1]} ${parts[2]}+00:00`;
}
