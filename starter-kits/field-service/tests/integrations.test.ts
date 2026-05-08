import { afterEach, describe, expect, it, vi } from "vitest";
import { environment } from "@zuplo/runtime";
import {
  geocodeMapboxAddress,
  getMapboxMatrix,
  greedyNearestNeighborOrder,
} from "../modules/integrations/mapbox.ts";
import { presignR2PutUrl } from "../modules/integrations/r2.ts";
import { sendTwilioSms } from "../modules/integrations/twilio.ts";

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


describe("integrations/mapbox", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("MAPBOX_ACCESS_TOKEN", undefined);
  });

  it("geocodeMapboxAddress hits the geocoding endpoint with the access_token", async () => {
    setEnv("MAPBOX_ACCESS_TOKEN", "pk.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              center: [-122.4, 37.78],
              place_name: "1 Main St, San Francisco, CA",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const out = await geocodeMapboxAddress("1 Main St SF");
    expect(out).not.toBeNull();
    expect(out!.longitude).toBe(-122.4);
    expect(out!.latitude).toBe(37.78);
    expect(out!.placeName).toBe("1 Main St, San Francisco, CA");

    const [url] = fetchMock.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.host).toBe("api.mapbox.com");
    expect(u.pathname).toBe("/geocoding/v5/mapbox.places/1%20Main%20St%20SF.json");
    expect(u.searchParams.get("access_token")).toBe("pk.test");
    expect(u.searchParams.get("limit")).toBe("1");
  });

  it("geocodeMapboxAddress returns null when no features match", async () => {
    setEnv("MAPBOX_ACCESS_TOKEN", "pk.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ features: [] }), { status: 200 }),
    );
    const out = await geocodeMapboxAddress("garbage address");
    expect(out).toBeNull();
  });

  it("geocodeMapboxAddress throws on non-2xx", async () => {
    setEnv("MAPBOX_ACCESS_TOKEN", "pk.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(geocodeMapboxAddress("x")).rejects.toThrow(
      /Mapbox geocode failed: 500/,
    );
  });

  it("getMapboxMatrix builds the matrix URL with profile + coords + access_token", async () => {
    setEnv("MAPBOX_ACCESS_TOKEN", "pk.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          durations: [
            [0, 600, 1200],
            [600, 0, 800],
            [1200, 800, 0],
          ],
          distances: [
            [0, 1000, 5000],
            [1000, 0, 4000],
            [5000, 4000, 0],
          ],
        }),
        { status: 200 },
      ),
    );
    const out = await getMapboxMatrix({
      coordinates: [
        [-122.4, 37.78],
        [-122.41, 37.79],
        [-122.42, 37.8],
      ],
    });
    expect(out.durations[0][1]).toBe(600);

    const [url] = fetchMock.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.pathname).toBe(
      "/directions-matrix/v1/mapbox/driving/-122.4,37.78;-122.41,37.79;-122.42,37.8",
    );
    expect(u.searchParams.get("access_token")).toBe("pk.test");
  });

  it("getMapboxMatrix rejects fewer than 2 or more than 25 coordinates", async () => {
    setEnv("MAPBOX_ACCESS_TOKEN", "pk.test");
    await expect(getMapboxMatrix({ coordinates: [[0, 0]] })).rejects.toThrow(
      /at least 2/,
    );
    const tooMany: Array<[number, number]> = Array.from({ length: 26 }, (_, i) => [
      i,
      i,
    ]);
    await expect(getMapboxMatrix({ coordinates: tooMany })).rejects.toThrow(
      /up to 25/,
    );
  });

  it("getMapboxMatrix throws on non-2xx", async () => {
    setEnv("MAPBOX_ACCESS_TOKEN", "pk.test");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 429 }),
    );
    await expect(
      getMapboxMatrix({
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).rejects.toThrow(/Mapbox matrix failed: 429/);
  });

  it("throws when MAPBOX_ACCESS_TOKEN is unset", async () => {
    setEnv("MAPBOX_ACCESS_TOKEN", undefined);
    await expect(geocodeMapboxAddress("x")).rejects.toThrow(
      /MAPBOX_ACCESS_TOKEN/,
    );
  });

  it("greedyNearestNeighborOrder picks the cheapest next stop", () => {
    const durations = [
      [0, 50, 10, 30],
      [50, 0, 20, 40],
      [10, 20, 0, 60],
      [30, 40, 60, 0],
    ];
    const order = greedyNearestNeighborOrder(durations, 0);
    // From 0: nearest = 2 (10) → from 2: nearest = 1 (20) → from 1: 3 (40).
    expect(order).toEqual([0, 2, 1, 3]);
  });

  it("greedyNearestNeighborOrder handles disconnected stops by appending in declared order", () => {
    const durations = [
      [0, 5, null],
      [5, 0, null],
      [null, null, 0],
    ];
    const order = greedyNearestNeighborOrder(durations, 0);
    expect(order[0]).toBe(0);
    expect(order[1]).toBe(1);
    expect(order[2]).toBe(2);
  });
});

