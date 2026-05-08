import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import resendWebhook from "../modules/handlers/resend-webhook.ts";

const env = environment as Record<string, string | undefined>;

/**
 * Resend signs webhooks via Svix:
 *   sig = HMAC-SHA256(secretBytes, `${svix-id}.${svix-timestamp}.${rawBody}`)
 *   `svix-signature` header contains one or more space-separated `v1,<base64>` parts.
 */
async function svixSign(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  secretWithoutPrefix: string,
): Promise<string> {
  const keyBytes = Uint8Array.from(atob(secretWithoutPrefix), (c) =>
    c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${svixId}.${svixTimestamp}.${rawBody}`),
  );
  const bytes = new Uint8Array(sig);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return `v1,${btoa(s)}`;
}

describe("webhook: /webhooks/resend", () => {
  // Pre-computable secret material — `whsec_<base64-of-secret-bytes>`.
  const secretBytes = "test-resend-secret-bytes-32-bytes-long-x";
  // Encode to base64 for the Svix-style envelope.
  const secretB64 = btoa(secretBytes);
  const fullSecret = `whsec_${secretB64}`;

  afterEach(() => {
    vi.restoreAllMocks();
    delete env.RESEND_WEBHOOK_SECRET;
  });

  it("accepts a request with a valid Svix signature and acks the event", async () => {
    env.RESEND_WEBHOOK_SECRET = fullSecret;
    const svixId = "msg_test_1";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({
      type: "email.delivered",
      created_at: "2026-01-01T00:00:00Z",
      data: { email_id: "em_1", to: "x@y.com" },
    });
    const signature = await svixSign(rawBody, svixId, svixTimestamp, secretB64);

    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody,
      headers: {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": signature,
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context, logs } = makeContext();

    const response = await resendWebhook(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    // event.type was email.delivered which falls into default branch — info log
    expect(logs.some((l) => l.level === "info" || l.level === "log")).toBe(true);
  });

  it("logs a warning for email.bounced events and still acks", async () => {
    env.RESEND_WEBHOOK_SECRET = fullSecret;
    const svixId = "msg_bounce";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({
      type: "email.bounced",
      created_at: "x",
      data: {
        email_id: "em_b",
        bounce: { type: "Permanent", subType: "General", message: "boom" },
      },
    });
    const signature = await svixSign(rawBody, svixId, svixTimestamp, secretB64);

    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody,
      headers: {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": signature,
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context, logs } = makeContext();

    const response = await resendWebhook(request, context);
    expect(response.status).toBe(200);
    expect(logs.some((l) => l.level === "warn")).toBe(true);
  });

  it("rejects a request with a tampered signature (401)", async () => {
    env.RESEND_WEBHOOK_SECRET = fullSecret;
    const svixId = "msg_test_2";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({
      type: "email.delivered",
      created_at: "x",
      data: { email_id: "em" },
    });

    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody,
      headers: {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        // Tampered: wrong signature
        "svix-signature": "v1,deadbeef",
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await resendWebhook(request, context);
    expect(response.status).toBe(401);
  });

  it("rejects when the svix-* headers are missing entirely", async () => {
    env.RESEND_WEBHOOK_SECRET = fullSecret;
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: "{}",
      headers: { "content-type": "application/json" },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await resendWebhook(request, context);
    expect(response.status).toBe(401);
  });

  it("returns 503 when RESEND_WEBHOOK_SECRET is not configured", async () => {
    delete env.RESEND_WEBHOOK_SECRET;
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: "{}",
      headers: {
        "svix-id": "x",
        "svix-timestamp": "0",
        "svix-signature": "v1,xx",
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await resendWebhook(request, context);
    expect(response.status).toBe(503);
  });

  it("acks (200) for an unknown event type with valid signature", async () => {
    env.RESEND_WEBHOOK_SECRET = fullSecret;
    const svixId = "msg_unknown";
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({
      type: "email.unknown_event",
      created_at: "x",
      data: {},
    });
    const signature = await svixSign(rawBody, svixId, svixTimestamp, secretB64);

    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody,
      headers: {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": signature,
        "content-type": "application/json",
      },
      anonymous: true,
    });
    const { context } = makeContext();

    const response = await resendWebhook(request, context);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
