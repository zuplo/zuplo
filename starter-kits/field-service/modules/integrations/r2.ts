import { environment } from "@zuplo/runtime";

/**
 * Cloudflare R2 (S3-compatible) integration.
 *
 * Generates presigned PUT URLs that the technician's mobile app can
 * upload inspection photos directly to, without proxying bytes through
 * the edge runtime.
 *
 * Implements AWS Signature Version 4 (query-string form) using only
 * Web Crypto APIs — no AWS SDK. The signing routine is generic enough
 * to extend to GET, DELETE, or other S3 ops if needed.
 *
 * Docs:
 *   https://developers.cloudflare.com/r2/api/s3/presigned-urls/
 *   https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 */

export interface PresignR2UploadRequest {
  /** Object key (path) inside the bucket. */
  key: string;
  /** Override the bucket — defaults to env R2_BUCKET. */
  bucket?: string;
  /** Object content type the uploader will send. */
  contentType?: string;
  /** Expiration in seconds. Defaults to 900 (15 minutes). */
  expiresInSeconds?: number;
}

export interface PresignR2UploadResponse {
  uploadUrl: string;
  publicUrl: string;
  expiresInSeconds: number;
  key: string;
  bucket: string;
  /** Headers the uploader must include with the PUT for the signature to validate. */
  signedHeaders: Record<string, string>;
}

/**
 * Generate a presigned URL the client can PUT object bytes to.
 */
export async function presignR2PutUrl(
  req: PresignR2UploadRequest,
): Promise<PresignR2UploadResponse> {
  const accountId = environment.R2_ACCOUNT_ID;
  const accessKeyId = environment.R2_ACCESS_KEY_ID;
  const secretAccessKey = environment.R2_SECRET_ACCESS_KEY;
  const bucket = req.bucket ?? environment.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must be set",
    );
  }

  const region = "auto";
  const service = "s3";
  const expires = Math.max(60, Math.min(7 * 24 * 3600, req.expiresInSeconds ?? 900));
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const method = "PUT";
  const canonicalUri = `/${encodeURIComponent(bucket)}/${encodeURI(req.key).replace(/%2F/g, "/")}`;

  const now = new Date();
  const amzDate = isoBasic(now); // yyyyMMddTHHmmssZ
  const dateStamp = amzDate.slice(0, 8); // yyyyMMdd
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const signedHeaderKeys = ["host"];
  if (req.contentType) signedHeaderKeys.push("content-type");
  signedHeaderKeys.sort();

  const canonicalQuery = new URLSearchParams();
  canonicalQuery.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  canonicalQuery.set("X-Amz-Credential", `${accessKeyId}/${credentialScope}`);
  canonicalQuery.set("X-Amz-Date", amzDate);
  canonicalQuery.set("X-Amz-Expires", String(expires));
  canonicalQuery.set("X-Amz-SignedHeaders", signedHeaderKeys.join(";"));

  const canonicalQueryString = sortedQuery(canonicalQuery);

  const canonicalHeaders =
    signedHeaderKeys
      .map((k) => `${k}:${k === "host" ? host : (req.contentType ?? "")}`)
      .join("\n") + "\n";

  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaderKeys.join(";"),
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(
    secretAccessKey,
    dateStamp,
    region,
    service,
  );
  const signature = bytesToHex(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        signingKey,
        new TextEncoder().encode(stringToSign),
      ),
    ),
  );

  canonicalQuery.set("X-Amz-Signature", signature);

  const uploadUrl = `https://${host}${canonicalUri}?${sortedQuery(canonicalQuery)}`;

  // R2 returns a deterministic "public" path on the storage host, but
  // most kits front R2 with a custom domain or Cloudflare Worker. Pass
  // R2_PUBLIC_BASE_URL to override.
  const publicBase = environment.R2_PUBLIC_BASE_URL ?? `https://${host}/${bucket}`;
  const publicUrl = `${publicBase.replace(/\/$/, "")}/${encodeURI(req.key)}`;

  const signedHeaders: Record<string, string> = { host };
  if (req.contentType) signedHeaders["content-type"] = req.contentType;

  return {
    uploadUrl,
    publicUrl,
    expiresInSeconds: expires,
    key: req.key,
    bucket,
    signedHeaders,
  };
}

function isoBasic(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    "T" +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}` +
    "Z"
  );
}

function sortedQuery(params: URLSearchParams): string {
  const entries = Array.from(params.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return entries
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");
}

function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return bytesToHex(new Uint8Array(buf));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function deriveSigningKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<CryptoKey> {
  const kSecret = new TextEncoder().encode(`AWS4${secret}`);
  const kDate = await hmac(kSecret, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  return crypto.subtle.importKey(
    "raw",
    kSigning,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}
