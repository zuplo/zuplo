import { environment } from "@zuplo/runtime";

/**
 * Meta Ads (Facebook/Instagram) integration.
 *
 * Two surfaces:
 *   1. Inbound — Lead Ads webhook (page subscribes_field=leadgen). Meta
 *      POSTs a payload with `entry[].changes[].value.leadgen_id`; we hit
 *      the Graph API to fetch the actual lead.
 *   2. Outbound — `/insights` reads. Used by the find_underrated_channels
 *      orchestrator to compare on-platform spend against attributed value.
 *
 * Env vars:
 *   META_GRAPH_VERSION         — default "v19.0"
 *   META_APP_SECRET            — used to verify x-hub-signature-256
 *   META_PAGE_ACCESS_TOKEN     — page token to fetch leadgen objects
 *   META_AD_ACCOUNT_ID         — "act_1234..." for /insights
 *   META_VERIFY_TOKEN          — token used in the Meta GET-verification handshake
 */

const GRAPH_HOST = "https://graph.facebook.com";

function graphVersion(): string {
  return (environment as Record<string, string | undefined>).META_GRAPH_VERSION ?? "v19.0";
}

function pageAccessToken(): string {
  const token = (environment as Record<string, string | undefined>).META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("META_PAGE_ACCESS_TOKEN is not set");
  return token;
}

export interface MetaLeadField {
  name: string;
  values: string[];
}

export interface MetaLead {
  id: string;
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  field_data: MetaLeadField[];
}

/**
 * Fetch a Lead Ads lead by id. Meta's lead webhook gives us the id; we
 * have to fetch the actual content separately.
 */
export async function fetchMetaLead(leadId: string): Promise<MetaLead> {
  const url = new URL(`${GRAPH_HOST}/${graphVersion()}/${encodeURIComponent(leadId)}`);
  url.searchParams.set("access_token", pageAccessToken());
  url.searchParams.set(
    "fields",
    "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data",
  );
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Meta fetchLead failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as MetaLead;
}

/**
 * Pull a flat field map from a Meta lead's field_data array.
 */
export function flattenLeadFields(lead: MetaLead): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of lead.field_data ?? []) {
    out[f.name] = (f.values ?? [])[0] ?? "";
  }
  return out;
}

export interface MetaAdInsight {
  /** Insights are typically pulled at ad/adset/campaign level. */
  level: string;
  campaignId: string | null;
  campaignName: string | null;
  spendCents: number;
  impressions: number;
  clicks: number;
  /** ISO date (start of the reporting day). */
  dateStart: string;
  dateStop: string;
}

/**
 * Pull spend insights from the Meta Ads /insights edge for an ad account.
 * Defaults to last 30 days, level=campaign.
 */
export async function fetchMetaInsights(args: {
  windowDays?: number;
  level?: "ad" | "adset" | "campaign";
}): Promise<MetaAdInsight[]> {
  const env = environment as Record<string, string | undefined>;
  const accessToken = env.META_PAGE_ACCESS_TOKEN;
  const adAccountId = env.META_AD_ACCOUNT_ID;
  if (!accessToken) throw new Error("META_PAGE_ACCESS_TOKEN is not set");
  if (!adAccountId) throw new Error("META_AD_ACCOUNT_ID is not set");

  const windowDays = args.windowDays ?? 30;
  const since = new Date(Date.now() - windowDays * 86400000)
    .toISOString()
    .split("T")[0];
  const until = new Date().toISOString().split("T")[0];

  const url = new URL(`${GRAPH_HOST}/${graphVersion()}/${encodeURIComponent(adAccountId)}/insights`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("level", args.level ?? "campaign");
  url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks");
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("time_increment", "1");

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Meta /insights failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    data?: Array<{
      campaign_id?: string;
      campaign_name?: string;
      spend?: string;
      impressions?: string;
      clicks?: string;
      date_start: string;
      date_stop: string;
    }>;
  };
  return (body.data ?? []).map((row) => ({
    level: args.level ?? "campaign",
    campaignId: row.campaign_id ?? null,
    campaignName: row.campaign_name ?? null,
    spendCents: Math.round(Number(row.spend ?? "0") * 100),
    impressions: Number(row.impressions ?? "0"),
    clicks: Number(row.clicks ?? "0"),
    dateStart: row.date_start,
    dateStop: row.date_stop,
  }));
}

/**
 * Verify Meta's x-hub-signature-256 header against the raw body using
 * META_APP_SECRET. Returns true if the signature matches.
 */
export async function verifyMetaSignature(args: {
  rawBody: string;
  headers: Headers;
}): Promise<boolean> {
  const secret = (environment as Record<string, string | undefined>).META_APP_SECRET;
  if (!secret) return false;
  const header = args.headers.get("x-hub-signature-256");
  if (!header) return false;
  const expected = header.startsWith("sha256=") ? header.slice(7) : header;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(args.rawBody),
  );
  const computed = bytesToHex(new Uint8Array(sigBuf));
  return constantTimeEq(computed, expected);
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
