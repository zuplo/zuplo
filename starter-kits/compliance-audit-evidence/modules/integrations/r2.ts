import { environment } from "@zuplo/runtime";

/**
 * Cloudflare R2 (S3-compatible) storage for evidence artifacts.
 *
 * Why R2: zero egress fees + S3-compatible REST + works fine from Zuplo's
 * edge runtime. We use the SigV4 protocol directly — Web Crypto handles the
 * HMAC and SHA256 work without pulling in any Node SDK.
 *
 * Each evidence file is stored at `<prefix>/<controlId>/<sha256>.<ext>`. The
 * SHA-256 of the bytes is the canonical filename, so the bucket is
 * inherently dedup'd; it also doubles as the integrity hash that goes on the
 * Evidence record.
 *
 * Docs:
 *   - https://developers.cloudflare.com/r2/api/s3/api/
 *   - https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
 */

interface PutOptions {
  /** Optional content-type, e.g. `image/png`. */
  contentType?: string;
  /** Optional metadata stored alongside the object. */
  metadata?: Record<string, string>;
}

export interface PutEvidenceResult {
  key: string;
  /** Full URL to fetch the object via the R2 worker / public bucket. */
  url: string;
  /** SHA-256 of the body, hex-encoded. */
  sha256: string;
  /** Object size in bytes. */
  size: number;
}

/**
 * Upload a file to R2. `body` may be a string, Uint8Array, or ArrayBuffer.
 * Returns the canonical URL plus the integrity sha256.
 */
export async function putEvidence(
  key: string,
  body: string | Uint8Array | ArrayBuffer,
  options: PutOptions = {},
): Promise<PutEvidenceResult> {
  const { accountId, accessKeyId, secretAccessKey, bucket, publicUrl } = config();

  const bodyBytes = typeof body === "string" ? new TextEncoder().encode(body) : new Uint8Array(body as ArrayBuffer);
  const sha256 = await sha256Hex(bodyBytes);
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const url = `https://${host}/${bucket}/${encodeKey(key)}`;

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": sha256,
    "x-amz-date": amzDate(new Date()),
    "content-length": String(bodyBytes.byteLength),
  };
  if (options.contentType) headers["content-type"] = options.contentType;
  for (const [k, v] of Object.entries(options.metadata ?? {})) {
    headers[`x-amz-meta-${k.toLowerCase()}`] = v;
  }

  const auth = await sigV4(
    "PUT",
    `/${bucket}/${encodeKey(key)}`,
    "",
    headers,
    sha256,
    accessKeyId,
    secretAccessKey,
    "auto",
    "s3",
  );
  headers.authorization = auth;

  const res = await fetch(url, { method: "PUT", headers, body: bodyBytes });
  if (!res.ok) {
    throw new Error(`R2 PUT failed: ${res.status} ${await res.text()}`);
  }
  return {
    key,
    url: publicUrl ? `${publicUrl.replace(/\/$/, "")}/${encodeKey(key)}` : url,
    sha256,
    size: bodyBytes.byteLength,
  };
}

/**
 * GET an evidence object as bytes. Returns null on 404.
 */
export async function getEvidence(key: string): Promise<Uint8Array | null> {
  const { accountId, accessKeyId, secretAccessKey, bucket } = config();
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const url = `https://${host}/${bucket}/${encodeKey(key)}`;
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    "x-amz-date": amzDate(new Date()),
  };
  const auth = await sigV4(
    "GET",
    `/${bucket}/${encodeKey(key)}`,
    "",
    headers,
    "UNSIGNED-PAYLOAD",
    accessKeyId,
    secretAccessKey,
    "auto",
    "s3",
  );
  headers.authorization = auth;

  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`R2 GET failed: ${res.status} ${await res.text()}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// ── internals ────────────────────────────────────────────────────────────

function config() {
  const accountId = environment.R2_ACCOUNT_ID;
  const accessKeyId = environment.R2_ACCESS_KEY_ID;
  const secretAccessKey = environment.R2_SECRET_ACCESS_KEY;
  const bucket = environment.R2_BUCKET ?? "evidence";
  const publicUrl = environment.R2_PUBLIC_URL;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are required",
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg).replace(/%2F/g, "/"))
    .join("/");
}

function amzDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, "")
    .replace(/Z$/, "Z");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function sigV4(
  method: string,
  path: string,
  query: string,
  headers: Record<string, string>,
  payloadHash: string,
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  service: string,
): Promise<string> {
  const date = headers["x-amz-date"];
  const datestamp = date.slice(0, 8);
  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders =
    sortedHeaderKeys
      .map((k) => `${k.toLowerCase()}:${headers[k].trim()}\n`)
      .join("");
  const signedHeaders = sortedHeaderKeys.map((k) => k.toLowerCase()).join(";");
  const canonicalRequest = [
    method,
    path,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credScope = `${datestamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    credScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const kDate = await hmac(new TextEncoder().encode(`AWS4${secretAccessKey}`), datestamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = await hmac(kSigning, stringToSign);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
}