describe("integrations/r2 (presigned PUT URL)", () => {
  afterEach(() => {
    setEnv("R2_ACCOUNT_ID", undefined);
    setEnv("R2_ACCESS_KEY_ID", undefined);
    setEnv("R2_SECRET_ACCESS_KEY", undefined);
    setEnv("R2_BUCKET", undefined);
    setEnv("R2_PUBLIC_BASE_URL", undefined);
  });

  it("returns a presigned URL with the right host + AWS SigV4 query params", async () => {
    setEnv("R2_ACCOUNT_ID", "acct123");
    setEnv("R2_ACCESS_KEY_ID", "AKIAEXAMPLE");
    setEnv("R2_SECRET_ACCESS_KEY", "secretexample");
    setEnv("R2_BUCKET", "field-photos");

    const out = await presignR2PutUrl({
      key: "tenants/tenant-a/jobs/job-1/photo.jpg",
      contentType: "image/jpeg",
      expiresInSeconds: 600,
    });

    expect(out.bucket).toBe("field-photos");
    expect(out.expiresInSeconds).toBe(600);

    const u = new URL(out.uploadUrl);
    expect(u.host).toBe("acct123.r2.cloudflarestorage.com");
    expect(u.pathname).toBe(
      "/field-photos/tenants/tenant-a/jobs/job-1/photo.jpg",
    );
    expect(u.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(u.searchParams.get("X-Amz-Date")).toMatch(/^\d{8}T\d{6}Z$/);
    expect(u.searchParams.get("X-Amz-Expires")).toBe("600");
    const credential = u.searchParams.get("X-Amz-Credential")!;
    expect(credential).toMatch(
      /^AKIAEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/,
    );
    const signedHeaders = u.searchParams.get("X-Amz-SignedHeaders")!;
    // host;content-type sorted alphabetically => content-type;host
    expect(signedHeaders).toBe("content-type;host");
    // Signature: 64 hex chars (HMAC-SHA256).
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);

    expect(out.signedHeaders.host).toBe("acct123.r2.cloudflarestorage.com");
    expect(out.signedHeaders["content-type"]).toBe("image/jpeg");
  });

  it("two consecutive calls produce different signatures (date/time changes)", async () => {
    setEnv("R2_ACCOUNT_ID", "acct");
    setEnv("R2_ACCESS_KEY_ID", "AKIA");
    setEnv("R2_SECRET_ACCESS_KEY", "secret");
    setEnv("R2_BUCKET", "b");

    const a = await presignR2PutUrl({ key: "k.jpg", contentType: "image/jpeg" });
    // Wait 1.1s so the AMZ date second-component ticks forward.
    await new Promise((r) => setTimeout(r, 1100));
    const b = await presignR2PutUrl({ key: "k.jpg", contentType: "image/jpeg" });

    const aUrl = new URL(a.uploadUrl);
    const bUrl = new URL(b.uploadUrl);
    const aDate = aUrl.searchParams.get("X-Amz-Date")!;
    const bDate = bUrl.searchParams.get("X-Amz-Date")!;
    const aSig = aUrl.searchParams.get("X-Amz-Signature")!;
    const bSig = bUrl.searchParams.get("X-Amz-Signature")!;
    expect(aDate).not.toBe(bDate);
    expect(aSig).not.toBe(bSig);
  });

  it("derives the public URL from R2_PUBLIC_BASE_URL when set", async () => {
    setEnv("R2_ACCOUNT_ID", "acct");
    setEnv("R2_ACCESS_KEY_ID", "AKIA");
    setEnv("R2_SECRET_ACCESS_KEY", "secret");
    setEnv("R2_BUCKET", "b");
    setEnv("R2_PUBLIC_BASE_URL", "https://cdn.kit.test");

    const out = await presignR2PutUrl({ key: "subdir/photo.png" });
    expect(out.publicUrl).toBe("https://cdn.kit.test/subdir/photo.png");
  });

  it("clamps expiresInSeconds to safe bounds", async () => {
    setEnv("R2_ACCOUNT_ID", "acct");
    setEnv("R2_ACCESS_KEY_ID", "AKIA");
    setEnv("R2_SECRET_ACCESS_KEY", "secret");
    setEnv("R2_BUCKET", "b");

    const tooLow = await presignR2PutUrl({ key: "x", expiresInSeconds: 1 });
    expect(tooLow.expiresInSeconds).toBe(60);
    const tooHigh = await presignR2PutUrl({
      key: "x",
      expiresInSeconds: 999_999_999,
    });
    expect(tooHigh.expiresInSeconds).toBe(7 * 24 * 3600);
  });

  it("throws when R2 credentials are unset", async () => {
    setEnv("R2_ACCOUNT_ID", undefined);
    setEnv("R2_ACCESS_KEY_ID", "AKIA");
    setEnv("R2_SECRET_ACCESS_KEY", "secret");
    setEnv("R2_BUCKET", "b");
    await expect(presignR2PutUrl({ key: "x" })).rejects.toThrow(
      /R2_ACCOUNT_ID/,
    );
  });
});

