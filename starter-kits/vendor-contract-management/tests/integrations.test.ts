import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { postSlackMessage } from "../modules/integrations/slack.ts";
import {
  getDocusignAccessToken,
  createDocusignEnvelope,
} from "../modules/integrations/docusign.ts";

const ENV_KEYS = [
  "SLACK_BOT_TOKEN",
  "SLACK_WEBHOOK_URL",
  "SLACK_DEFAULT_CHANNEL",
  "DOCUSIGN_INTEGRATION_KEY",
  "DOCUSIGN_USER_ID",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_PRIVATE_KEY",
  "DOCUSIGN_OAUTH_HOST",
  "DOCUSIGN_API_BASE_URI",
];
function clearEnv() {
  for (const key of ENV_KEYS) {
    delete (environment as Record<string, string | undefined>)[key];
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  clearEnv();
});

// Generate a fresh RSA keypair for tests so DocuSign JWT signing works.
async function generateRsaPemForTest(): Promise<string> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const b64 = (() => {
    const bytes = new Uint8Array(pkcs8);
    let s = "";
    for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  })();
  // Insert newlines every 64 chars per PEM convention
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
}

describe("integrations/slack", () => {
  it("uses bot token to POST chat.postMessage with custom procurement channel", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const result = await postSlackMessage({ text: "x" });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("#procurement");
  });

  it("falls back to webhook URL", async () => {
    environment.SLACK_WEBHOOK_URL = "https://hooks.slack.com/x";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
    const result = await postSlackMessage({ text: "hi" });
    expect(result.ok).toBe(true);
  });

  it("throws when chat.postMessage returns ok=false", async () => {
    environment.SLACK_BOT_TOKEN = "xoxb-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: "channel_not_found" }),
        { status: 200 },
      ),
    );
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /channel_not_found/,
    );
  });

  it("throws when no Slack credentials configured", async () => {
    await expect(postSlackMessage({ text: "x" })).rejects.toThrow(
      /SLACK_BOT_TOKEN|SLACK_WEBHOOK_URL/,
    );
  });
});

describe("integrations/docusign — getDocusignAccessToken", () => {
  it("mints a JWT and exchanges it for an access token", async () => {
    environment.DOCUSIGN_INTEGRATION_KEY = "iek";
    environment.DOCUSIGN_USER_ID = "uid";
    environment.DOCUSIGN_ACCOUNT_ID = "aid";
    environment.DOCUSIGN_PRIVATE_KEY = await generateRsaPemForTest();

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "at", expires_in: 3600 }),
          { status: 200 },
        ),
      );

    const result = await getDocusignAccessToken();
    expect(result.accessToken).toBe("at");
    expect(result.accountId).toBe("aid");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://account-d.docusign.com/oauth/token");
    expect((init as RequestInit).method).toBe("POST");
    const bodyStr = String((init as RequestInit).body);
    expect(bodyStr).toContain(
      "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer",
    );
    // The JWT assertion has three base64url segments separated by `.`
    const assertion = new URLSearchParams(bodyStr).get("assertion") ?? "";
    expect(assertion.split(".").length).toBe(3);
  });

  it("throws when DocuSign env is unset", async () => {
    await expect(getDocusignAccessToken()).rejects.toThrow(
      /DOCUSIGN_INTEGRATION_KEY|DOCUSIGN_USER_ID|DOCUSIGN_ACCOUNT_ID|DOCUSIGN_PRIVATE_KEY/,
    );
  });

  it("throws on non-2xx token exchange", async () => {
    environment.DOCUSIGN_INTEGRATION_KEY = "iek";
    environment.DOCUSIGN_USER_ID = "uid";
    environment.DOCUSIGN_ACCOUNT_ID = "aid";
    environment.DOCUSIGN_PRIVATE_KEY = await generateRsaPemForTest();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("denied", { status: 401 }),
    );
    await expect(getDocusignAccessToken()).rejects.toThrow(/DocuSign/);
  });
});

describe("integrations/docusign — createDocusignEnvelope", () => {
  it("creates an envelope with bearer auth and JSON body", async () => {
    environment.DOCUSIGN_INTEGRATION_KEY = "iek";
    environment.DOCUSIGN_USER_ID = "uid";
    environment.DOCUSIGN_ACCOUNT_ID = "aid";
    environment.DOCUSIGN_PRIVATE_KEY = await generateRsaPemForTest();
    environment.DOCUSIGN_API_BASE_URI = "https://demo.docusign.net/restapi";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // Token exchange
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "at", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      // Envelope create
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            envelopeId: "env-1",
            status: "sent",
            uri: "/envelopes/env-1",
            statusDateTime: "2026-05-01T00:00:00Z",
          }),
          { status: 201 },
        ),
      );

    const result = await createDocusignEnvelope({
      contractId: "c-1",
      documentName: "MSA.pdf",
      documentBase64: btoa("hello"),
      signers: [{ email: "a@b.com", name: "Alice" }],
    });
    expect(result.envelopeId).toBe("env-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [envUrl, envInit] = fetchMock.mock.calls[1]!;
    expect(String(envUrl)).toBe(
      "https://demo.docusign.net/restapi/v2.1/accounts/aid/envelopes",
    );
    const headers = new Headers((envInit as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer at");
    const envBody = JSON.parse((envInit as RequestInit).body as string);
    expect(envBody.status).toBe("sent");
    expect(envBody.documents.length).toBe(1);
    expect(envBody.recipients.signers[0].email).toBe("a@b.com");
    expect(envBody.customFields.textCustomFields[0].value).toBe("c-1");
  });

  it("throws when neither documentUrl nor documentBase64 is provided", async () => {
    environment.DOCUSIGN_INTEGRATION_KEY = "iek";
    environment.DOCUSIGN_USER_ID = "uid";
    environment.DOCUSIGN_ACCOUNT_ID = "aid";
    environment.DOCUSIGN_PRIVATE_KEY = await generateRsaPemForTest();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "at", expires_in: 3600 }),
        { status: 200 },
      ),
    );
    await expect(
      createDocusignEnvelope({
        contractId: "c-1",
        documentName: "MSA.pdf",
        signers: [{ email: "a@b.com", name: "Alice" }],
      }),
    ).rejects.toThrow(/documentUrl|documentBase64/);
  });

  it("throws on non-2xx envelope create response", async () => {
    environment.DOCUSIGN_INTEGRATION_KEY = "iek";
    environment.DOCUSIGN_USER_ID = "uid";
    environment.DOCUSIGN_ACCOUNT_ID = "aid";
    environment.DOCUSIGN_PRIVATE_KEY = await generateRsaPemForTest();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: "at", expires_in: 3600 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("err", { status: 500 }));
    await expect(
      createDocusignEnvelope({
        contractId: "c-1",
        documentName: "MSA.pdf",
        documentBase64: btoa("x"),
        signers: [{ email: "a@b.com", name: "Alice" }],
      }),
    ).rejects.toThrow(/DocuSign envelope/);
  });
});
