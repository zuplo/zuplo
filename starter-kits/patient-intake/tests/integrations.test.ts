import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import { checkStediEligibility } from "../modules/integrations/stedi.ts";
import {
  sendDocuSignEnvelope,
  getDocuSignSigningUrl,
} from "../modules/integrations/docusign.ts";
import {
  startTwilioVerification,
  checkTwilioVerification,
} from "../modules/integrations/twilio.ts";

/**
 * The runtime-stub copies process.env into a plain `environment` object at
 * module-load time. Integration code reads from that object, so tests must
 * mutate it directly (mutating process.env has no effect after load).
 */
const env = environment as Record<string, string | undefined>;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete env[name];
    delete process.env[name];
  } else {
    env[name] = value;
    process.env[name] = value;
  }
}

describe("integrations/stedi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("STEDI_API_KEY", undefined);
  });

  it("POSTs to /v3/eligibility with the correct body shape and headers", async () => {
    setEnv("STEDI_API_KEY", "stedi_test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          meta: { traceId: "trace-1" },
          benefitsInformation: [
            { code: "1", name: "Health Plan", serviceTypeCodes: ["30"] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await checkStediEligibility({
      tradingPartnerServiceId: "BCBSF",
      provider: { organizationName: "Demo Clinic", npi: "1111111111" },
      subscriber: {
        memberId: "MEM-9001",
        firstName: "Ada",
        lastName: "Lovelace",
        dateOfBirth: "1990-01-01",
      },
      encounter: { serviceTypeCodes: ["30"], dateOfService: "2025-12-01" },
    });

    expect(result.active).toBe(true);
    expect(result.inactive).toBe(false);
    expect(result.planDescription).toBe("Health Plan");
    expect(result.traceId).toBe("trace-1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://healthcare.us.stedi.com/v3/eligibility");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Key stedi_test");
    expect(headers.get("content-type")).toBe("application/json");

    const body = JSON.parse((init as RequestInit).body as string);
    expect(typeof body.controlNumber).toBe("string");
    expect(body.controlNumber).toMatch(/^\d{9}$/);
    expect(body.tradingPartnerServiceId).toBe("BCBSF");
    expect(body.provider.npi).toBe("1111111111");
    expect(body.subscriber.memberId).toBe("MEM-9001");
    expect(body.subscriber.firstName).toBe("Ada");
    expect(body.subscriber.dateOfBirth).toBe("1990-01-01");
    expect(body.encounter.serviceTypeCodes).toEqual(["30"]);
  });

  it("flags inactive when payer returns code 6", async () => {
    setEnv("STEDI_API_KEY", "stedi_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          meta: { traceId: "trace-2" },
          benefitsInformation: [{ code: "6", name: "Inactive plan" }],
        }),
        { status: 200 },
      ),
    );

    const result = await checkStediEligibility({
      tradingPartnerServiceId: "AETNA",
      provider: { npi: "9999" },
      subscriber: {
        memberId: "X",
        firstName: "Z",
        lastName: "Q",
        dateOfBirth: "1980-01-01",
      },
    });
    expect(result.active).toBe(false);
    expect(result.inactive).toBe(true);
    expect(result.planDescription).toBe("Inactive plan");
  });

  it("throws on non-2xx", async () => {
    setEnv("STEDI_API_KEY", "stedi_test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    await expect(
      checkStediEligibility({
        tradingPartnerServiceId: "X",
        provider: { npi: "1" },
        subscriber: {
          memberId: "1",
          firstName: "A",
          lastName: "B",
          dateOfBirth: "2000-01-01",
        },
      }),
    ).rejects.toThrow(/Stedi eligibility check failed: 403/);
  });

  it("throws when STEDI_API_KEY is unset", async () => {
    setEnv("STEDI_API_KEY", undefined);
    await expect(
      checkStediEligibility({
        tradingPartnerServiceId: "X",
        provider: { npi: "1" },
        subscriber: {
          memberId: "1",
          firstName: "A",
          lastName: "B",
          dateOfBirth: "2000-01-01",
        },
      }),
    ).rejects.toThrow(/STEDI_API_KEY/);
  });
});

