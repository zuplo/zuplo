import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  createDocuSignEnvelope,
  getDocuSignEnvelopeStatus,
  voidDocuSignEnvelope,
} from "../modules/integrations/docusign.ts";
import {
  createGCalEvent,
  deleteGCalEvent,
} from "../modules/integrations/google-calendar.ts";
import { sendResendEmail } from "../modules/integrations/resend.ts";

const env = environment as Record<string, string | undefined>;

function setEnv(key: string, value: string) {
  env[key] = value;
}
function clearEnv(...keys: string[]) {
  for (const k of keys) delete env[k];
}

describe("integrations/docusign", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv(
      "DOCUSIGN_BASE_URL",
      "DOCUSIGN_ACCOUNT_ID",
      "DOCUSIGN_ACCESS_TOKEN",
    );
  });

  it("createDocuSignEnvelope POSTs to /envelopes with bearer auth and returns envelopeId", async () => {
    setEnv("DOCUSIGN_BASE_URL", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "act_1");
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          envelopeId: "env_1",
          status: "sent",
          statusDateTime: "2026-02-01T15:00:00Z",
          uri: "/envelopes/env_1",
        }),
        { status: 201 },
      ),
    );

    const r = await createDocuSignEnvelope({
      emailSubject: "Sign me",
      documents: [{ documentBase64: "cGRm", name: "Doc.pdf", fileExtension: "pdf" }],
      signers: [{ email: "client@example.com", name: "Client", signHerePlaceholder: "/s1/" }],
    });

    expect(r.envelopeId).toBe("env_1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://demo.docusign.net/restapi/v2.1/accounts/act_1/envelopes",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ds_token");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.emailSubject).toBe("Sign me");
    expect(body.recipients.signers).toHaveLength(1);
    expect(body.recipients.signers[0].tabs.signHereTabs[0].anchorString).toBe("/s1/");
  });

  it("createDocuSignEnvelope throws on non-2xx", async () => {
    setEnv("DOCUSIGN_BASE_URL", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "act_1");
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("auth failed", { status: 401 }),
    );

    await expect(
      createDocuSignEnvelope({
        emailSubject: "x",
        documents: [],
        signers: [{ email: "x@y.com", name: "x" }],
      }),
    ).rejects.toThrow(/401/);
  });

  it("createDocuSignEnvelope throws when DOCUSIGN_ACCESS_TOKEN is unset", async () => {
    setEnv("DOCUSIGN_BASE_URL", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "act_1");
    clearEnv("DOCUSIGN_ACCESS_TOKEN");

    await expect(
      createDocuSignEnvelope({
        emailSubject: "x",
        documents: [],
        signers: [{ email: "x@y.com", name: "x" }],
      }),
    ).rejects.toThrow(/DOCUSIGN_ACCESS_TOKEN/);
  });

  it("getDocuSignEnvelopeStatus GETs and returns status", async () => {
    setEnv("DOCUSIGN_BASE_URL", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "act_1");
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          envelopeId: "env_1",
          status: "completed",
          statusDateTime: "2026-02-02T00:00:00Z",
        }),
        { status: 200 },
      ),
    );

    const r = await getDocuSignEnvelopeStatus("env_1");
    expect(r.status).toBe("completed");
  });

  it("voidDocuSignEnvelope PUTs voided status", async () => {
    setEnv("DOCUSIGN_BASE_URL", "https://demo.docusign.net");
    setEnv("DOCUSIGN_ACCOUNT_ID", "act_1");
    setEnv("DOCUSIGN_ACCESS_TOKEN", "ds_token");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));

    await voidDocuSignEnvelope("env_1", "duplicate");

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe("PUT");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.status).toBe("voided");
    expect(body.voidedReason).toBe("duplicate");
  });
});

describe("integrations/google-calendar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "GOOGLE_CALENDAR_ID");
  });

  it("createGCalEvent POSTs with bearer auth", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "evt_1", htmlLink: "https://x" }), { status: 200 }),
    );

    const e = await createGCalEvent({
      summary: "Hearing",
      start: { date: "2026-03-01" },
      end: { date: "2026-03-01" },
    });

    expect(e.id).toBe("evt_1");
    const headers = new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("authorization")).toBe("Bearer ya29.test");
  });

  it("createGCalEvent throws on non-2xx", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 403 }));

    await expect(
      createGCalEvent({
        summary: "x",
        start: { dateTime: "2026-03-01T00:00:00Z" },
        end: { dateTime: "2026-03-01T00:30:00Z" },
      }),
    ).rejects.toThrow(/403/);
  });

  it("createGCalEvent throws when token is unset", async () => {
    clearEnv("GOOGLE_CALENDAR_ACCESS_TOKEN");
    await expect(
      createGCalEvent({
        summary: "x",
        start: { date: "2026-03-01" },
        end: { date: "2026-03-01" },
      }),
    ).rejects.toThrow(/GOOGLE_CALENDAR_ACCESS_TOKEN/);
  });

  it("deleteGCalEvent treats 410 as success (idempotent)", async () => {
    setEnv("GOOGLE_CALENDAR_ACCESS_TOKEN", "ya29.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 410 }));
    await expect(deleteGCalEvent("evt")).resolves.toBeUndefined();
  });
});

describe("integrations/resend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv("RESEND_API_KEY", "RESEND_FROM_EMAIL");
  });

  it("POSTs to /emails with bearer auth", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "id_1" }), { status: 200 }),
    );

    await sendResendEmail({ to: "x@y.com", subject: "hi", text: "hi" });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
  });

  it("throws on non-2xx", async () => {
    setEnv("RESEND_API_KEY", "re_test");
    setEnv("RESEND_FROM_EMAIL", "noreply@example.com");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    await expect(sendResendEmail({ to: "x@y.com", subject: "hi" })).rejects.toThrow(/500/);
  });

  it("throws when RESEND_API_KEY is unset", async () => {
    clearEnv("RESEND_API_KEY");
    await expect(sendResendEmail({ to: "x@y.com", subject: "hi" })).rejects.toThrow(
      /RESEND_API_KEY/,
    );
  });
});
