import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeContext, makeRequest } from "@zuplo/starter-kit-shared/testing";
import resendWebhook from "../modules/webhooks/resend.ts";
import twilioWebhook from "../modules/webhooks/twilio.ts";

async function signResend(
  body: string,
  secret: string,
  id: string,
  ts: string,
): Promise<string> {
  const stripped = secret.replace(/^whsec_/, "");
  const keyBytes = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0));
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    enc.encode(`${id}.${ts}.${body}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function signTwilio(
  fullUrl: string,
  params: Record<string, string>,
  authToken: string,
): Promise<string> {
  const enc = new TextEncoder();
  let payload = fullUrl;
  for (const k of Object.keys(params).sort()) payload += k + params[k];
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

describe("webhooks/resend", () => {
  const rawSecret = "abcdefghijklmnop";
  const secret = `whsec_${btoa(rawSecret)}`;

  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SIGNING_SECRET = secret;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_WEBHOOK_SIGNING_SECRET;
  });

  it("with valid signature accepts known events (warns on bounce)", async () => {
    const body = JSON.stringify({
      type: "email.bounced",
      data: {
        email_id: "msg_1",
        to: ["alice@x.com"],
        bounce: { type: "Permanent" },
      },
    });
    const id = "evt_1";
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signResend(body, secret, id, ts);
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: body,
      headers: {
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": `v1,${sig}`,
      },
      anonymous: true,
    });
    const response = await resendWebhook(request, context);
    expect(response.status).toBe(200);
    const warnLog = logs.find((l) => l.level === "warn");
    expect(warnLog).toBeDefined();
    expect(
      warnLog!.messages.some((m) => String(m).includes("email.bounced")),
    ).toBe(true);
  });

  it("returns 400 when svix headers are missing", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: "{}",
      anonymous: true,
    });
    const response = await resendWebhook(request, context);
    expect(response.status).toBe(400);
  });

  it("returns 401 when signature is invalid", async () => {
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: '{"type":"email.bounced","data":{}}',
      headers: {
        "svix-id": "evt_1",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,WRONG=",
      },
      anonymous: true,
    });
    const response = await resendWebhook(request, context);
    expect(response.status).toBe(401);
    const warnLog = logs.find(
      (l) =>
        l.level === "warn" && l.messages.some((m) => String(m).includes("email")),
    );
    expect(warnLog).toBeUndefined();
  });

  it("with valid signature but unknown event type returns 200 + logs ignored", async () => {
    const body = `{"type":"email.something_new","data":{}}`;
    const id = "evt_2";
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await signResend(body, secret, id, ts);
    const { context, logs } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/resend",
      method: "POST",
      rawBody: body,
      headers: {
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": `v1,${sig}`,
      },
      anonymous: true,
    });
    const response = await resendWebhook(request, context);
    expect(response.status).toBe(200);
    const ignoredLog = logs.find(
      (l) =>
        l.level === "info" &&
        l.messages.some((m) => String(m).includes("Resend event ignored")),
    );
    expect(ignoredLog).toBeDefined();
  });
});

describe("webhooks/twilio", () => {
  beforeEach(() => {
    process.env.TWILIO_AUTH_TOKEN = "tok-secret";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  it("with valid signature accepts a 'delivered' status", async () => {
    const params = { MessageSid: "SM_1", MessageStatus: "delivered" };
    const fullUrl = "https://kit.test/webhooks/twilio";
    const sig = await signTwilio(fullUrl, params, "tok-secret");
    const body = new URLSearchParams(params).toString();

    const { context, logs } = makeContext();
    const request = makeRequest({
      url: fullUrl,
      method: "POST",
      rawBody: body,
      headers: {
        "x-twilio-signature": sig,
        // Force the handler to use the same URL we signed.
        host: "kit.test",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "kit.test",
        "content-type": "application/x-www-form-urlencoded",
      },
      anonymous: true,
    });
    const response = await twilioWebhook(request, context);
    expect(response.status).toBe(200);
    const infoLog = logs.find(
      (l) =>
        l.level === "info" &&
        l.messages.some((m) => String(m).includes("delivered")),
    );
    expect(infoLog).toBeDefined();
  });

  it("with valid signature warns on 'failed' status (unknown final state)", async () => {
    const params = {
      MessageSid: "SM_2",
      MessageStatus: "failed",
      ErrorCode: "30005",
    };
    const fullUrl = "https://kit.test/webhooks/twilio";
    const sig = await signTwilio(fullUrl, params, "tok-secret");
    const body = new URLSearchParams(params).toString();

    const { context, logs } = makeContext();
    const request = makeRequest({
      url: fullUrl,
      method: "POST",
      rawBody: body,
      headers: {
        "x-twilio-signature": sig,
        "x-forwarded-proto": "https",
        "x-forwarded-host": "kit.test",
        "content-type": "application/x-www-form-urlencoded",
      },
      anonymous: true,
    });
    const response = await twilioWebhook(request, context);
    expect(response.status).toBe(200);
    const warnLog = logs.find(
      (l) => l.level === "warn" && l.messages.some((m) => String(m).includes("failed")),
    );
    expect(warnLog).toBeDefined();
  });

  it("returns 401 on bad signature", async () => {
    const params = { MessageSid: "SM_3", MessageStatus: "delivered" };
    const body = new URLSearchParams(params).toString();
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/twilio",
      method: "POST",
      rawBody: body,
      headers: {
        "x-twilio-signature": "BAD",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "kit.test",
      },
      anonymous: true,
    });
    const response = await twilioWebhook(request, context);
    expect(response.status).toBe(401);
  });

  it("returns 400 when signature header is missing", async () => {
    const { context } = makeContext();
    const request = makeRequest({
      url: "https://kit.test/webhooks/twilio",
      method: "POST",
      rawBody: "MessageSid=SM_4&MessageStatus=delivered",
      anonymous: true,
    });
    const response = await twilioWebhook(request, context);
    expect(response.status).toBe(400);
  });

  it("with valid signature, unknown statuses log info but still 200", async () => {
    const params = { MessageSid: "SM_5", MessageStatus: "queued" };
    const fullUrl = "https://kit.test/webhooks/twilio";
    const sig = await signTwilio(fullUrl, params, "tok-secret");
    const body = new URLSearchParams(params).toString();

    const { context, logs } = makeContext();
    const request = makeRequest({
      url: fullUrl,
      method: "POST",
      rawBody: body,
      headers: {
        "x-twilio-signature": sig,
        "x-forwarded-proto": "https",
        "x-forwarded-host": "kit.test",
      },
      anonymous: true,
    });
    const response = await twilioWebhook(request, context);
    expect(response.status).toBe(200);
    const infoLog = logs.find(
      (l) =>
        l.level === "info" && l.messages.some((m) => String(m).includes("queued")),
    );
    expect(infoLog).toBeDefined();
  });
});
