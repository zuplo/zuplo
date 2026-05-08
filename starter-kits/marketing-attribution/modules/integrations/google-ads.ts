import { environment } from "@zuplo/runtime";

/**
 * Google Ads integration — Google Ads API + Conversion Upload.
 *
 * Three surfaces:
 *   1. Inbound — `/webhooks/google-ads-conversion` accepts Google Ads
 *      conversion-tracking pings (e.g. from a Google Tag Manager server-side
 *      tag). Verified via a shared secret in the `Authorization` header.
 *   2. Outbound — `searchstream` lets us pull spend by campaign for the
 *      `find_underrated_channels` orchestrator.
 *   3. Outbound — Conversion Upload back to Google Ads (so a CRM-confirmed
 *      sale gets credited in Smart Bidding).
 *
 * Env vars:
 *   GOOGLE_ADS_DEVELOPER_TOKEN        — Google Ads developer token
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID      — MCC customer id (no dashes)
 *   GOOGLE_ADS_CUSTOMER_ID            — operating customer id (no dashes)
 *   GOOGLE_ADS_OAUTH_ACCESS_TOKEN     — OAuth2 access token; refresh upstream
 *   GOOGLE_ADS_API_VERSION            — default "v17"
 *   GOOGLE_ADS_CONVERSION_SECRET      — shared bearer token used to verify
 *                                       inbound conversion webhooks
 *   GOOGLE_ADS_CONVERSION_ACTION_ID   — required for upload_offline_conversion
 */

const ADS_HOST = "https://googleads.googleapis.com";

function apiVersion(): string {
  return (environment as Record<string, string | undefined>).GOOGLE_ADS_API_VERSION ?? "v17";
}

function devToken(): string {
  const t = (environment as Record<string, string | undefined>).GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!t) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not set");
  return t;
}

function customerId(): string {
  const id = (environment as Record<string, string | undefined>).GOOGLE_ADS_CUSTOMER_ID;
  if (!id) throw new Error("GOOGLE_ADS_CUSTOMER_ID is not set");
  return id.replace(/-/g, "");
}

function loginCustomerId(): string | null {
  return (
    (environment as Record<string, string | undefined>).GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(
      /-/g,
      "",
    ) ?? null
  );
}

function accessToken(): string {
  const t = (environment as Record<string, string | undefined>).GOOGLE_ADS_OAUTH_ACCESS_TOKEN;
  if (!t) throw new Error("GOOGLE_ADS_OAUTH_ACCESS_TOKEN is not set");
  return t;
}

function adsHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken()}`,
    "developer-token": devToken(),
    "content-type": "application/json",
  };
  const lcid = loginCustomerId();
  if (lcid) headers["login-customer-id"] = lcid;
  return headers;
}

export interface GoogleAdsCampaignSpend {
  campaignId: string;
  campaignName: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  /** ISO date (yyyy-mm-dd). */
  date: string;
}

/**
 * Run a GAQL query via searchStream and parse the campaign spend rows.
 * Defaults to last 30 days.
 */
export async function fetchCampaignSpend(args: {
  windowDays?: number;
}): Promise<GoogleAdsCampaignSpend[]> {
  const windowDays = args.windowDays ?? 30;
  const since = new Date(Date.now() - windowDays * 86400000)
    .toISOString()
    .split("T")[0];
  const until = new Date().toISOString().split("T")[0];

  const query = `
    SELECT campaign.id, campaign.name, segments.date,
           metrics.cost_micros, metrics.impressions, metrics.clicks
    FROM campaign
    WHERE segments.date BETWEEN '${since}' AND '${until}'
  `;

  const res = await fetch(
    `${ADS_HOST}/${apiVersion()}/customers/${encodeURIComponent(customerId())}/googleAds:searchStream`,
    {
      method: "POST",
      headers: adsHeaders(),
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) {
    throw new Error(`Google Ads searchStream failed: ${res.status} ${await res.text()}`);
  }
  // searchStream returns an array of GoogleAdsServerStreamingResponse messages.
  // (The HTTP transport delivers the entire array as one JSON document.)
  const body = (await res.json()) as Array<{
    results?: Array<{
      campaign?: { id?: string; name?: string };
      segments?: { date?: string };
      metrics?: { costMicros?: string; impressions?: string; clicks?: string };
    }>;
  }>;
  const out: GoogleAdsCampaignSpend[] = [];
  for (const message of body) {
    for (const row of message.results ?? []) {
      const costMicros = Number(row.metrics?.costMicros ?? "0");
      out.push({
        campaignId: String(row.campaign?.id ?? ""),
        campaignName: row.campaign?.name ?? "",
        spendCents: Math.round(costMicros / 10000), // micros are 1/1,000,000; cents are 1/100
        impressions: Number(row.metrics?.impressions ?? "0"),
        clicks: Number(row.metrics?.clicks ?? "0"),
        date: row.segments?.date ?? "",
      });
    }
  }
  return out;
}

export interface OfflineConversionUpload {
  /** Google Click ID — comes from the gclid URL parameter or stored on the visitor. */
  gclid: string;
  /** The conversion action resource name, e.g. "customers/123/conversionActions/456". */
  conversionAction?: string;
  /** ISO timestamp of the conversion (with timezone offset, e.g. "2026-05-08 12:00:00-07:00"). */
  conversionDateTime: string;
  /** Conversion value in account currency. */
  conversionValue: number;
  /** ISO 4217 currency code (e.g. "USD"). */
  currencyCode: string;
}

/**
 * Upload an offline conversion back to Google Ads so Smart Bidding can use it.
 * Used after a CRM-confirmed sale to attribute the click that drove it.
 */
export async function uploadOfflineConversion(
  args: OfflineConversionUpload,
): Promise<{ partialFailureError: unknown; results: unknown[] }> {
  const env = environment as Record<string, string | undefined>;
  const conversionAction =
    args.conversionAction ??
    (env.GOOGLE_ADS_CONVERSION_ACTION_ID
      ? `customers/${customerId()}/conversionActions/${env.GOOGLE_ADS_CONVERSION_ACTION_ID}`
      : null);
  if (!conversionAction) {
    throw new Error(
      "Pass `conversionAction` or set GOOGLE_ADS_CONVERSION_ACTION_ID.",
    );
  }
  const res = await fetch(
    `${ADS_HOST}/${apiVersion()}/customers/${encodeURIComponent(customerId())}:uploadClickConversions`,
    {
      method: "POST",
      headers: adsHeaders(),
      body: JSON.stringify({
        conversions: [
          {
            gclid: args.gclid,
            conversionAction,
            conversionDateTime: args.conversionDateTime,
            conversionValue: args.conversionValue,
            currencyCode: args.currencyCode,
          },
        ],
        partialFailure: true,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Google Ads upload failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as { partialFailureError: unknown; results: unknown[] };
}

/**
 * Verify a conversion-webhook bearer token. The kit ships with a simple
 * shared-secret model — set GOOGLE_ADS_CONVERSION_SECRET and configure the
 * upstream sender (e.g. a GTM server tag) to send `Authorization: Bearer …`.
 */
export function verifyGoogleConversionSignature(headers: Headers): boolean {
  const expected = (environment as Record<string, string | undefined>)
    .GOOGLE_ADS_CONVERSION_SECRET;
  if (!expected) return false;
  const auth = headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const provided = match[1];
  if (provided.length !== expected.length) return false;
  let r = 0;
  for (let i = 0; i < provided.length; i++) {
    r |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return r === 0;
}