describe("integrations/twilio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("TWILIO_ACCOUNT_SID", undefined);
    setEnv("TWILIO_AUTH_TOKEN", undefined);
    setEnv("TWILIO_FROM_NUMBER", undefined);
  });

  it("sendTwilioSms POSTs form-encoded with Basic auth", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "ACtest");
    setEnv("TWILIO_AUTH_TOKEN", "tok");
    setEnv("TWILIO_FROM_NUMBER", "+15555550100");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sid: "SM1",
          status: "queued",
          to: "+1",
          from: "+15555550100",
          body: "x",
        }),
        { status: 201 },
      ),
    );
    const out = await sendTwilioSms({ to: "+15555550101", body: "Hi" });
    expect(out.sid).toBe("SM1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json",
    );
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${btoa("ACtest:tok")}`,
    );
    const params = new URLSearchParams((init as RequestInit).body as string);
    expect(params.get("To")).toBe("+15555550101");
    expect(params.get("Body")).toBe("Hi");
  });

  it("throws on non-2xx", async () => {
    setEnv("TWILIO_ACCOUNT_SID", "AC");
    setEnv("TWILIO_AUTH_TOKEN", "T");
    setEnv("TWILIO_FROM_NUMBER", "+1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    await expect(
      sendTwilioSms({ to: "+1", body: "x" }),
    ).rejects.toThrow(/Twilio SMS send failed: 500/);
  });

  it("throws when TWILIO_ACCOUNT_SID is unset", async () => {
    setEnv("TWILIO_ACCOUNT_SID", undefined);
    setEnv("TWILIO_AUTH_TOKEN", "T");
    setEnv("TWILIO_FROM_NUMBER", "+1");
    await expect(sendTwilioSms({ to: "+1", body: "x" })).rejects.toThrow(
      /TWILIO_ACCOUNT_SID/,
    );
  });
});