describe("integrations/docusign", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("DOCUSIGN_ACCESS_TOKEN", undefined);
    setEnv("DOCUSIGN_BASE_URL", undefined);
  });

  it("sendDocuSignEnvelope POSTs to /envelopes with templateRoles + tabs", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    setEnv("DOCUSIGN_BASE_URL", "https://demo.docusign.net/restapi");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          envelopeId: "env-1",
          uri: "/envelopes/env-1",
          statusDateTime: "2025-12-01T00:00:00Z",
          status: "sent",
        }),
        { status: 201 },
      ),
    );

    const result = await sendDocuSignEnvelope({
      accountId: "acct-1",
      templateId: "tpl-1",
      signer: {
        name: "Ada",
        email: "ada@example.com",
        roleName: "Patient",
        clientUserId: "client-1",
      },
      prefill: { patientId: "pt-1", consentKind: "hipaa" },
      emailSubject: "Sign these",
    });
    expect(result.envelopeId).toBe("env-1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://demo.docusign.net/restapi/v2.1/accounts/acct-1/envelopes",
    );
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ds_token");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.templateId).toBe("tpl-1");
    expect(body.status).toBe("sent");
    expect(body.emailSubject).toBe("Sign these");
    expect(body.templateRoles).toHaveLength(1);
    expect(body.templateRoles[0].email).toBe("ada@example.com");
    expect(body.templateRoles[0].clientUserId).toBe("client-1");
    expect(body.templateRoles[0].tabs.textTabs).toEqual([
      { tabLabel: "patientId", value: "pt-1" },
      { tabLabel: "consentKind", value: "hipaa" },
    ]);
  });

  it("getDocuSignSigningUrl POSTs to recipient view with returnUrl", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://signing.example/abc" }), {
        status: 200,
      }),
    );

    const result = await getDocuSignSigningUrl({
      accountId: "acct-1",
      envelopeId: "env-1",
      signer: { name: "Ada", email: "a@b.com", clientUserId: "c-1" },
      returnUrl: "https://kit.test/done",
    });
    expect(result.url).toBe("https://signing.example/abc");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(
      "/v2.1/accounts/acct-1/envelopes/env-1/views/recipient",
    );
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.returnUrl).toBe("https://kit.test/done");
    expect(body.clientUserId).toBe("c-1");
    expect(body.email).toBe("a@b.com");
  });

  it("sendDocuSignEnvelope throws on non-2xx", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("denied", { status: 401 }),
    );
    await expect(
      sendDocuSignEnvelope({
        accountId: "a",
        templateId: "t",
        signer: { name: "n", email: "e", roleName: "r" },
      }),
    ).rejects.toThrow(/DocuSign envelope creation failed: 401/);
  });

  it("getDocuSignSigningUrl throws on non-2xx", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("oops", { status: 500 }),
    );
    await expect(
      getDocuSignSigningUrl({
        accountId: "a",
        envelopeId: "e",
        signer: { name: "n", email: "e", clientUserId: "c" },
        returnUrl: "https://x",
      }),
    ).rejects.toThrow(/DocuSign recipient view failed: 500/);
  });

  it("sendDocuSignEnvelope throws when DOCUSIGN_ACCESS_TOKEN is unset", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", undefined);
    await expect(
      sendDocuSignEnvelope({
        accountId: "a",
        templateId: "t",
        signer: { name: "n", email: "e", roleName: "r" },
      }),
    ).rejects.toThrow(/DOCUSIGN_ACCESS_TOKEN/);
  });

  it("getDocuSignSigningUrl throws when DOCUSIGN_ACCESS_TOKEN is unset", async () => {
    setEnv("DOCUSIGN_ACCESS_TOKEN", undefined);
    await expect(
      getDocuSignSigningUrl({
        accountId: "a",
        envelopeId: "e",
        signer: { name: "n", email: "e", clientUserId: "c" },
        returnUrl: "https://x",
      }),
    ).rejects.toThrow(/DOCUSIGN_ACCESS_TOKEN/);
  });
});

describe("integrations/twilio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("TWILIO_ACCOUNT_SID", undefined);
    setEnv("TWILIO_AUTH_TOKEN", undefined);
    setEnv("TWILIO_VERIFY_SERVICE_SID", undefined);
  });

  it("startTwilioVerification POSTs form-urlencoded with basic auth", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "token-xyz");
    setEnv("TWILIO_VERIFY_SERVICE_SID", "VAtest");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "VEabc",
          to: "+15551234567",
          channel: "sms",
          status: "pending",
          valid: false,
          date_created: "2025-01-01T00:00:00Z",
          date_updated: "2025-01-01T00:00:00Z",
        }),
        { status: 201 },
      ),
    );

    const result = await startTwilioVerification({ to: "+15551234567" });
    expect(result.sid).toBe("VEabc");
    expect(result.status).toBe("pending");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://verify.twilio.com/v2/Services/VAtest/Verifications");
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(headers.get("authorization")).toBe(
      `Basic ${btoa("ACtest:token-xyz")}`,
    );
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get("To")).toBe("+15551234567");
    expect(params.get("Channel")).toBe("sms");
  });

  it("checkTwilioVerification posts To+Code", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "token");
    setEnv("TWILIO_VERIFY_SERVICE_SID", "VAtest");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "VC1",
          to: "+1",
          channel: "sms",
          status: "approved",
          valid: true,
        }),
        { status: 200 },
      ),
    );

    const result = await checkTwilioVerification({ to: "+1", code: "1234" });
    expect(result.valid).toBe(true);
    expect(result.status).toBe("approved");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://verify.twilio.com/v2/Services/VAtest/VerificationCheck",
    );
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get("To")).toBe("+1");
    expect(params.get("Code")).toBe("1234");
  });

  it("startTwilioVerification throws on non-2xx", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "AC");
    setEnv("TWILIO_AUTH_TOKEN", "T");
    setEnv("TWILIO_VERIFY_SERVICE_SID", "VA");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad", { status: 400 }),
    );
    await expect(
      startTwilioVerification({ to: "+1" }),
    ).rejects.toThrow(/Twilio Verify start failed: 400/);
  });

  it("checkTwilioVerification throws on non-2xx", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "AC");
    setEnv("TWILIO_AUTH_TOKEN", "T");
    setEnv("TWILIO_VERIFY_SERVICE_SID", "VA");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 404 }),
    );
    await expect(
      checkTwilioVerification({ to: "+1", code: "x" }),
    ).rejects.toThrow(/Twilio Verify check failed: 404/);
  });

  it("throws when TWILIO_ACCOUNT_SID is unset", async () => {
    setEnv("TWILIO_ACCOUNT_SID", undefined);
    setEnv("TWILIO_AUTH_TOKEN", "T");
    setEnv("TWILIO_VERIFY_SERVICE_SID", "VA");
    await expect(startTwilioVerification({ to: "+1" })).rejects.toThrow(
      /TWILIO_ACCOUNT_SID/,
    );
  });

  it("throws when TWILIO_VERIFY_SERVICE_SID is unset", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "AC");
    setEnv("TWILIO_AUTH_TOKEN", "T");
    setEnv("TWILIO_VERIFY_SERVICE_SID", undefined);
    await expect(startTwilioVerification({ to: "+1" })).rejects.toThrow(
      /TWILIO_VERIFY_SERVICE_SID/,
    );
  });
});
